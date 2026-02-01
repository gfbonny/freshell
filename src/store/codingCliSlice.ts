import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { NormalizedEvent, CodingCliProviderName } from '@/lib/coding-cli-types'

export const CODING_CLI_MAX_EVENTS = 1000

export interface CodingCliSessionState {
  sessionId: string
  provider: CodingCliProviderName
  prompt: string
  status: 'running' | 'completed' | 'error'
  events: NormalizedEvent[]
  eventStart: number
  eventCount: number
  providerSessionId?: string
  cwd?: string
  createdAt: number
}

export interface CodingCliPendingRequest {
  requestId: string
  provider: CodingCliProviderName
  prompt: string
  cwd?: string
  canceled?: boolean
  createdAt: number
}

interface CodingCliState {
  sessions: Record<string, CodingCliSessionState>
  pendingRequests: Record<string, CodingCliPendingRequest>
}

const initialState: CodingCliState = {
  sessions: {},
  pendingRequests: {},
}

const codingCliSlice = createSlice({
  name: 'codingCli',
  initialState,
  reducers: {
    createCodingCliSession(
      state,
      action: PayloadAction<{ sessionId: string; provider: CodingCliProviderName; prompt: string; cwd?: string }>
    ) {
      state.sessions[action.payload.sessionId] = {
        sessionId: action.payload.sessionId,
        provider: action.payload.provider,
        prompt: action.payload.prompt,
        cwd: action.payload.cwd,
        status: 'running',
        events: [],
        eventStart: 0,
        eventCount: 0,
        createdAt: Date.now(),
      }
    },

    addCodingCliEvent(state, action: PayloadAction<{ sessionId: string; event: NormalizedEvent }>) {
      const session = state.sessions[action.payload.sessionId]
      if (session) {
        if (session.events.length < CODING_CLI_MAX_EVENTS) {
          session.events.push(action.payload.event)
        } else {
          session.events[session.eventStart] = action.payload.event
          session.eventStart = (session.eventStart + 1) % CODING_CLI_MAX_EVENTS
        }
        session.eventCount += 1
        if (action.payload.event.type === 'session.start' || action.payload.event.type === 'session.init') {
          session.providerSessionId = action.payload.event.sessionId
        }
      }
    },

    setCodingCliSessionStatus(
      state,
      action: PayloadAction<{ sessionId: string; status: CodingCliSessionState['status'] }>
    ) {
      const session = state.sessions[action.payload.sessionId]
      if (session) {
        session.status = action.payload.status
      }
    },

    clearCodingCliSession(state, action: PayloadAction<{ sessionId: string }>) {
      delete state.sessions[action.payload.sessionId]
    },
    registerCodingCliRequest(
      state,
      action: PayloadAction<{ requestId: string; provider: CodingCliProviderName; prompt: string; cwd?: string }>
    ) {
      state.pendingRequests[action.payload.requestId] = {
        requestId: action.payload.requestId,
        provider: action.payload.provider,
        prompt: action.payload.prompt,
        cwd: action.payload.cwd,
        canceled: false,
        createdAt: Date.now(),
      }
    },
    cancelCodingCliRequest(state, action: PayloadAction<{ requestId: string }>) {
      const pending = state.pendingRequests[action.payload.requestId]
      if (pending) {
        pending.canceled = true
      }
    },
    resolveCodingCliRequest(state, action: PayloadAction<{ requestId: string }>) {
      delete state.pendingRequests[action.payload.requestId]
    },
  },
})

export function getCodingCliSessionEvents(session: CodingCliSessionState): NormalizedEvent[] {
  if (session.events.length === 0) return []
  if (session.eventStart === 0 || session.events.length < CODING_CLI_MAX_EVENTS) {
    return session.events
  }
  return [
    ...session.events.slice(session.eventStart),
    ...session.events.slice(0, session.eventStart),
  ]
}

export const {
  createCodingCliSession,
  addCodingCliEvent,
  setCodingCliSessionStatus,
  clearCodingCliSession,
  registerCodingCliRequest,
  cancelCodingCliRequest,
  resolveCodingCliRequest,
} = codingCliSlice.actions

export default codingCliSlice.reducer
