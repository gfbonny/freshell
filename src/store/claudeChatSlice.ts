import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { ClaudeChatState, ChatContentBlock, ChatSessionState } from './claudeChatTypes'

const initialState: ClaudeChatState = {
  sessions: {},
  pendingCreates: {},
}

const claudeChatSlice = createSlice({
  name: 'claudeChat',
  initialState,
  reducers: {
    sessionCreated(state, action: PayloadAction<{ requestId: string; sessionId: string }>) {
      const { requestId, sessionId } = action.payload
      state.sessions[sessionId] = {
        sessionId,
        status: 'starting',
        messages: [],
        streamingText: '',
        streamingActive: false,
        pendingPermissions: {},
        totalCostUsd: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
      }
      state.pendingCreates[requestId] = sessionId
    },

    sessionInit(state, action: PayloadAction<{
      sessionId: string
      cliSessionId?: string
      model?: string
      cwd?: string
      tools?: Array<{ name: string }>
    }>) {
      const session = state.sessions[action.payload.sessionId]
      if (!session) return
      session.cliSessionId = action.payload.cliSessionId
      session.model = action.payload.model
      session.cwd = action.payload.cwd
      session.tools = action.payload.tools
      session.status = 'connected'
    },

    addUserMessage(state, action: PayloadAction<{
      sessionId: string
      text: string
    }>) {
      const session = state.sessions[action.payload.sessionId]
      if (!session) return
      session.messages.push({
        role: 'user',
        content: [{ type: 'text', text: action.payload.text }],
        timestamp: new Date().toISOString(),
      })
      session.status = 'running'
    },

    addAssistantMessage(state, action: PayloadAction<{
      sessionId: string
      content: ChatContentBlock[]
      model?: string
    }>) {
      const session = state.sessions[action.payload.sessionId]
      if (!session) return
      session.messages.push({
        role: 'assistant',
        content: action.payload.content,
        timestamp: new Date().toISOString(),
        model: action.payload.model,
      })
      session.status = 'running'
    },

    setStreaming(state, action: PayloadAction<{ sessionId: string; active: boolean }>) {
      const session = state.sessions[action.payload.sessionId]
      if (!session) return
      session.streamingActive = action.payload.active
      if (action.payload.active) {
        session.streamingText = ''
      }
    },

    appendStreamDelta(state, action: PayloadAction<{ sessionId: string; text: string }>) {
      const session = state.sessions[action.payload.sessionId]
      if (!session) return
      session.streamingText += action.payload.text
    },

    clearStreaming(state, action: PayloadAction<{ sessionId: string }>) {
      const session = state.sessions[action.payload.sessionId]
      if (!session) return
      session.streamingText = ''
      session.streamingActive = false
    },

    addPermissionRequest(state, action: PayloadAction<{
      sessionId: string
      requestId: string
      subtype: string
      tool?: { name: string; input?: Record<string, unknown> }
    }>) {
      const session = state.sessions[action.payload.sessionId]
      if (!session) return
      session.pendingPermissions[action.payload.requestId] = {
        requestId: action.payload.requestId,
        subtype: action.payload.subtype,
        tool: action.payload.tool,
      }
    },

    removePermission(state, action: PayloadAction<{ sessionId: string; requestId: string }>) {
      const session = state.sessions[action.payload.sessionId]
      if (!session) return
      delete session.pendingPermissions[action.payload.requestId]
    },

    setSessionStatus(state, action: PayloadAction<{
      sessionId: string
      status: ChatSessionState['status']
    }>) {
      const session = state.sessions[action.payload.sessionId]
      if (!session) return
      session.status = action.payload.status
    },

    turnResult(state, action: PayloadAction<{
      sessionId: string
      costUsd?: number
      durationMs?: number
      usage?: { input_tokens: number; output_tokens: number }
    }>) {
      const session = state.sessions[action.payload.sessionId]
      if (!session) return
      if (action.payload.costUsd) session.totalCostUsd += action.payload.costUsd
      if (action.payload.usage) {
        session.totalInputTokens += action.payload.usage.input_tokens
        session.totalOutputTokens += action.payload.usage.output_tokens
      }
      session.status = 'idle'
      session.streamingActive = false
      session.streamingText = ''
    },

    sessionExited(state, action: PayloadAction<{ sessionId: string; exitCode?: number }>) {
      const session = state.sessions[action.payload.sessionId]
      if (!session) return
      session.status = 'exited'
      session.streamingActive = false
    },

    removeSession(state, action: PayloadAction<{ sessionId: string }>) {
      delete state.sessions[action.payload.sessionId]
    },
  },
})

export const {
  sessionCreated,
  sessionInit,
  addUserMessage,
  addAssistantMessage,
  setStreaming,
  appendStreamDelta,
  clearStreaming,
  addPermissionRequest,
  removePermission,
  setSessionStatus,
  turnResult,
  sessionExited,
  removeSession,
} = claudeChatSlice.actions

export default claudeChatSlice.reducer
