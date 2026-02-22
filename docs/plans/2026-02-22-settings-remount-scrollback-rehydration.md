# Settings Remount Scrollback Rehydration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore terminal scrollback when users navigate away (for example to Settings) and return, while keeping low-bandwidth delta replay for true transport reconnects.

**Architecture:** Split terminal attach into two intents: `cold remount` (new xterm, needs history rehydration) and `warm reconnect` (existing xterm, needs delta only). Keep sequence overlap protections, but stop applying high-water cursor replay semantics to cold remounts. Increase server replay retention to match configured terminal scrollback budget so short away/back flows do not immediately fall off a 256KB cliff.

**Tech Stack:** React 18 + Redux Toolkit + xterm.js (client), Node/Express + ws + terminal stream broker (server), Vitest (unit/e2e-style tests).

---

## Investigation Summary (Root Cause)

1. `Settings` navigation unmounts terminal views (`src/App.tsx:686`), which discards xterm in-memory scrollback.
2. Terminal v2 replay refactor switched attach semantics to sequence delta (`src/components/TerminalView.tsx` from `0323e2f5`), which is correct for warm reconnect but not sufficient for cold remount hydration.
3. Follow-up cursor persistence (`f1d7abad`) made remount attach use high-water `sinceSeq`, which avoids some misses but also prevents full rehydration of prior output after remount.
4. Server replay ring is hard-capped at `256KB` (`server/terminal-stream/replay-ring.ts:9`), so moderate output while away triggers `terminal.output.gap` with `replay_window_exceeded` (`server/terminal-stream/broker.ts:146-173`), matching observed `[Output gap 1-742: reconnect window exceeded]`.

---

### Task 1: Add Failing Client Regression Tests for Cold Remount Behavior

**Files:**
- Modify: `test/unit/client/components/TerminalView.lifecycle.test.tsx`

**Step 1: Write failing test for cold remount attach semantics**

Add a test in the v2 replay suite that:
- mounts a running terminal,
- emits sequenced output (`seq 1..3`),
- unmounts/remounts `TerminalView`,
- asserts remount attach request uses `sinceSeq: 0` (cold hydrate), not prior high-water.

```ts
it('uses sinceSeq=0 on terminal view remount so history can rehydrate into a fresh xterm', async () => {
  const { store, tabId, paneId, terminalId, unmount } = await renderTerminalHarness({ status: 'running', terminalId: 'term-v2-remount-hydrate' })
  messageHandler!({ type: 'terminal.output', terminalId, seqStart: 1, seqEnd: 3, data: 'abc' })
  unmount()
  wsMocks.send.mockClear()

  render(
    <Provider store={store}>
      <TerminalViewFromStore tabId={tabId} paneId={paneId} />
    </Provider>
  )

  await waitFor(() => {
    expect(wsMocks.send).toHaveBeenCalledWith({
      type: 'terminal.attach',
      terminalId,
      sinceSeq: 0,
    })
  })
})
```

**Step 2: Write failing test for warm reconnect still using high-water**

Keep/assert existing reconnect behavior stays delta-based (this should continue to pass once implementation is done).

**Step 3: Run focused test file**

Run: `npm run test -- test/unit/client/components/TerminalView.lifecycle.test.tsx`

Expected: FAIL on remount `sinceSeq` expectation (currently `sinceSeq` is high-water).

**Step 4: Commit failing tests**

```bash
git add test/unit/client/components/TerminalView.lifecycle.test.tsx
git commit -m "test(terminal-view): codify cold-remount attach hydration semantics"
```

---

### Task 2: Implement Client Attach Intent Split (Cold Remount vs Warm Reconnect)

**Files:**
- Modify: `src/components/TerminalView.tsx`
- Optional cleanup: `src/lib/terminal-cursor.ts` (only if needed for dead code simplification)

**Step 1: Introduce explicit attach intent**

```ts
type AttachIntent = 'cold_remount' | 'transport_reconnect'
```

**Step 2: Change attach calculation to be intent-aware**

```ts
function attach(tid: string, intent: AttachIntent) {
  setIsAttaching(true)
  awaitingFreshSequenceRef.current = true

  const persistedSeq = loadTerminalCursor(tid)
  const sinceSeq = intent === 'transport_reconnect'
    ? Math.max(lastSeqRef.current, persistedSeq)
    : 0

  if (intent === 'cold_remount') {
    // New xterm instance has no viewport history; force replay window hydration.
    lastSeqRef.current = 0
  } else {
    lastSeqRef.current = sinceSeq
  }

  ws.send({ type: 'terminal.attach', terminalId: tid, sinceSeq })
}
```

**Step 3: Wire call sites**
- Initial ensure path (`currentTerminalId`) -> `attach(currentTerminalId, 'cold_remount')`
- WS reconnect callback -> `attach(tid, 'transport_reconnect')`

**Step 4: Run focused tests**

Run: `npm run test -- test/unit/client/components/TerminalView.lifecycle.test.tsx`

Expected: PASS.

**Step 5: Commit implementation**

```bash
git add src/components/TerminalView.tsx test/unit/client/components/TerminalView.lifecycle.test.tsx
git commit -m "fix(terminal-view): rehydrate replay window on cold remount while keeping delta reconnect"
```

---

### Task 3: Add Failing Server Tests for Replay Retention Budget

**Files:**
- Modify: `test/unit/server/terminal-stream/replay-ring.test.ts`
- Modify: `test/unit/server/ws-handler-backpressure.test.ts` (broker-focused section)

**Step 1: Add failing ReplayRing resize test**

Add a unit test for runtime budget adjustment (needed for settings-driven behavior):

```ts
it('supports runtime max-byte resize and re-evicts to new budget', () => {
  const ring = new ReplayRing(1024)
  ring.append('x'.repeat(300))
  ring.append('y'.repeat(300))
  ring.append('z'.repeat(300))

  ring.setMaxBytes(400)

  const replay = ring.replaySince(0)
  const total = replay.frames.reduce((sum, f) => sum + f.bytes, 0)
  expect(total).toBeLessThanOrEqual(400)
})
```

**Step 2: Add failing broker retention test (>256KB, <1MB)**

In broker tests, add a fake registry replay budget method and assert no `replay_window_exceeded` for a sequence that should fit in settings-sized budget.

```ts
registry.setReplayRingMaxBytes(1_000_000)
// emit ~400KB total output
await broker.attach(wsReplay as any, 'term-replay-budget', 0)
expect(wsReplay.send).not.toHaveBeenCalledWith(expect.stringContaining('"type":"terminal.output.gap"'))
```

**Step 3: Run focused server tests**

Run:
- `npm run test -- test/unit/server/terminal-stream/replay-ring.test.ts`
- `npm run test -- test/unit/server/ws-handler-backpressure.test.ts`

Expected: FAIL due missing replay ring runtime resizing and broker wiring.

**Step 4: Commit failing tests**

```bash
git add test/unit/server/terminal-stream/replay-ring.test.ts test/unit/server/ws-handler-backpressure.test.ts
git commit -m "test(terminal-stream): lock replay retention behavior for settings-detour reconnects"
```

---

### Task 4: Implement Server Replay Budget Wiring

**Files:**
- Modify: `server/terminal-stream/replay-ring.ts`
- Modify: `server/terminal-stream/broker.ts`
- Modify: `server/terminal-registry.ts`
- Modify: `test/unit/server/terminal-stream/replay-ring.test.ts`
- Modify: `test/unit/server/ws-handler-backpressure.test.ts`

**Step 1: Add runtime budget update API to ReplayRing**

```ts
setMaxBytes(nextMaxBytes?: number): void {
  this.maxBytes = resolveMaxBytes(nextMaxBytes)
  this.evictIfNeeded()
}
```

(If `maxBytes` is `readonly`, make it mutable.)

**Step 2: Expose replay budget from TerminalRegistry**

```ts
getReplayRingMaxBytes(): number {
  return this.scrollbackMaxChars
}
```

**Step 3: Apply budget in broker state creation/attach**

```ts
private resolveReplayRingMaxBytes(): number | undefined {
  const candidate = (this.registry as any).getReplayRingMaxBytes?.()
  return Number.isFinite(candidate) && candidate > 0 ? Math.floor(candidate) : undefined
}

private getOrCreateTerminalState(terminalId: string): BrokerTerminalState {
  const maxBytes = this.resolveReplayRingMaxBytes()
  let state = this.terminals.get(terminalId)
  if (!state) {
    state = { replayRing: new ReplayRing(maxBytes), clients: new Map() }
    this.terminals.set(terminalId, state)
    return state
  }
  state.replayRing.setMaxBytes(maxBytes)
  return state
}
```

**Step 4: Run focused tests**

Run:
- `npm run test -- test/unit/server/terminal-stream/replay-ring.test.ts`
- `npm run test -- test/unit/server/ws-handler-backpressure.test.ts`

Expected: PASS.

**Step 5: Commit implementation**

```bash
git add server/terminal-stream/replay-ring.ts server/terminal-stream/broker.ts server/terminal-registry.ts test/unit/server/terminal-stream/replay-ring.test.ts test/unit/server/ws-handler-backpressure.test.ts
git commit -m "fix(terminal-stream): size replay retention from terminal scrollback budget"
```

---

### Task 5: Add End-to-End Regression for Settings Round-Trip Scrollback

**Files:**
- Create: `test/e2e/terminal-settings-remount-scrollback.test.tsx`
- Modify (if needed): `test/e2e/*` harness mocks for App navigation

**Step 1: Write failing e2e-style scenario**

Scenario:
- render App with one running terminal,
- emit terminal output,
- switch to Settings view,
- return to terminal view,
- assert remount attach uses `sinceSeq: 0`,
- emit replay frames and assert terminal write receives replayed content,
- assert no spurious reconnect-gap marker for this bounded replay case.

**Step 2: Run test and verify fail**

Run: `npm run test -- test/e2e/terminal-settings-remount-scrollback.test.tsx`

Expected: FAIL before implementation is complete.

**Step 3: Adjust implementation/harness for deterministic pass**

Ensure test uses deterministic mock WS harness + RAF flush (pattern from existing `terminal-flaky-network-responsiveness` test).

**Step 4: Re-run test and commit**

```bash
git add test/e2e/terminal-settings-remount-scrollback.test.tsx
git commit -m "test(e2e): cover settings detour remount scrollback rehydration"
```

---

### Task 6: Full Verification, Refactor, and Landing

**Files:**
- Modify: any touched files for cleanup

**Step 1: Refactor pass**
- Remove dead paths/comments made obsolete by intent split.
- Keep attach flow comments explicit about cold vs warm semantics.

**Step 2: Run full project verification**

Run:
- `npm test`
- `npm run build`

Expected: all pass.

**Step 3: Final commit for cleanup/docs (if needed)**

```bash
git add -A
git commit -m "chore(terminal-stream): polish remount hydration flow and regression coverage"
```

---

## Risks and Guardrails

- Risk: sending larger replay windows on remount can spike WS bufferedAmount for many tabs.
  Guardrail: only cold-remount path uses `sinceSeq=0`; warm reconnect remains delta.
- Risk: replay ring memory growth.
  Guardrail: reuse existing scrollback-derived bounds (`TerminalRegistry.computeScrollbackMaxChars`) already clamped to safe min/max.
- Risk: overlap/drop logic regresses.
  Guardrail: keep/extend overlap and stale-sequence tests in `TerminalView.lifecycle`.

---

## Acceptance Criteria

- Navigating `terminal -> settings -> terminal` rehydrates prior scrollback (within configured retained history).
- Warm WS reconnect does not duplicate historical output and still uses high-water `sinceSeq` delta.
- Replay gap events are no longer easy to trigger during short settings detours at default settings.
- Full test suite and build pass.
