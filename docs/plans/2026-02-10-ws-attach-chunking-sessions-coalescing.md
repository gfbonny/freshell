# WS Attach Snapshot Chunking + Sessions Publish Coalescing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate WebSocket backpressure disconnects and reduce update storms by chunking large terminal attach snapshots and coalescing rapid session publish bursts, while preserving all existing product behavior.

**Architecture:** Keep existing terminal/session features and semantics, but change transport behavior under load. Terminal attach snapshots move from one large message to a chunked stream for oversized payloads; normal small snapshots keep current behavior for compatibility. Sessions sync keeps the same patch schema but introduces short publish-window coalescing so repeated indexer updates collapse to the latest state before diff/broadcast.

**Tech Stack:** Node.js, TypeScript, Express, ws WebSocket server, React 18 + xterm.js, Vitest (unit + integration).

---

## Detailed Justification

1. **Current attach transport can exceed safe socket buffer limits.**
- Observed `terminal.attached` payloads around 1.5MB to 1.9MB.
- Observed `ws_backpressure_close` event with buffered bytes > 3.4MB and close code 4008.
- Root cause: `terminal.attached` currently sends full snapshot in one message (`server/ws-handler.ts:865`).

2. **Session updates are emitted too frequently during bursty indexer activity.**
- Observed >200 `sessions.patch` sends in a 10-minute window, many around 300KB+.
- Root cause: every `codingCliIndexer.onUpdate` invokes `sessionsSync.publish` immediately (`server/index.ts:551`), even when updates happen in quick succession.

3. **Performance issue is transport/scheduling, not missing functionality.**
- We do not need to drop sessions, reduce scrollback, or remove patching.
- We can preserve behavior and improve throughput by shaping how data is sent (chunking + coalescing).

4. **This is the most idiomatic near-term fix for current architecture.**
- Existing code already uses chunking strategy for `sessions.updated` (`sendChunkedSessions` in `server/ws-handler.ts`).
- Extending same pattern to terminal snapshots and introducing bounded coalescing is consistent, low-risk, and testable.

## Expected Results

1. **No single oversized terminal attach message:**
- Oversized snapshots are split so each WS frame stays under `MAX_WS_CHUNK_BYTES` envelope.

2. **Lower backpressure disconnect probability:**
- Attach-time send spikes should no longer push client bufferedAmount over backpressure threshold from one snapshot frame.

3. **Lower message churn for session sync bursts:**
- Rapid indexer updates should collapse to one publish per coalescing window (instead of one publish per update callback).

4. **Preserved UX and semantics:**
- Attach still renders historical snapshot before queued live output.
- Sessions patch behavior and client state model remain functionally unchanged.

5. **Quantitative acceptance targets (post-implementation validation):**
- `ws_send_large` events for `terminal.attached` should disappear or reduce to chunk-sized messages.
- Burst periods should show significantly fewer `sessions.patch` sends.
- No regression in existing attach ordering and patch-capability tests.

## Non-Goals

1. No schema redesign for `sessions.patch` payload content (that is a separate v2 protocol effort).
2. No reduction in configured terminal scrollback size.
3. No feature removal or user-facing settings change.

## Rollout Strategy

1. Backward-compatible server behavior for small snapshots (`terminal.attached` unchanged).
2. New chunked attach message types supported by updated client.
3. Coalescing defaults to enabled with conservative window, configurable by env.
4. Full test suite run before merge.

---

### Task 1: Add Failing Unit Tests For Terminal Snapshot Chunking Helper

**Files:**
- Modify: `test/unit/server/ws-chunking.test.ts`
- Target implementation: `server/ws-handler.ts`

**Step 1: Write the failing tests**

Add tests for new helper `chunkTerminalSnapshot(snapshot, maxBytes)`:

```ts
import { chunkProjects, chunkTerminalSnapshot } from '../../../server/ws-handler.js'

it('returns one chunk for small snapshot', () => {
  const chunks = chunkTerminalSnapshot('hello', 512 * 1024)
  expect(chunks).toEqual(['hello'])
})

it('splits large snapshot into bounded chunks', () => {
  const snapshot = 'x'.repeat(1_200_000)
  const maxBytes = 256 * 1024
  const chunks = chunkTerminalSnapshot(snapshot, maxBytes)

  expect(chunks.length).toBeGreaterThan(1)
  for (const chunk of chunks) {
    const payloadSize = Buffer.byteLength(JSON.stringify({ type: 'terminal.attached.chunk', terminalId: 't1', chunk }))
    expect(payloadSize).toBeLessThanOrEqual(maxBytes)
  }
  expect(chunks.join('')).toBe(snapshot)
})

it('preserves unicode characters across chunk boundaries', () => {
  const snapshot = '🙂'.repeat(200_000)
  const chunks = chunkTerminalSnapshot(snapshot, 64 * 1024)
  expect(chunks.join('')).toBe(snapshot)
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/server/ws-chunking.test.ts`
Expected: FAIL with missing export/function for `chunkTerminalSnapshot`.

**Step 3: Write minimal implementation**

In `server/ws-handler.ts`, add exported helper:

```ts
export function chunkTerminalSnapshot(snapshot: string, maxBytes: number): string[] {
  if (!snapshot) return ['']
  const chunks: string[] = []
  let cursor = 0
  const envelopeBase = Buffer.byteLength(JSON.stringify({ type: 'terminal.attached.chunk', terminalId: '', chunk: '' }))

  while (cursor < snapshot.length) {
    let lo = cursor + 1
    let hi = snapshot.length
    let best = lo

    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2)
      const candidate = snapshot.slice(cursor, mid)
      const bytes = envelopeBase + Buffer.byteLength(candidate)
      if (bytes <= maxBytes) {
        best = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }

    chunks.push(snapshot.slice(cursor, best))
    cursor = best
  }

  return chunks
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/server/ws-chunking.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add test/unit/server/ws-chunking.test.ts server/ws-handler.ts
git commit -m "test(ws): add terminal snapshot chunking helper coverage"
```

---

### Task 2: Add Failing Integration Tests For Chunked Attach Ordering

**Files:**
- Modify: `test/server/ws-edge-cases.test.ts`
- Target implementation: `server/ws-handler.ts`

**Step 1: Write the failing tests**

Add tests that assert:
1. large snapshot attach emits `terminal.attached.start`, one or more `terminal.attached.chunk`, then `terminal.attached.end`.
2. queued `terminal.output` messages are only emitted after `terminal.attached.end`.

```ts
it('streams large attach snapshot in ordered chunks', async () => {
  const { ws: ws1, close: close1 } = await createAuthenticatedConnection()
  const terminalId = await createTerminal(ws1, 'chunked-attach-create')

  registry.simulateOutput(terminalId, 'x'.repeat(1_400_000))
  close1()

  const { ws: ws2, close: close2 } = await createAuthenticatedConnection()
  ws2.send(JSON.stringify({ type: 'terminal.attach', terminalId }))

  const events = await collectMessages(ws2, 1200)
  const startIdx = events.findIndex((m) => m.type === 'terminal.attached.start' && m.terminalId === terminalId)
  const endIdx = events.findIndex((m) => m.type === 'terminal.attached.end' && m.terminalId === terminalId)
  const chunkCount = events.filter((m) => m.type === 'terminal.attached.chunk' && m.terminalId === terminalId).length

  expect(startIdx).toBeGreaterThanOrEqual(0)
  expect(chunkCount).toBeGreaterThan(0)
  expect(endIdx).toBeGreaterThan(startIdx)

  close2()
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/server/ws-edge-cases.test.ts -t "chunked attach"`
Expected: FAIL because current server emits only `terminal.attached`.

**Step 3: Write minimal implementation**

In `server/ws-handler.ts`:
- Add `sendChunkedTerminalAttach(ws, terminalId, snapshot)`.
- For oversized snapshots, send:
  - `{ type: 'terminal.attached.start', terminalId, totalChars }`
  - `{ type: 'terminal.attached.chunk', terminalId, chunk, index, totalChunks }`
  - `{ type: 'terminal.attached.end', terminalId, totalChars }`
- Keep current single-message `terminal.attached` path for small snapshots.
- Ensure `finishAttachSnapshot(...)` is invoked only after the full snapshot sequence is sent.

```ts
private async sendTerminalAttachSnapshot(ws: LiveWebSocket, terminalId: string, snapshot: string): Promise<void> {
  const maxBytes = MAX_CHUNK_BYTES
  const payloadBytes = Buffer.byteLength(JSON.stringify({ type: 'terminal.attached', terminalId, snapshot }))

  if (payloadBytes <= maxBytes) {
    this.send(ws, { type: 'terminal.attached', terminalId, snapshot })
    return
  }

  const chunks = chunkTerminalSnapshot(snapshot, maxBytes)
  this.send(ws, { type: 'terminal.attached.start', terminalId, totalChars: snapshot.length, totalChunks: chunks.length })
  for (let i = 0; i < chunks.length; i += 1) {
    this.send(ws, { type: 'terminal.attached.chunk', terminalId, index: i, totalChunks: chunks.length, chunk: chunks[i] })
    if (i < chunks.length - 1) await new Promise<void>((resolve) => setImmediate(resolve))
  }
  this.send(ws, { type: 'terminal.attached.end', terminalId, totalChars: snapshot.length, totalChunks: chunks.length })
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/server/ws-edge-cases.test.ts -t "chunked attach"`
Expected: PASS.

**Step 5: Commit**

```bash
git add test/server/ws-edge-cases.test.ts server/ws-handler.ts
git commit -m "feat(ws): stream oversized terminal attach snapshots in chunks"
```

---

### Task 3: Add Client Reassembly For Chunked Attach Snapshot Messages

**Files:**
- Modify: `src/components/TerminalView.tsx`
- Modify: `test/unit/client/components/TerminalView.lifecycle.test.tsx`

**Step 1: Write the failing test**

Add a lifecycle test where the message handler receives:
- `terminal.attached.start`
- multiple `terminal.attached.chunk`
- `terminal.attached.end`

Assert terminal writes final reassembled snapshot only after `end` and status transitions to running.

```ts
messageHandler!({ type: 'terminal.attached.start', terminalId: 'term-1', totalChars: 6, totalChunks: 2 })
messageHandler!({ type: 'terminal.attached.chunk', terminalId: 'term-1', index: 0, totalChunks: 2, chunk: 'abc' })
messageHandler!({ type: 'terminal.attached.chunk', terminalId: 'term-1', index: 1, totalChunks: 2, chunk: 'def' })
messageHandler!({ type: 'terminal.attached.end', terminalId: 'term-1', totalChars: 6, totalChunks: 2 })

expect(fakeTerm.clear).toHaveBeenCalledTimes(1)
expect(fakeTerm.write).toHaveBeenCalledWith('abcdef')
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/client/components/TerminalView.lifecycle.test.tsx -t "chunked attach"`
Expected: FAIL because client ignores new message types.

**Step 3: Write minimal implementation**

In `TerminalView.tsx`:
- Add ref map for in-progress attach buffers by `terminalId`.
- Handle new message types:
  - `terminal.attached.start` => init buffer
  - `terminal.attached.chunk` => append
  - `terminal.attached.end` => clear terminal, write joined snapshot, set running/attach false, cleanup buffer
- Keep existing `terminal.attached` behavior unchanged.

```ts
const attachChunksRef = useRef<Map<string, string[]>>(new Map())

if (msg.type === 'terminal.attached.start' && msg.terminalId === tid) {
  attachChunksRef.current.set(tid, [])
}

if (msg.type === 'terminal.attached.chunk' && msg.terminalId === tid) {
  const chunks = attachChunksRef.current.get(tid)
  if (chunks) chunks.push(msg.chunk || '')
}

if (msg.type === 'terminal.attached.end' && msg.terminalId === tid) {
  const chunks = attachChunksRef.current.get(tid) || []
  attachChunksRef.current.delete(tid)
  const snapshot = chunks.join('')
  try { term.clear(); if (snapshot) term.write(snapshot) } catch {}
  updateContent({ status: 'running' })
  setIsAttaching(false)
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/client/components/TerminalView.lifecycle.test.tsx -t "chunked attach"`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/TerminalView.tsx test/unit/client/components/TerminalView.lifecycle.test.tsx
git commit -m "feat(client): reassemble chunked terminal attach snapshots"
```

---

### Task 4: Add Failing Coalescing Unit Tests For SessionsSyncService

**Files:**
- Modify: `test/unit/server/sessions-sync/service.test.ts`
- Target implementation: `server/sessions-sync/service.ts`

**Step 1: Write the failing tests**

Use fake timers to verify burst coalescing:

```ts
it('coalesces rapid publish calls into one broadcast of latest state', () => {
  vi.useFakeTimers()
  const ws = {
    broadcastSessionsPatch: vi.fn(),
    broadcastSessionsUpdatedToLegacy: vi.fn(),
    broadcastSessionsUpdated: vi.fn(),
  }

  const svc = new SessionsSyncService(ws as any, { coalesceMs: 120 })
  svc.publish([{ projectPath: '/p1', sessions: [{ provider: 'claude', sessionId: 's1', projectPath: '/p1', updatedAt: 1 }] }])
  svc.publish([{ projectPath: '/p1', sessions: [{ provider: 'claude', sessionId: 's1', projectPath: '/p1', updatedAt: 2 }] }])

  expect(ws.broadcastSessionsPatch).toHaveBeenCalledTimes(0)

  vi.advanceTimersByTime(120)
  expect(ws.broadcastSessionsPatch).toHaveBeenCalledTimes(1)
  const msg = ws.broadcastSessionsPatch.mock.calls[0][0]
  expect(msg.upsertProjects[0].sessions[0].updatedAt).toBe(2)
})
```

Also add test for `shutdown()` clearing timer.

**Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/server/sessions-sync/service.test.ts`
Expected: FAIL because constructor options/coalescing logic do not exist.

**Step 3: Write minimal implementation**

In `server/sessions-sync/service.ts`:
- Add constructor options `{ coalesceMs?: number }` with env default.
- Add pending state + timer.
- Move existing logic into `flush(next)`.
- `publish(next)` schedules/coalesces flush.
- `shutdown()` clears pending timer.

```ts
type SessionsSyncOptions = { coalesceMs?: number }

export class SessionsSyncService {
  private pending: ProjectGroup[] | null = null
  private timer: NodeJS.Timeout | null = null
  private coalesceMs: number

  constructor(private ws: ..., options: SessionsSyncOptions = {}) {
    this.coalesceMs = options.coalesceMs ?? Number(process.env.SESSIONS_SYNC_COALESCE_MS || 150)
  }

  publish(next: ProjectGroup[]): void {
    if (this.coalesceMs <= 0) {
      this.flush(next)
      return
    }
    this.pending = next
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      const latest = this.pending
      this.pending = null
      if (latest) this.flush(latest)
    }, this.coalesceMs)
    this.timer.unref?.()
  }

  shutdown(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.pending = null
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/server/sessions-sync/service.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add server/sessions-sync/service.ts test/unit/server/sessions-sync/service.test.ts
git commit -m "feat(sync): coalesce bursty sessions publishes"
```

---

### Task 5: Wire Coalescing Service Shutdown + Integration Test

**Files:**
- Modify: `server/index.ts`
- Modify: `test/server/ws-sessions-patch.test.ts`

**Step 1: Write the failing integration test**

In `ws-sessions-patch.test.ts`, instantiate `SessionsSyncService` with real `WsHandler` and publish multiple updates quickly; assert one `sessions.patch` arrives after coalesce interval.

```ts
const sync = new SessionsSyncService(handler as any, { coalesceMs: 80 })
sync.publish(state1)
sync.publish(state2)
sync.publish(state3)
const patch = await waitFor(ws, 'sessions.patch', 2000)
expect(patch.upsertProjects[0].sessions[0].updatedAt).toBe(3)
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/server/ws-sessions-patch.test.ts -t "coalesces"`
Expected: FAIL until coalescing + timer behavior is integrated.

**Step 3: Write minimal implementation**

In `server/index.ts` shutdown path, call `sessionsSync.shutdown()` before process exit.

```ts
// after stopping indexers and before exit
sessionsSync.shutdown()
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/server/ws-sessions-patch.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add server/index.ts test/server/ws-sessions-patch.test.ts
git commit -m "test(sync): verify coalesced patch delivery and clean shutdown"
```

---

### Task 6: Full Regression Verification

**Files:**
- Modify if needed: `test/server/ws-edge-cases.test.ts`
- Modify if needed: `test/unit/client/components/App.test.tsx`
- Modify if needed: `test/unit/client/components/TerminalView.lifecycle.test.tsx`

**Step 1: Run targeted server tests**

Run:

```bash
npm test -- test/unit/server/ws-chunking.test.ts
npm test -- test/unit/server/sessions-sync/service.test.ts
npm test -- test/server/ws-edge-cases.test.ts
npm test -- test/server/ws-sessions-patch.test.ts
```

Expected: PASS.

**Step 2: Run targeted client tests**

Run:

```bash
npm test -- test/unit/client/components/TerminalView.lifecycle.test.tsx
npm test -- test/unit/client/components/App.test.tsx
```

Expected: PASS.

**Step 3: Run full suite**

Run: `npm test`
Expected: PASS (required before merge).

**Step 4: Capture expected perf deltas in PR notes**

Record before/after from `~/.freshell/logs/server-debug.jsonl`:
- count and size of `terminal.attached` large sends
- count of `ws_backpressure_close`
- count of `sessions.patch` events in burst window

**Step 5: Commit final test adjustments/docs**

```bash
git add test/server/ws-edge-cases.test.ts test/unit/client/components/TerminalView.lifecycle.test.tsx test/unit/client/components/App.test.tsx
git commit -m "test(perf): lock attach chunking and session publish coalescing behavior"
```

---

## Implementation Notes (Important)

1. **Do not break existing clients during rollout.**
- Keep legacy `terminal.attached` for small snapshots.
- Only stream chunked attach for oversized snapshots.

2. **Preserve attach ordering invariant.**
- Do not call `finishAttachSnapshot` until attach snapshot stream is fully sent.

3. **Keep coalescing bounded and configurable.**
- Default `SESSIONS_SYNC_COALESCE_MS=150`.
- Support `0` to disable for troubleshooting/tests.

4. **No behavioral changes to data model.**
- Sessions patch payload schema remains unchanged.
- Coalescing only changes timing, not state semantics.

## Post-Implementation Validation Checklist

1. Attach a terminal with >1MB scrollback and confirm no backpressure disconnect.
2. Confirm reconnect still renders snapshot before live output.
3. Trigger rapid session-file churn and confirm patch sends are coalesced.
4. Confirm no regression in `sessions.updated` chunk merge behavior on client.

Plan complete and saved to `docs/plans/2026-02-10-ws-attach-chunking-sessions-coalescing.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints

Which approach?
