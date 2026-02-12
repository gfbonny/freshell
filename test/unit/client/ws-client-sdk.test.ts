import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleSdkMessage } from '../../../src/lib/sdk-message-handler'
import * as claudeChatSlice from '../../../src/store/claudeChatSlice'

describe('SDK Message Handler', () => {
  const dispatch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handles sdk.created', () => {
    const handled = handleSdkMessage(dispatch, {
      type: 'sdk.created',
      requestId: 'req-1',
      sessionId: 'sess-1',
    })
    expect(handled).toBe(true)
    expect(dispatch).toHaveBeenCalledWith(
      claudeChatSlice.sessionCreated({ requestId: 'req-1', sessionId: 'sess-1' })
    )
  })

  it('handles sdk.session.init', () => {
    const handled = handleSdkMessage(dispatch, {
      type: 'sdk.session.init',
      sessionId: 'sess-1',
      cliSessionId: 'cli-123',
      model: 'claude-sonnet-4-5-20250929',
      cwd: '/home/user',
      tools: [{ name: 'Bash' }],
    })
    expect(handled).toBe(true)
    expect(dispatch).toHaveBeenCalledWith(
      claudeChatSlice.sessionInit({
        sessionId: 'sess-1',
        cliSessionId: 'cli-123',
        model: 'claude-sonnet-4-5-20250929',
        cwd: '/home/user',
        tools: [{ name: 'Bash' }],
      })
    )
  })

  it('handles sdk.assistant', () => {
    const handled = handleSdkMessage(dispatch, {
      type: 'sdk.assistant',
      sessionId: 'sess-1',
      content: [{ type: 'text', text: 'Hello' }],
      model: 'claude-sonnet-4-5-20250929',
    })
    expect(handled).toBe(true)
    expect(dispatch).toHaveBeenCalledWith(
      claudeChatSlice.addAssistantMessage({
        sessionId: 'sess-1',
        content: [{ type: 'text', text: 'Hello' }],
        model: 'claude-sonnet-4-5-20250929',
      })
    )
  })

  it('handles sdk.stream content_block_start', () => {
    const handled = handleSdkMessage(dispatch, {
      type: 'sdk.stream',
      sessionId: 'sess-1',
      event: { type: 'content_block_start' },
    })
    expect(handled).toBe(true)
    expect(dispatch).toHaveBeenCalledWith(
      claudeChatSlice.setStreaming({ sessionId: 'sess-1', active: true })
    )
  })

  it('handles sdk.stream content_block_delta with text_delta', () => {
    const handled = handleSdkMessage(dispatch, {
      type: 'sdk.stream',
      sessionId: 'sess-1',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
    })
    expect(handled).toBe(true)
    expect(dispatch).toHaveBeenCalledWith(
      claudeChatSlice.appendStreamDelta({ sessionId: 'sess-1', text: 'Hello' })
    )
  })

  it('handles sdk.stream content_block_stop', () => {
    const handled = handleSdkMessage(dispatch, {
      type: 'sdk.stream',
      sessionId: 'sess-1',
      event: { type: 'content_block_stop' },
    })
    expect(handled).toBe(true)
    expect(dispatch).toHaveBeenCalledWith(
      claudeChatSlice.clearStreaming({ sessionId: 'sess-1' })
    )
  })

  it('handles sdk.stream with unknown event type without dispatching', () => {
    const handled = handleSdkMessage(dispatch, {
      type: 'sdk.stream',
      sessionId: 'sess-1',
      event: { type: 'message_start' },
    })
    expect(handled).toBe(true)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('handles sdk.result', () => {
    const handled = handleSdkMessage(dispatch, {
      type: 'sdk.result',
      sessionId: 'sess-1',
      costUsd: 0.05,
      durationMs: 3000,
      usage: { input_tokens: 1000, output_tokens: 500 },
    })
    expect(handled).toBe(true)
    expect(dispatch).toHaveBeenCalledWith(
      claudeChatSlice.turnResult({
        sessionId: 'sess-1',
        costUsd: 0.05,
        durationMs: 3000,
        usage: { input_tokens: 1000, output_tokens: 500 },
      })
    )
  })

  it('handles sdk.permission.request', () => {
    const handled = handleSdkMessage(dispatch, {
      type: 'sdk.permission.request',
      sessionId: 'sess-1',
      requestId: 'perm-1',
      subtype: 'can_use_tool',
      tool: { name: 'Bash', input: { command: 'ls' } },
    })
    expect(handled).toBe(true)
    expect(dispatch).toHaveBeenCalledWith(
      claudeChatSlice.addPermissionRequest({
        sessionId: 'sess-1',
        requestId: 'perm-1',
        subtype: 'can_use_tool',
        tool: { name: 'Bash', input: { command: 'ls' } },
      })
    )
  })

  it('handles sdk.permission.cancelled', () => {
    const handled = handleSdkMessage(dispatch, {
      type: 'sdk.permission.cancelled',
      sessionId: 'sess-1',
      requestId: 'perm-1',
    })
    expect(handled).toBe(true)
    expect(dispatch).toHaveBeenCalledWith(
      claudeChatSlice.removePermission({
        sessionId: 'sess-1',
        requestId: 'perm-1',
      })
    )
  })

  it('handles sdk.status', () => {
    const handled = handleSdkMessage(dispatch, {
      type: 'sdk.status',
      sessionId: 'sess-1',
      status: 'idle',
    })
    expect(handled).toBe(true)
    expect(dispatch).toHaveBeenCalledWith(
      claudeChatSlice.setSessionStatus({
        sessionId: 'sess-1',
        status: 'idle',
      })
    )
  })

  it('handles sdk.exit', () => {
    const handled = handleSdkMessage(dispatch, {
      type: 'sdk.exit',
      sessionId: 'sess-1',
      exitCode: 0,
    })
    expect(handled).toBe(true)
    expect(dispatch).toHaveBeenCalledWith(
      claudeChatSlice.sessionExited({
        sessionId: 'sess-1',
        exitCode: 0,
      })
    )
  })

  it('handles sdk.history without dispatching', () => {
    const handled = handleSdkMessage(dispatch, {
      type: 'sdk.history',
      sessionId: 'sess-1',
      messages: [],
    })
    expect(handled).toBe(true)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('handles sdk.error without dispatching', () => {
    const handled = handleSdkMessage(dispatch, {
      type: 'sdk.error',
      sessionId: 'sess-1',
      error: 'Something went wrong',
    })
    expect(handled).toBe(true)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('returns false for non-SDK messages', () => {
    const handled = handleSdkMessage(dispatch, {
      type: 'terminal.created',
      terminalId: 'term-1',
    })
    expect(handled).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('returns false for messages without a type', () => {
    const handled = handleSdkMessage(dispatch, {
      sessionId: 'sess-1',
    })
    expect(handled).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })
})
