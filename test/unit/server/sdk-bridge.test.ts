import { EventEmitter } from 'events'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SdkBridge } from '../../../server/sdk-bridge.js'

// Mock child_process.spawn
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return {
    ...actual,
    spawn: vi.fn(() => {
      const proc = new EventEmitter() as EventEmitter & { pid: number; kill: ReturnType<typeof vi.fn>; stdout: EventEmitter; stderr: EventEmitter }
      proc.pid = 12345
      proc.kill = vi.fn()
      proc.stdout = new EventEmitter()
      proc.stderr = new EventEmitter()
      return proc
    }),
  }
})

describe('SdkBridge', () => {
  let bridge: SdkBridge

  beforeEach(() => {
    bridge = new SdkBridge({ port: 0 })
  })

  afterEach(() => {
    bridge.close()
  })

  describe('session lifecycle', () => {
    it('creates a session with unique ID', () => {
      const session = bridge.createSession({ cwd: '/tmp' })
      expect(session.sessionId).toBeTruthy()
      expect(session.status).toBe('starting')
      expect(session.cwd).toBe('/tmp')
    })

    it('lists active sessions', () => {
      bridge.createSession({ cwd: '/tmp' })
      bridge.createSession({ cwd: '/home' })
      expect(bridge.listSessions()).toHaveLength(2)
    })

    it('gets session by ID', () => {
      const session = bridge.createSession({ cwd: '/tmp' })
      expect(bridge.getSession(session.sessionId)).toBeDefined()
      expect(bridge.getSession('nonexistent')).toBeUndefined()
    })

    it('kills a session', () => {
      const session = bridge.createSession({ cwd: '/tmp' })
      const killed = bridge.killSession(session.sessionId)
      expect(killed).toBe(true)
      expect(bridge.getSession(session.sessionId)?.status).toBe('exited')
    })

    it('returns false when killing nonexistent session', () => {
      expect(bridge.killSession('nonexistent')).toBe(false)
    })

    it('cleans up on spawn error and broadcasts sdk.error + sdk.exit', () => {
      const session = bridge.createSession({ cwd: '/tmp' })
      const sid = session.sessionId
      const received: unknown[] = []
      bridge.subscribe(sid, (msg) => received.push(msg))

      // Simulate spawn error (e.g. CLI not found)
      const sp = (bridge as any).processes.get(sid)
      sp.proc.emit('error', new Error('spawn claude ENOENT'))

      // Session should be cleaned up
      expect(bridge.getSession(sid)).toBeUndefined()
      expect(bridge.listSessions()).toHaveLength(0)

      // Should have broadcast sdk.error then sdk.exit
      expect(received).toHaveLength(2)
      expect((received[0] as any).type).toBe('sdk.error')
      expect((received[0] as any).message).toContain('spawn claude ENOENT')
      expect((received[1] as any).type).toBe('sdk.exit')
    })

    it('cleans up session and process maps on process exit', () => {
      const session = bridge.createSession({ cwd: '/tmp' })
      const sid = session.sessionId
      expect(bridge.getSession(sid)).toBeDefined()
      expect(bridge.listSessions()).toHaveLength(1)

      // Simulate process exit
      const sp = (bridge as any).processes.get(sid)
      sp.proc.emit('exit', 0)

      // Session and process should be cleaned up
      expect(bridge.getSession(sid)).toBeUndefined()
      expect(bridge.listSessions()).toHaveLength(0)
    })
  })

  describe('CLI message handling', () => {
    it('processes a valid assistant message and stores it', () => {
      const session = bridge.createSession({ cwd: '/tmp' })
      ;(bridge as any).handleCliMessage(session.sessionId, {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'hi' }] },
      })
      expect(bridge.getSession(session.sessionId)?.messages).toHaveLength(1)
    })

    it('ignores messages with unknown types gracefully', () => {
      const session = bridge.createSession({ cwd: '/tmp' })
      ;(bridge as any).handleCliMessage(session.sessionId, { type: 'bogus_unknown' })
      expect(bridge.getSession(session.sessionId)?.messages).toHaveLength(0)
    })
  })

  describe('message routing', () => {
    it('stores assistant messages in session history', () => {
      const session = bridge.createSession({ cwd: '/tmp' })
      ;(bridge as any).handleCliMessage(session.sessionId, {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Hello' }],
          model: 'claude-sonnet-4-5-20250929',
        },
      })
      const state = bridge.getSession(session.sessionId)
      expect(state?.messages).toHaveLength(1)
      expect(state?.messages[0].role).toBe('assistant')
    })

    it('tracks permission requests', () => {
      const session = bridge.createSession({ cwd: '/tmp' })
      ;(bridge as any).handleCliMessage(session.sessionId, {
        type: 'control_request',
        id: 'perm-1',
        subtype: 'can_use_tool',
        tool: { name: 'Bash', input: { command: 'ls' } },
      })
      const state = bridge.getSession(session.sessionId)
      expect(state?.pendingPermissions.size).toBe(1)
      expect(state?.pendingPermissions.get('perm-1')).toBeDefined()
    })

    it('updates session state on system/init', () => {
      const session = bridge.createSession({ cwd: '/tmp' })
      ;(bridge as any).handleCliMessage(session.sessionId, {
        type: 'system',
        subtype: 'init',
        session_id: 'claude-session-abc',
        model: 'claude-opus-4-6',
        tools: [{ name: 'Bash' }, { name: 'Read' }],
      })
      const state = bridge.getSession(session.sessionId)
      expect(state?.cliSessionId).toBe('claude-session-abc')
      expect(state?.model).toBe('claude-opus-4-6')
      expect(state?.status).toBe('connected')
    })

    it('updates cost tracking on result', () => {
      const session = bridge.createSession({ cwd: '/tmp' })
      ;(bridge as any).handleCliMessage(session.sessionId, {
        type: 'result',
        result: 'success',
        cost_usd: 0.05,
        usage: { input_tokens: 1000, output_tokens: 500 },
      })
      const state = bridge.getSession(session.sessionId)
      expect(state?.costUsd).toBe(0.05)
      expect(state?.totalInputTokens).toBe(1000)
    })

    it('broadcasts to subscribed listeners', () => {
      const session = bridge.createSession({ cwd: '/tmp' })
      const received: unknown[] = []
      bridge.subscribe(session.sessionId, (msg) => received.push(msg))

      ;(bridge as any).handleCliMessage(session.sessionId, {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'hello' }] },
      })

      expect(received).toHaveLength(1)
      expect((received[0] as any).type).toBe('sdk.assistant')
    })

    it('unsubscribe removes listener', () => {
      const session = bridge.createSession({ cwd: '/tmp' })
      const received: unknown[] = []
      const unsub = bridge.subscribe(session.sessionId, (msg) => received.push(msg))

      unsub!()

      ;(bridge as any).handleCliMessage(session.sessionId, {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'hello' }] },
      })

      expect(received).toHaveLength(0)
    })

    it('subscribe returns null for nonexistent session', () => {
      const unsub = bridge.subscribe('nonexistent', () => {})
      expect(unsub).toBeNull()
    })

    it('emits message event on broadcast', () => {
      const session = bridge.createSession({ cwd: '/tmp' })
      const emitted: unknown[] = []
      bridge.on('message', (_sid, msg) => emitted.push(msg))

      ;(bridge as any).handleCliMessage(session.sessionId, {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'hello' }] },
      })

      expect(emitted).toHaveLength(1)
      expect((emitted[0] as any).type).toBe('sdk.assistant')
    })

    it('sets status to idle on result', () => {
      const session = bridge.createSession({ cwd: '/tmp' })
      ;(bridge as any).handleCliMessage(session.sessionId, {
        type: 'result',
        result: 'success',
      })
      expect(bridge.getSession(session.sessionId)?.status).toBe('idle')
    })

    it('accumulates cost_usd of 0 without skipping', () => {
      const session = bridge.createSession({ cwd: '/tmp' })
      ;(bridge as any).handleCliMessage(session.sessionId, {
        type: 'result',
        result: 'success',
        cost_usd: 0.05,
        usage: { input_tokens: 1000, output_tokens: 500 },
      })
      ;(bridge as any).handleCliMessage(session.sessionId, {
        type: 'result',
        result: 'success',
        cost_usd: 0,
        usage: { input_tokens: 0, output_tokens: 0 },
      })
      const state = bridge.getSession(session.sessionId)
      expect(state?.costUsd).toBe(0.05)
      expect(state?.totalInputTokens).toBe(1000)
    })

    it('sets status to running on assistant message', () => {
      const session = bridge.createSession({ cwd: '/tmp' })
      ;(bridge as any).handleCliMessage(session.sessionId, {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'working...' }] },
      })
      expect(bridge.getSession(session.sessionId)?.status).toBe('running')
    })

    it('broadcasts stream events', () => {
      const session = bridge.createSession({ cwd: '/tmp' })
      const received: unknown[] = []
      bridge.subscribe(session.sessionId, (msg) => received.push(msg))

      ;(bridge as any).handleCliMessage(session.sessionId, {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } },
      })

      expect(received).toHaveLength(1)
      expect((received[0] as any).type).toBe('sdk.stream')
    })
  })

  describe('sendUserMessage', () => {
    it('stores user message in session history', () => {
      const session = bridge.createSession({ cwd: '/tmp' })
      bridge.sendUserMessage(session.sessionId, 'hello')
      const state = bridge.getSession(session.sessionId)
      expect(state?.messages).toHaveLength(1)
      expect(state?.messages[0].role).toBe('user')
    })

    it('returns false for nonexistent session', () => {
      expect(bridge.sendUserMessage('nonexistent', 'hello')).toBe(false)
    })
  })

  describe('respondPermission', () => {
    it('removes pending permission after response', () => {
      const session = bridge.createSession({ cwd: '/tmp' })
      ;(bridge as any).handleCliMessage(session.sessionId, {
        type: 'control_request',
        id: 'perm-1',
        subtype: 'can_use_tool',
        tool: { name: 'Bash', input: { command: 'ls' } },
      })
      expect(bridge.getSession(session.sessionId)?.pendingPermissions.size).toBe(1)

      bridge.respondPermission(session.sessionId, 'perm-1', 'allow')
      expect(bridge.getSession(session.sessionId)?.pendingPermissions.size).toBe(0)
    })
  })

  describe('interrupt', () => {
    it('returns false for nonexistent session', () => {
      expect(bridge.interrupt('nonexistent')).toBe(false)
    })

    it('queues interrupt message for existing session', () => {
      const session = bridge.createSession({ cwd: '/tmp' })
      expect(bridge.interrupt(session.sessionId)).toBe(true)
    })
  })
})
