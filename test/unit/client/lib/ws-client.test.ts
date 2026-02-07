import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WsClient } from '../../../../src/lib/ws-client'

class MockWebSocket {
  static OPEN = 1
  static instances: MockWebSocket[] = []

  readyState = MockWebSocket.OPEN
  onopen: null | (() => void) = null
  onmessage: null | ((ev: { data: string }) => void) = null
  onclose: null | ((ev: { code: number; reason: string }) => void) = null
  onerror: null | (() => void) = null
  sent: string[] = []

  constructor(_url: string) {
    MockWebSocket.instances.push(this)
  }

  send(data: any) {
    this.sent.push(String(data))
  }

  close() {
    this.onclose?.({ code: 1000, reason: '' })
  }

  _open() {
    this.onopen?.()
  }

  _message(obj: any) {
    this.onmessage?.({ data: JSON.stringify(obj) })
  }

  _close(code: number, reason = '') {
    this.onclose?.({ code, reason })
  }
}

describe('WsClient.connect', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    MockWebSocket.instances = []
    // @ts-expect-error - test override
    globalThis.WebSocket = MockWebSocket
    localStorage.setItem('freshell.auth-token', 't')

    // Some Vitest environments provide a minimal window without timer fns.
    ;(window as any).setTimeout = globalThis.setTimeout
    ;(window as any).clearTimeout = globalThis.clearTimeout
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('returns the same in-flight promise and resolves only after ready', async () => {
    const c = new WsClient('ws://example/ws')

    const p1 = c.connect()
    const p2 = c.connect()
    expect(p2).toBe(p1)

    let resolved = false
    void p1.then(() => { resolved = true })

    // Not resolved until ready arrives.
    await Promise.resolve()
    expect(resolved).toBe(false)

    expect(MockWebSocket.instances).toHaveLength(1)
    MockWebSocket.instances[0]._open()
    MockWebSocket.instances[0]._message({ type: 'ready' })

    await p1
    expect(resolved).toBe(true)
  })

  it('treats HELLO_TIMEOUT as transient and schedules reconnect', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout')

    const c = new WsClient('ws://example/ws')
    const p = c.connect()
    expect(MockWebSocket.instances).toHaveLength(1)

    MockWebSocket.instances[0]._open()
    MockWebSocket.instances[0]._close(4002, 'Hello timeout')

    await expect(p).rejects.toThrow(/Handshake timeout/i)

    // Should schedule a reconnect attempt (baseReconnectDelay = 1000).
    expect(setTimeoutSpy.mock.calls.some((call) => call[1] === 1000)).toBe(true)
  })

  it('treats BACKPRESSURE as transient and schedules reconnect with a minimum delay', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout')

    const c = new WsClient('ws://example/ws')
    const p = c.connect()
    expect(MockWebSocket.instances).toHaveLength(1)

    MockWebSocket.instances[0]._open()
    MockWebSocket.instances[0]._close(4008, 'Backpressure')

    await expect(p).rejects.toThrow(/backpressure/i)

    const delays = setTimeoutSpy.mock.calls.map((call) => call[1]).filter((d): d is number => typeof d === 'number')
    expect(Math.max(...delays)).toBeGreaterThanOrEqual(5000)
  })
})

describe('WsClient.send terminal.create dedupe', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    MockWebSocket.instances = []
    // @ts-expect-error - test override
    globalThis.WebSocket = MockWebSocket
    localStorage.setItem('freshell.auth-token', 't')

    ;(window as any).setTimeout = globalThis.setTimeout
    ;(window as any).clearTimeout = globalThis.clearTimeout
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('dedupes duplicate terminal.create sends until terminal.created arrives', async () => {
    const c = new WsClient('ws://example/ws')
    const p = c.connect()
    expect(MockWebSocket.instances).toHaveLength(1)
    const ws = MockWebSocket.instances[0]

    ws._open()
    ws._message({ type: 'ready' })
    await p

    const requestId = 'req-1'
    c.send({ type: 'terminal.create', requestId, mode: 'shell' })
    c.send({ type: 'terminal.create', requestId, mode: 'shell' })

    const sentMessages = ws.sent.map((s) => JSON.parse(s))
    const creates = sentMessages.filter((m) => m.type === 'terminal.create' && m.requestId === requestId)
    expect(creates).toHaveLength(1)

    // When the create is acknowledged, a later send is allowed again.
    ws._message({ type: 'terminal.created', requestId, terminalId: 't1' })
    c.send({ type: 'terminal.create', requestId, mode: 'shell' })

    const sentMessages2 = ws.sent.map((s) => JSON.parse(s))
    const creates2 = sentMessages2.filter((m) => m.type === 'terminal.create' && m.requestId === requestId)
    expect(creates2).toHaveLength(2)
  })

  it('dedupes terminal.create messages queued before ready', async () => {
    const c = new WsClient('ws://example/ws')
    const p = c.connect()
    expect(MockWebSocket.instances).toHaveLength(1)
    const ws = MockWebSocket.instances[0]

    const requestId = 'req-queued'
    c.send({ type: 'terminal.create', requestId, mode: 'shell' })
    c.send({ type: 'terminal.create', requestId, mode: 'shell' })

    // Nothing sent yet (no socket open).
    expect(ws.sent).toEqual([])

    ws._open()
    ws._message({ type: 'ready' })
    await p

    const sentMessages = ws.sent.map((s) => JSON.parse(s))
    const creates = sentMessages.filter((m) => m.type === 'terminal.create' && m.requestId === requestId)
    expect(creates).toHaveLength(1)
  })

  it('clears dedupe on error responses', async () => {
    const c = new WsClient('ws://example/ws')
    const p = c.connect()
    const ws = MockWebSocket.instances[0]

    ws._open()
    ws._message({ type: 'ready' })
    await p

    const requestId = 'req-error'
    c.send({ type: 'terminal.create', requestId, mode: 'shell' })
    c.send({ type: 'terminal.create', requestId, mode: 'shell' })

    ws._message({ type: 'error', code: 'PTY_SPAWN_FAILED', message: 'boom', requestId })
    c.send({ type: 'terminal.create', requestId, mode: 'shell' })

    const sentMessages = ws.sent.map((s) => JSON.parse(s))
    const creates = sentMessages.filter((m) => m.type === 'terminal.create' && m.requestId === requestId)
    expect(creates).toHaveLength(2)
  })

  it('clears terminal.create dedupe when an enqueued create is dropped due to queue overflow', async () => {
    const c = new WsClient('ws://example/ws')
    const p = c.connect()
    const ws = MockWebSocket.instances[0]

    const requestId = 'req-drop'
    c.send({ type: 'terminal.create', requestId, mode: 'shell' })

    // Overflow the queue to drop the first message (maxQueueSize = 1000).
    for (let i = 0; i < 1000; i++) {
      c.send({ type: 'noop', i })
    }

    // Re-send should be allowed because the original was dropped.
    c.send({ type: 'terminal.create', requestId, mode: 'shell' })

    ws._open()
    ws._message({ type: 'ready' })
    await p

    const sent = ws.sent.map((s) => JSON.parse(s))
    const creates = sent.filter((m) => m.type === 'terminal.create' && m.requestId === requestId)
    expect(creates).toHaveLength(1)
  })
})
