import { describe, it, expect } from 'vitest'
import {
  CliMessageSchema,
  BrowserSdkMessageSchema,
} from '../../../server/sdk-bridge-types.js'

describe('SDK Protocol Types', () => {
  describe('CliMessageSchema', () => {
    it('validates system/init message', () => {
      const msg = {
        type: 'system',
        subtype: 'init',
        session_id: 'abc-123',
        tools: [{ name: 'Bash' }],
        model: 'claude-sonnet-4-5-20250929',
        cwd: '/home/user/project',
      }
      const result = CliMessageSchema.safeParse(msg)
      expect(result.success).toBe(true)
    })

    it('validates assistant message with content blocks', () => {
      const msg = {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Hello world' },
            { type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'ls' } },
          ],
          model: 'claude-sonnet-4-5-20250929',
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      }
      const result = CliMessageSchema.safeParse(msg)
      expect(result.success).toBe(true)
    })

    it('validates result message', () => {
      const msg = {
        type: 'result',
        result: 'success',
        duration_ms: 5000,
        cost_usd: 0.01,
        usage: { input_tokens: 100, output_tokens: 50 },
      }
      const result = CliMessageSchema.safeParse(msg)
      expect(result.success).toBe(true)
    })

    it('validates stream_event message', () => {
      const msg = {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Hello' },
        },
      }
      const result = CliMessageSchema.safeParse(msg)
      expect(result.success).toBe(true)
    })

    it('validates control_request (permission) message', () => {
      const msg = {
        type: 'control_request',
        id: 'req-1',
        subtype: 'can_use_tool',
        tool: { name: 'Bash', input: { command: 'rm -rf /' } },
      }
      const result = CliMessageSchema.safeParse(msg)
      expect(result.success).toBe(true)
    })

    it('rejects unknown type', () => {
      const result = CliMessageSchema.safeParse({ type: 'bogus' })
      expect(result.success).toBe(false)
    })
  })

  describe('BrowserSdkMessageSchema', () => {
    it('validates sdk.create message', () => {
      const msg = {
        type: 'sdk.create',
        requestId: 'req-1',
        cwd: '/home/user/project',
        resumeSessionId: 'session-abc',
      }
      const result = BrowserSdkMessageSchema.safeParse(msg)
      expect(result.success).toBe(true)
    })

    it('validates sdk.send message', () => {
      const msg = {
        type: 'sdk.send',
        sessionId: 'sess-1',
        text: 'Write a hello world function',
      }
      const result = BrowserSdkMessageSchema.safeParse(msg)
      expect(result.success).toBe(true)
    })

    it('validates sdk.permission.respond message', () => {
      const msg = {
        type: 'sdk.permission.respond',
        sessionId: 'sess-1',
        requestId: 'perm-1',
        behavior: 'allow',
      }
      const result = BrowserSdkMessageSchema.safeParse(msg)
      expect(result.success).toBe(true)
    })

    it('validates sdk.interrupt message', () => {
      const msg = {
        type: 'sdk.interrupt',
        sessionId: 'sess-1',
      }
      const result = BrowserSdkMessageSchema.safeParse(msg)
      expect(result.success).toBe(true)
    })
  })
})
