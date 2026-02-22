# Fix: WebSocket Backpressure During Handshake Snapshot

## Context

Clients (confirmed on Pixel 9 Pro / Android Chrome AND laptop) get their WebSocket connection killed with code 4008 (Backpressure) during the handshake snapshot. The server sends settings + chunked sessions data too fast for the connection to consume. `bufferedAmount` exceeds 2MB, and `closeForBackpressureIfNeeded()` terminates the connection. The `terminal.created` response never arrives, so the terminal shows "Starting terminal..." forever.

This was masked in dev mode because Vite's WS proxy buffered data between server and client. In production, the server sends directly to the client.

## Root Cause

`sendChunkedSessions()` (ws-handler.ts:900-932) uses `setImmediate` between chunks but never checks `bufferedAmount`. It fires 500KB chunks in rapid succession. Combined with settings and terminal.created data, the buffer exceeds the 2MB limit, triggering destructive connection close.

## Fix: Drain-aware chunk sending

### CRITICAL: The `ws` library does NOT emit `drain` events on WebSocket instances

The original plan used `ws.on('drain', callback)`. This is **wrong** — the `ws` npm package's WebSocket class never emits a `drain` event. The `drain` event only exists on the underlying `net.Socket` (accessible via the private `ws._socket`).

Correct approaches:
- **`ws.send(data, callback)`** — callback fires when data is handed to the OS socket (idiomatic `ws` pattern, already used in `queueAttachFrame`)
- **Poll `ws.bufferedAmount`** — public API, checks ws internal buffer + socket writable state
- **`ws._socket.on('drain', ...)`** — works but relies on private API

We use: **bufferedAmount polling** (public API, simple, reliable) with `close` event listener (which IS emitted by ws WebSocket) for early termination.

### File: `server/ws-handler.ts`

**1. Add constants** (near other constants at top of file):

```typescript
const DRAIN_THRESHOLD_BYTES = Number(process.env.WS_DRAIN_THRESHOLD_BYTES || 512 * 1024) // 512KB
const DRAIN_TIMEOUT_MS = Number(process.env.WS_DRAIN_TIMEOUT_MS || 30_000) // 30s
const DRAIN_POLL_INTERVAL_MS = 50
```

512KB threshold is well below the 2MB kill limit, giving plenty of headroom.

**2. Add a `waitForDrain` helper** (near `queueAttachFrame` and other private send methods):

```typescript
/**
 * Wait for ws.bufferedAmount to drop below threshold.
 * Returns true if drained, false if timed out or connection closed.
 * Uses polling because the ws library does not emit 'drain' events on WebSocket instances.
 */
private waitForDrain(ws: LiveWebSocket, thresholdBytes: number, timeoutMs: number): Promise<boolean> {
  if (ws.readyState !== WebSocket.OPEN) return Promise.resolve(false)
  if ((ws.bufferedAmount ?? 0) <= thresholdBytes) return Promise.resolve(true)

  return new Promise<boolean>((resolve) => {
    let settled = false
    const settle = (result: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearInterval(poller)
      ws.off('close', onClose)
      resolve(result)
    }
    const onClose = () => settle(false)
    const timer = setTimeout(() => settle(false), timeoutMs)
    const poller = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) { settle(false); return }
      if ((ws.bufferedAmount ?? 0) <= thresholdBytes) settle(true)
    }, DRAIN_POLL_INTERVAL_MS)
    ws.on('close', onClose)
  })
}
```

**3. Modify `sendChunkedSessions`** — replace the `setImmediate` yield with drain-aware waiting:

```typescript
// Wait for buffer to drain before sending next chunk
if (i < chunks.length - 1) {
  const buffered = ws.bufferedAmount as number | undefined
  if (typeof buffered === 'number' && buffered > DRAIN_THRESHOLD_BYTES) {
    if (!await this.waitForDrain(ws, DRAIN_THRESHOLD_BYTES, DRAIN_TIMEOUT_MS)) return
  } else {
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
}
```

### Why this approach

- **Minimal change**: Only `sendChunkedSessions` needs the fix — that's where the flood happens
- **Non-destructive**: Waits for buffer to drain instead of killing the connection
- **Preserves existing behavior for fast clients**: If buffer is low, falls through to the existing `setImmediate` yield
- **Timeout safety**: Won't wait forever; 30s timeout returns false, stopping the send gracefully
- **Public API only**: Uses `ws.bufferedAmount` (public getter) and `ws.on('close', ...)` (standard event), no private API access
- **Follows existing patterns**: Similar to `queueAttachFrame`'s settle/timeout pattern

### Files to modify

- `server/ws-handler.ts` — add constants, add `waitForDrain` helper, modify `sendChunkedSessions`

### TDD Tasks (Red-Green-Refactor)

#### Task 1: RED — Write failing tests for `waitForDrain`
File: `test/unit/server/ws-handler-backpressure.test.ts` (extend existing file)

Tests:
- `waitForDrain resolves true immediately when bufferedAmount is below threshold`
- `waitForDrain resolves true when bufferedAmount drops below threshold (polling)`
- `waitForDrain resolves false on timeout when bufferedAmount stays high`
- `waitForDrain resolves false when connection closes`
- `waitForDrain resolves false when readyState is not OPEN`

#### Task 2: GREEN — Implement `waitForDrain` + constants
File: `server/ws-handler.ts`

Add the constants and helper method. Run tests — all new tests should pass.

#### Task 3: RED — Write failing tests for drain-aware `sendChunkedSessions`
File: `test/unit/server/ws-handler-backpressure.test.ts` (extend)

Tests:
- `sendChunkedSessions waits for drain when bufferedAmount exceeds threshold`
- `sendChunkedSessions stops sending when waitForDrain times out`
- `sendChunkedSessions uses setImmediate when bufferedAmount is low (fast client path)`

#### Task 4: GREEN — Modify `sendChunkedSessions` to use drain-aware waiting
File: `server/ws-handler.ts`

Replace the `setImmediate` yield block. Run tests — all should pass.

#### Task 5: REFACTOR — Review and clean up
- Verify no dead code
- Run full `npm test` — no regressions
- Run `npm run verify` — type-checks pass

#### Task 6: Integration test
File: `test/server/ws-handshake-snapshot.test.ts` (extend)

Test: `completes handshake without backpressure close when sending large session data with constrained buffer`
- Set small chunk size + small backpressure limit to force the drain path
- Verify all chunks arrive and connection stays open

### Cleanup

- Remove `dist/client/ws-test.html` after manual verification
