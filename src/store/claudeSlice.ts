// src/store/claudeSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { ClaudeEvent, MessageEvent, ResultEvent } from '@/lib/claude-types'

export interface ClaudeSessionState {
  sessionId: string
  prompt: string
  status: 'running' | 'completed' | 'error'
  messages: MessageEvent[]
  result?: ResultEvent
  claudeSessionId?: string
  cwd?: string
  createdAt: number
}

interface ClaudeState {
  sessions: Record<string, ClaudeSessionState>
}

const initialState: ClaudeState = {
  sessions: {},
}

const claudeSlice = createSlice({
  name: 'claude',
  initialState,
  reducers: {
    createClaudeSession(state, action: PayloadAction<{ sessionId: string; prompt: string; cwd?: string }>) {
      state.sessions[action.payload.sessionId] = {
        sessionId: action.payload.sessionId,
        prompt: action.payload.prompt,
        cwd: action.payload.cwd,
        status: 'running',
        messages: [],
        createdAt: Date.now(),
      }
    },

    addClaudeEvent(state, action: PayloadAction<{ sessionId: string; event: ClaudeEvent }>) {
      const session = state.sessions[action.payload.sessionId]
      if (session) {
        const event = action.payload.event
        if (event.type === 'assistant' || event.type === 'user') {
          session.messages.push(event)
        }

        if (event.type === 'result') {
          session.result = event
        }

        // Extract Claude's session ID from init event
        if (
          event.type === 'system' &&
          'subtype' in event &&
          event.subtype === 'init'
        ) {
          session.claudeSessionId = event.session_id
          session.cwd = event.cwd || session.cwd
        }
      }
    },

    setClaudeSessionStatus(
      state,
      action: PayloadAction<{ sessionId: string; status: ClaudeSessionState['status'] }>
    ) {
      const session = state.sessions[action.payload.sessionId]
      if (session) {
        session.status = action.payload.status
      }
    },

    clearClaudeSession(state, action: PayloadAction<{ sessionId: string }>) {
      delete state.sessions[action.payload.sessionId]
    },
  },
})

export const { createClaudeSession, addClaudeEvent, setClaudeSessionStatus, clearClaudeSession } = claudeSlice.actions

export default claudeSlice.reducer
