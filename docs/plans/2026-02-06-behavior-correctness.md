# Behavior Correctness And Robustness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix user-facing correctness mismatches in terminal lifecycle, WebSocket handshake/reattach semantics, defaults/persistence, and noisy logging so Freshell behaves the way users expect under load and across reconnects.

**Architecture:** Tighten a few core invariants (terminal registry lifecycle, attach snapshot ordering, WS client connect semantics). Prefer server-driven truth (settings defaults, terminal history buffer) and make failure modes explicit (close + resync instead of silent corruption). Add tests that prove behavior and prevent regressions.

**Tech Stack:** Node/Express + ws + node-pty (server), React + Redux Toolkit + xterm.js (client), Vitest + Testing Library + superwstest (tests).

---

## Ground Rules (Repo Safety)

- Work in a git worktree under `.worktrees/` on a feature branch.
- Merge main into the branch in the worktree first; then fast-forward main via `git merge --ff-only`.
- TDD: every behavior change has at least one unit/integration test.

## Issues This Plan Addresses

1. Exited terminals never reaped; hard max terminal cap can brick creation until restart.
2. Terminal output silently dropped under backpressure (invisible corruption).
3. Attach/snapshot races clear already-received output (data loss).
4. Client treats server `HELLO_TIMEOUT` as auth failure and stops reconnecting.
5. `WsClient.connect()` returns resolved promise while still handshaking (callers think “ready” but aren’t).
6. Scrollback setting doesn’t match reattach buffer behavior.
7. `defaultCwd` can be ignored due to compile-time `VITE_DEFAULT_CWD` and client-sent cwd.
8. `warnBeforeKillMinutes` is UI-only; server never warns.
9. Sessions expanded state goes stale when projects change.
10. Hydration can set `activeTabId` to a non-existent tab.
11. Production console logging noise (not gated by debug logging).
12. Test suite passes despite uncaught errors / console error spam.

---

### Task 1: Terminal Registry Reaping (Exited Terminals)

**Intent:** Users expect exited terminals to stop consuming quota/memory and for new terminals to keep working indefinitely.

**Files:**
- Modify: `server/terminal-registry.ts`
- Test: `test/unit/server/terminal-registry.test.ts`

**Step 1: Write failing tests for “exited terminals don’t count toward max”**

Add to `test/unit/server/terminal-registry.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { TerminalRegistry } from '../../../server/terminal-registry.js'

describe('TerminalRegistry - reaping exited terminals', () => {
  it('does not count exited terminals against MAX_TERMINALS', () => {
    const reg = new TerminalRegistry(undefined, 2)

    const t1 = reg.create({ mode: 'shell' })
    const t2 = reg.create({ mode: 'shell' })

    // Simulate exit without actually spawning a PTY:
    // We rely on registry.kill() to mark exited.
    reg.kill(t1.terminalId)

    // Should allow creating another terminal after one exited.
    expect(() => reg.create({ mode: 'shell' })).not.toThrow()
  })
})
```

**Step 2: Run the test and verify it fails**

Run: `npm test -- test/unit/server/terminal-registry.test.ts -t "reaping exited terminals"`

Expected: FAIL (currently `create()` checks total map size, not running).

**Step 3: Implement minimal behavior: max applies to running terminals**

Modify `server/terminal-registry.ts`:

```ts
private runningCount(): number {
  let n = 0
  for (const t of this.terminals.values()) if (t.status === 'running') n += 1
  return n
}
```

Then in `create(...)` replace:

```ts
if (this.terminals.size >= this.maxTerminals) { ... }
```

with:

```ts
if (this.runningCount() >= this.maxTerminals) {
  throw new Error(`Maximum terminal limit (${this.maxTerminals}) reached. Please close some terminals before creating new ones.`)
}
```

**Step 4: Run test; verify it passes**

Run: `npm test -- test/unit/server/terminal-registry.test.ts -t "reaping exited terminals"`

Expected: PASS.

**Step 5: Add bounded reaping to prevent unbounded memory growth**

Write a second failing test:

```ts
it('reaps old exited terminals to prevent unbounded growth', () => {
  const reg = new TerminalRegistry(undefined, 1)
  const ids: string[] = []
  for (let i = 0; i < 20; i += 1) {
    const t = reg.create({ mode: 'shell' })
    ids.push(t.terminalId)
    reg.kill(t.terminalId)
  }
  // Expect registry to not keep all 20 forever.
  expect(reg.list().length).toBeLessThan(20)
})
```

Implement a simple policy in `server/terminal-registry.ts`:

- Add env-configurable constants:

```ts
const MAX_EXITED_TERMINALS = Number(process.env.MAX_EXITED_TERMINALS || 200)
```

- Add `exitedAt?: number` to `TerminalRecord`.
- In `ptyProc.onExit` and `kill`, set `record.exitedAt = Date.now()`.
- Add a private method:

```ts
private reapExitedTerminals(): void {
  const exited = Array.from(this.terminals.values())
    .filter((t) => t.status === 'exited')
    .sort((a, b) => (a.exitedAt ?? a.lastActivityAt) - (b.exitedAt ?? b.lastActivityAt))

  const excess = exited.length - MAX_EXITED_TERMINALS
  if (excess <= 0) return
  for (let i = 0; i < excess; i += 1) {
    this.terminals.delete(exited[i].terminalId)
  }
}
```

- Call `this.reapExitedTerminals()` at the end of `kill()` and at the top of `create()`.

**Step 6: Run the full terminal-registry unit tests**

Run: `npm test -- test/unit/server/terminal-registry.test.ts`

Expected: PASS.

**Step 7: Commit**

```bash
git add server/terminal-registry.ts test/unit/server/terminal-registry.test.ts
git commit -m "fix(server): do not cap terminal creation on exited terminals; reap exited records"
```

---

### Task 2: Make Backpressure Failure Explicit (Close + Resync)

**Intent:** Users prefer “disconnect + reattach snapshot” over silently missing output.

**Files:**
- Modify: `server/terminal-registry.ts`
- Modify: `server/ws-handler.ts`
- Test: `test/server/ws-edge-cases.test.ts`

**Step 1: Add failing WS test proving we close on terminal output backpressure**

In `test/server/ws-edge-cases.test.ts`, add a test that:
- creates a terminal
- forces the socket `bufferedAmount` to exceed `MAX_WS_BUFFERED_AMOUNT`
- expects server to close with code `4008` (BACKPRESSURE)

Skeleton (adapt existing superwstest patterns in that file):

```ts
it('closes WS when terminal output backpressure is exceeded (no silent drops)', async () => {
  // Arrange a client and create a terminal
  // Force ws.bufferedAmount to a large number
  // Trigger output (mock node-pty onData)
  // Expect ws close code 4008
})
```

**Step 2: Implement backpressure close in terminal output path**

In `server/terminal-registry.ts`, update `safeSend(...)`:

```ts
if (typeof buffered === 'number' && buffered > MAX_WS_BUFFERED_AMOUNT) {
  // Prefer explicit resync over silent corruption.
  try { (client as any).close?.(4008, 'Backpressure') } catch {}
  return
}
```

Then ensure `WsHandler.onClose` detaches from terminals (already does: `server/ws-handler.ts`).

**Step 3: Run the WS test**

Run: `npm test -- test/server/ws-edge-cases.test.ts -t "backpressure"`

Expected: PASS.

**Step 4: Commit**

```bash
git add server/terminal-registry.ts test/server/ws-edge-cases.test.ts server/ws-handler.ts
git commit -m "fix(ws): close slow clients on terminal output backpressure (avoid silent output loss)"
```

---

### Task 3: Eliminate Attach/Snapshot Data Loss (Ordering + No Double-Attach)

**Intent:** Users should never lose terminal output due to client clearing after it already wrote output.

**Files:**
- Modify: `src/components/TerminalView.tsx`
- Modify: `server/ws-handler.ts`
- Modify: `server/terminal-registry.ts`
- Test: `test/server/ws-edge-cases.test.ts`
- Test: `test/unit/client/components/TerminalView.lifecycle.test.tsx` (or new)

**Step 1: Client-side fix: do not `terminal.attach` immediately after `terminal.created`**

Write failing test in `test/unit/client/components/TerminalView.lifecycle.test.tsx` asserting:
- On `terminal.created`, client does NOT send `terminal.attach` automatically (it should already be attached by server in current protocol).

Example approach (matching existing `getWsClient` mocks):

```ts
it('does not send terminal.attach after terminal.created (prevents snapshot race)', async () => {
  // render TerminalView
  // simulate ws message terminal.created
  // assert ws.send not called with {type:'terminal.attach', ...}
})
```

**Step 2: Implement client change**

In `src/components/TerminalView.tsx`, in the `terminal.created` handler:
- Remove `attach(newId)` call.
- Replace with a resize send:

```ts
ws.send({ type: 'terminal.resize', terminalId: newId, cols: term.cols, rows: term.rows })
setIsAttaching(false)
```

**Step 3: Server-side fix: gate output during `terminal.attach` until snapshot sent**

Add per-terminal per-client attach gating in `server/terminal-registry.ts`:

1. Add to `TerminalRecord`:

```ts
pendingSnapshotClients: Map<WebSocket, string[]>
```

2. Initialize in `create()`:

```ts
pendingSnapshotClients: new Map(),
```

3. Change `attach()` to accept an option:

```ts
attach(terminalId: string, client: WebSocket, opts?: { pendingSnapshot?: boolean }): TerminalRecord | null {
  const term = this.terminals.get(terminalId)
  if (!term) return null
  term.clients.add(client)
  if (opts?.pendingSnapshot) term.pendingSnapshotClients.set(client, [])
  return term
}

finishAttachSnapshot(terminalId: string, client: WebSocket): void {
  const term = this.terminals.get(terminalId)
  if (!term) return
  const queued = term.pendingSnapshotClients.get(client)
  if (!queued) return
  term.pendingSnapshotClients.delete(client)
  for (const data of queued) {
    this.safeSend(client, { type: 'terminal.output', terminalId, data }, { terminalId, perf: term.perf })
  }
}
```

4. In `ptyProc.onData`, before sending output:

```ts
for (const client of record.clients) {
  const q = record.pendingSnapshotClients.get(client)
  if (q) { q.push(data); continue }
  this.safeSend(client, { type: 'terminal.output', terminalId, data }, { terminalId, perf: record.perf })
}
```

5. In `detach()`, also clear pending map entry:

```ts
term.pendingSnapshotClients.delete(client)
```

**Step 4: Use the gating in `server/ws-handler.ts` for `terminal.attach`**

Change `terminal.attach` handler to:

- Attach with `pendingSnapshot: true`
- Send `terminal.attached` snapshot
- Then flush queued output (on next tick to guarantee message ordering):

```ts
const rec = this.registry.attach(m.terminalId, ws, { pendingSnapshot: true })
...
this.send(ws, { type: 'terminal.attached', terminalId: m.terminalId, snapshot: rec.buffer.snapshot() })
setImmediate(() => this.registry.finishAttachSnapshot(m.terminalId, ws))
```

**Step 5: Add a WS regression test for the race**

In `test/server/ws-edge-cases.test.ts`:
- Attach, then simulate PTY output during attach
- Ensure client receives `terminal.attached` snapshot first, then output (no output before snapshot)

Expected ordering:
1. `terminal.attached`
2. one or more `terminal.output`

**Step 6: Run focused tests**

Run:
- `npm test -- test/unit/client/components/TerminalView.lifecycle.test.tsx`
- `npm test -- test/server/ws-edge-cases.test.ts -t "attached"`

Expected: PASS.

**Step 7: Commit**

```bash
git add src/components/TerminalView.tsx server/terminal-registry.ts server/ws-handler.ts test/server/ws-edge-cases.test.ts test/unit/client/components/TerminalView.lifecycle.test.tsx
git commit -m "fix(terminal): prevent snapshot races on attach; remove double-attach after create"
```

---

### Task 4: Make `WsClient.connect()` Mean “Ready” (Promise Dedup + State Machine)

**Intent:** Callers awaiting `connect()` should always wait for `ready`, even if a connect is already in-flight.

**Files:**
- Modify: `src/lib/ws-client.ts`
- Create: `test/unit/client/lib/ws-client.test.ts`

**Step 1: Add failing tests**

Create `test/unit/client/lib/ws-client.test.ts` with a controllable WebSocket mock.

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { WsClient } from '../../../../src/lib/ws-client'

class MockWebSocket {
  static OPEN = 1
  readyState = MockWebSocket.OPEN
  onopen: null | (() => void) = null
  onmessage: null | ((ev: any) => void) = null
  onclose: null | ((ev: any) => void) = null
  onerror: null | (() => void) = null
  sent: any[] = []
  constructor(_url: string) {}
  send(data: any) { this.sent.push(data) }
  close() { this.onclose?.({ code: 1000, reason: '' }) }
}

describe('WsClient.connect', () => {
  beforeEach(() => {
    // @ts-expect-error
    globalThis.WebSocket = MockWebSocket
    sessionStorage.setItem('auth-token', 't')
  })

  it('returns the same in-flight promise and resolves only after ready', async () => {
    const c = new WsClient('ws://example/ws')
    const p1 = c.connect()
    const p2 = c.connect()
    expect(p2).toBe(p1)
  })
})
```

**Step 2: Implement connect promise caching**

In `src/lib/ws-client.ts`, add:

```ts
private connectPromise: Promise<void> | null = null
```

Then change `connect()`:
- If `_state` is `ready`, return `Promise.resolve()`.
- If `connectPromise` exists (connecting/connected), return it.
- Otherwise create a new promise, store in `connectPromise`, and clear it when resolved/rejected.

**Step 3: Fix HELLO_TIMEOUT handling (do not treat as permanent auth failure)**

In `src/lib/ws-client.ts`, update close code handling:
- Treat `4001` as auth failure (stop reconnecting).
- Treat `4002` as transient handshake timeout (allow reconnect).

Concrete change:

```ts
const AUTH_CLOSE_CODES = [4001] // NOT_AUTHENTICATED only
```

and for `4002`:
- Reject the current connect attempt with a “Handshake timeout” message.
- Do NOT set `intentionalClose = true` so `scheduleReconnect()` can run.

**Step 4: Run the new unit tests**

Run: `npm test -- test/unit/client/lib/ws-client.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/ws-client.ts test/unit/client/lib/ws-client.test.ts
git commit -m "fix(client): make WsClient.connect await ready; reconnect after hello timeout"
```

---

### Task 5: Align “Scrollback” With Reattach Buffer (Server-Side Buffer Size)

**Intent:** Users expect reattach to restore roughly what scrollback suggests, within safe memory limits.

**Files:**
- Modify: `server/terminal-registry.ts`
- Modify: `server/config-store.ts` (if needed for server-side settings access)
- Test: `test/unit/server/chunk-ring-buffer.test.ts` (or new)

**Step 1: Add failing test that server buffer honors settings-derived size**

Add to `test/unit/server/chunk-ring-buffer.test.ts`:

```ts
import { ChunkRingBuffer } from '../../../server/terminal-registry.js'
import { describe, expect, it } from 'vitest'

it('can shrink/grow max size via setMaxChars', () => {
  const b = new ChunkRingBuffer(10)
  b.append('1234567890')
  b.setMaxChars(5)
  expect(b.snapshot()).toBe('67890')
})
```

**Step 2: Implement `setMaxChars`**

In `server/terminal-registry.ts`:

```ts
setMaxChars(next: number) {
  this.maxChars = Math.max(0, next)
  // Truncate if needed by reusing existing append logic:
  this.append('')
}
```

**Step 3: Compute server-side max chars from settings**

In `TerminalRegistry`:
- Keep a `scrollbackMaxChars` field, defaulting to `DEFAULT_MAX_SCROLLBACK_CHARS`.
- In `setSettings(settings)`, compute:

```ts
const lines = settings.terminal.scrollback || 5000
const approxCharsPerLine = 200
const computed = Math.min(2 * 1024 * 1024, Math.max(64 * 1024, lines * approxCharsPerLine))
this.scrollbackMaxChars = computed
```

- In `create()`, construct `new ChunkRingBuffer(this.scrollbackMaxChars)`.
- Optionally, when settings change, update existing buffers:

```ts
for (const t of this.terminals.values()) t.buffer.setMaxChars(this.scrollbackMaxChars)
```

**Step 4: Run server unit tests**

Run: `npm test -- test/unit/server/chunk-ring-buffer.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add server/terminal-registry.ts test/unit/server/chunk-ring-buffer.test.ts
git commit -m "fix(server): size terminal reattach buffer from scrollback setting (bounded)"
```

---

### Task 6: Fix Default CWD Semantics (Prefer Server Settings)

**Intent:** Users expect the “Default working directory” setting to apply to new terminals.

**Files:**
- Modify: `src/store/tabsSlice.ts`
- Test: `test/unit/client/store/tabsSlice.test.ts`

**Step 1: Add failing test**

Add a test proving new tabs do not hardcode `VITE_DEFAULT_CWD`:

```ts
import { describe, expect, it } from 'vitest'
import reducer, { addTab } from '../../../../src/store/tabsSlice'

it('does not force initialCwd by default (lets server apply defaultCwd)', () => {
  const s = reducer({ tabs: [], activeTabId: null }, addTab({ mode: 'shell' } as any))
  expect(s.tabs[0].initialCwd).toBeUndefined()
})
```

**Step 2: Implement**

In `src/store/tabsSlice.ts`:
- Remove `DEFAULT_CWD = import.meta.env.VITE_DEFAULT_CWD ...`
- In `addTab`, set `initialCwd: payload.initialCwd` (no fallback).

**Step 3: Run client unit tests**

Run: `npm test -- test/unit/client/store/tabsSlice.test.ts`

Expected: PASS.

**Step 4: Commit**

```bash
git add src/store/tabsSlice.ts test/unit/client/store/tabsSlice.test.ts
git commit -m "fix(client): do not hardcode default cwd in tabs; prefer server defaultCwd"
```

---

### Task 7: Implement Real Idle Warnings (Server Emits, UI Surfaces)

**Intent:** “Warn before auto-kill” must produce an actual user-visible warning, not only a label in one view.

**Files:**
- Modify: `server/terminal-registry.ts`
- Modify: `server/ws-handler.ts`
- Modify: `src/App.tsx`
- Modify/Create: `src/store/idleWarningsSlice.ts` (or similar)
- Test: `test/unit/server/terminal-registry.test.ts`
- Test: `test/unit/client/components/App.test.tsx`

**Step 1: Add server failing test for warning emission**

In `test/unit/server/terminal-registry.test.ts`:
- Create a registry with settings `autoKillIdleMinutes=10`, `warnBeforeKillMinutes=3`.
- Create a terminal, detach it (no clients), set `lastActivityAt` in past, run `enforceIdleKills()` (make it injectable or expose method for tests), assert a warning event.

Implementation support needed: make `enforceIdleKills` callable in tests (e.g., `enforceIdleKillsForTest()`).

**Step 2: Implement warning event in registry**

In `server/terminal-registry.ts`:
- Convert `TerminalRegistry` to `extends EventEmitter`.
- Track `warnedIdle` per terminal (field already exists).
- In idle loop, if `idleMinutes >= killMinutes - warnMinutes` and not warned:

```ts
term.warnedIdle = true
this.emit('terminal.idle.warning', {
  terminalId: term.terminalId,
  killMinutes,
  warnMinutes,
  lastActivityAt: term.lastActivityAt,
})
```

Reset `warnedIdle=false` on activity (input/output updates) or when a client attaches.

**Step 3: WsHandler subscribes and broadcasts**

In `server/index.ts` where `WsHandler` is created, wire:
- `registry.on('terminal.idle.warning', (payload) => wsHandler.broadcast({ type: 'terminal.idle.warning', ...payload }))`

Or, if you must keep wiring inside `WsHandler`, pass `registry` events in constructor.

**Step 4: Client surfaces warning**

Add a minimal Redux slice `src/store/idleWarningsSlice.ts`:

```ts
type IdleWarning = { terminalId: string; receivedAt: number; killMinutes: number; warnMinutes: number }
type State = { warnings: Record<string, IdleWarning> }
```

In `src/App.tsx` WS message handler, handle:

```ts
if (msg.type === 'terminal.idle.warning') dispatch(recordIdleWarning(...))
```

Show an always-visible indicator in the top header bar (existing header in `src/App.tsx`):
- If `warnings` non-empty, render a button “1 terminal will auto-kill soon” that switches view to `overview` or opens `Background sessions`.

**Step 5: Add App test**

In `test/unit/client/components/App.test.tsx`, simulate WS message `terminal.idle.warning` and assert indicator renders.

**Step 6: Run focused tests**

Run:
- `npm test -- test/unit/server/terminal-registry.test.ts -t "idle warning"`
- `npm test -- test/unit/client/components/App.test.tsx -t "idle warning"`

**Step 7: Commit**

```bash
git add server/terminal-registry.ts server/index.ts server/ws-handler.ts src/App.tsx src/store/idleWarningsSlice.ts test/unit/server/terminal-registry.test.ts test/unit/client/components/App.test.tsx
git commit -m "feat: emit and surface idle terminal warnings before auto-kill"
```

---

### Task 8: Prune Stale Session UI State (expandedProjects)

**Intent:** Expanded/collapsed state should track current projects only.

**Files:**
- Modify: `src/store/sessionsSlice.ts`
- Test: `test/unit/client/store/state-edge-cases.test.ts` (add regression)

**Step 1: Add failing test**

Add to `test/unit/client/store/state-edge-cases.test.ts` (near documented issue):

```ts
it('prunes expandedProjects when projects set changes', () => {
  const store = createTestStore()
  store.dispatch(setProjects([{ projectPath: '/old', sessions: [] }]))
  store.dispatch(setProjectExpanded({ projectPath: '/old', expanded: true }))
  store.dispatch(setProjects([{ projectPath: '/new', sessions: [] }]))
  expect(store.getState().sessions.expandedProjects.has('/old')).toBe(false)
})
```

**Step 2: Implement pruning**

In `src/store/sessionsSlice.ts`, in `setProjects` and `mergeProjects`:

```ts
const valid = new Set(state.projects.map((p) => p.projectPath))
state.expandedProjects = new Set(Array.from(state.expandedProjects).filter((k) => valid.has(k)))
```

Also in `clearProjects`, set `expandedProjects = new Set()`.

**Step 3: Run test**

Run: `npm test -- test/unit/client/store/state-edge-cases.test.ts -t "prunes expandedProjects"`

**Step 4: Commit**

```bash
git add src/store/sessionsSlice.ts test/unit/client/store/state-edge-cases.test.ts
git commit -m "fix(client): prune expandedProjects when session projects change"
```

---

### Task 9: Validate `activeTabId` on Hydration + Load

**Intent:** Active tab must always reference an existing tab.

**Files:**
- Modify: `src/store/tabsSlice.ts`
- Test: `test/unit/client/store/state-edge-cases.test.ts`

**Step 1: Convert “potential bug” doc test into a real regression**

In `test/unit/client/store/state-edge-cases.test.ts`, change expectation:

```ts
expect(state.activeTabId).toBe('tab-1')
```

**Step 2: Implement validation**

In `hydrateTabs`:

```ts
const desired = action.payload.activeTabId
const has = desired && state.tabs.some((t) => t.id === desired)
state.activeTabId = has ? desired : (state.tabs[0]?.id ?? null)
```

In `loadInitialTabsState()` do the same validation for `tabsState.activeTabId`.

**Step 3: Run the unit test suite**

Run: `npm test -- test/unit/client/store/state-edge-cases.test.ts -t "activeTabId"`

**Step 4: Commit**

```bash
git add src/store/tabsSlice.ts test/unit/client/store/state-edge-cases.test.ts
git commit -m "fix(client): ensure activeTabId always points to an existing tab"
```

---

### Task 10: Remove / Gate Production Console Logging

**Intent:** Users should not see internal state dumps in the browser console unless explicitly debugging.

**Files:**
- Modify: `src/store/tabsSlice.ts`
- Modify: `src/store/panesSlice.ts`
- Modify: `src/store/store.ts`
- Modify: `src/components/panes/PaneLayout.tsx` (or any other noisy logs)
- Test: `test/unit/client/components/App.test.tsx` (optional: assert no console.log in production build path)

**Step 1: Replace unconditional `console.log` with dev-only logging**

Example changes:

```ts
if (import.meta.env.DEV) console.log(...)
```

or delete logs entirely where not useful.

Targets:
- `src/store/tabsSlice.ts` load logs
- `src/store/panesSlice.ts` load logs
- `src/store/store.ts` initial dump logs
- `src/components/panes/PaneLayout.tsx` layout creation logs

**Step 2: Run client unit tests**

Run: `npm test -- test/unit/client/components/App.test.tsx`

Expected: PASS.

**Step 3: Commit**

```bash
git add src/store/tabsSlice.ts src/store/panesSlice.ts src/store/store.ts src/components/panes/PaneLayout.tsx
git commit -m "chore(client): gate noisy console logs to dev only"
```

---

### Task 11: Make Tests Fail On Unexpected Console Errors (And Fix The Real Crashes)

**Intent:** A green test suite should imply no uncaught runtime exceptions in React render paths.

**Files:**
- Modify: `test/setup/dom.ts`
- Modify: `src/components/TabBar.tsx` (fix actual crash for missing state)
- Modify: tests that intentionally trigger errors to explicitly allow them

**Step 1: Fix the real TabBar crash (so we can enforce stricter console rules)**

In `src/components/TabBar.tsx`, harden against missing/undefined slice data:
- Ensure `tabs` defaults to `[]` if selector returns undefined.
- Guard any `.length` access.

Add/adjust unit test in `test/unit/client/components/component-edge-cases.test.tsx` asserting TabBar does not throw.

**Step 2: Add console-error trap in test setup**

In `test/setup/dom.ts`:

```ts
import { beforeEach, afterEach, vi } from 'vitest'

let errorSpy: any
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    throw new Error('Unexpected console.error: ' + args.map(String).join(' '))
  })
})
afterEach(() => {
  errorSpy?.mockRestore()
})
```

If specific tests legitimately hit error logs, explicitly stub in that test file:

```ts
vi.spyOn(console, 'error').mockImplementation(() => {})
```

**Step 3: Run full suite**

Run: `npm test`

Expected: Initially FAIL (then fix remaining offenders by either:
- correcting behavior so errors no longer happen, or
- explicitly stubbing console errors where the test is about error handling).

**Step 4: Commit**

```bash
git add test/setup/dom.ts src/components/TabBar.tsx test/unit/client/components/component-edge-cases.test.tsx
git commit -m "test: fail on unexpected console.error; fix TabBar crash in edge cases"
```

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-02-06-behavior-correctness.md`. Two execution options:

1. Subagent-Driven (this session) - fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) - open a new session in the worktree using superpowers:executing-plans

