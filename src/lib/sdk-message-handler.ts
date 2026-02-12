import type { AppDispatch } from '@/store/store'
import {
  sessionCreated,
  sessionInit,
  addAssistantMessage,
  setStreaming,
  appendStreamDelta,
  clearStreaming,
  addPermissionRequest,
  removePermission,
  setSessionStatus,
  turnResult,
  sessionExited,
  replayHistory,
  sessionError,
  removeSession,
} from '@/store/claudeChatSlice'

/**
 * Handle incoming SDK WebSocket messages and dispatch Redux actions.
 * Returns true if the message was handled (i.e. it was an sdk.* message).
 */
export function handleSdkMessage(dispatch: AppDispatch, msg: Record<string, unknown>): boolean {
  switch (msg.type) {
    case 'sdk.created':
      dispatch(sessionCreated({
        requestId: msg.requestId as string,
        sessionId: msg.sessionId as string,
      }))
      return true

    case 'sdk.session.init':
      dispatch(sessionInit({
        sessionId: msg.sessionId as string,
        cliSessionId: msg.cliSessionId as string | undefined,
        model: msg.model as string | undefined,
        cwd: msg.cwd as string | undefined,
        tools: msg.tools as Array<{ name: string }> | undefined,
      }))
      return true

    case 'sdk.assistant':
      dispatch(addAssistantMessage({
        sessionId: msg.sessionId as string,
        content: msg.content as any[],
        model: msg.model as string | undefined,
      }))
      return true

    case 'sdk.stream': {
      const event = msg.event as Record<string, unknown> | undefined
      if (event?.type === 'content_block_start') {
        dispatch(setStreaming({ sessionId: msg.sessionId as string, active: true }))
      }
      if (event?.type === 'content_block_delta') {
        const delta = event.delta as Record<string, unknown> | undefined
        if (delta?.type === 'text_delta') {
          dispatch(appendStreamDelta({
            sessionId: msg.sessionId as string,
            text: delta.text as string,
          }))
        }
      }
      if (event?.type === 'content_block_stop') {
        dispatch(clearStreaming({ sessionId: msg.sessionId as string }))
      }
      return true
    }

    case 'sdk.result':
      dispatch(turnResult({
        sessionId: msg.sessionId as string,
        costUsd: msg.costUsd as number | undefined,
        durationMs: msg.durationMs as number | undefined,
        usage: msg.usage as { input_tokens: number; output_tokens: number } | undefined,
      }))
      return true

    case 'sdk.permission.request':
      dispatch(addPermissionRequest({
        sessionId: msg.sessionId as string,
        requestId: msg.requestId as string,
        subtype: msg.subtype as string,
        tool: msg.tool as { name: string; input?: Record<string, unknown> } | undefined,
      }))
      return true

    case 'sdk.permission.cancelled':
      dispatch(removePermission({
        sessionId: msg.sessionId as string,
        requestId: msg.requestId as string,
      }))
      return true

    case 'sdk.status':
      dispatch(setSessionStatus({
        sessionId: msg.sessionId as string,
        status: msg.status as any,
      }))
      return true

    case 'sdk.exit':
      dispatch(sessionExited({
        sessionId: msg.sessionId as string,
        exitCode: msg.exitCode as number | undefined,
      }))
      return true

    case 'sdk.history':
      dispatch(replayHistory({
        sessionId: msg.sessionId as string,
        messages: msg.messages as Array<{ role: 'user' | 'assistant'; content: any[]; timestamp?: string }>,
      }))
      return true

    case 'sdk.error':
      dispatch(sessionError({
        sessionId: msg.sessionId as string,
        message: (msg.message as string) || (msg.error as string) || 'Unknown error',
      }))
      return true

    case 'sdk.killed':
      // Session killed confirmation — clean up client state
      dispatch(removeSession({
        sessionId: msg.sessionId as string,
      }))
      return true

    default:
      return false
  }
}
