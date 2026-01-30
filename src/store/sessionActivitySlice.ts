import { createSlice, PayloadAction } from '@reduxjs/toolkit'

const STORAGE_KEY = 'freshell.sessionActivity.v1'

interface SessionActivityState {
  sessions: Record<string, number>
}

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

function loadFromStorage(): Record<string, number> {
  if (!canUseStorage()) return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function saveToStorage(sessions: Record<string, number>) {
  if (!canUseStorage()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  } catch {
    // Ignore storage errors (quota exceeded, etc.)
  }
}

const initialState: SessionActivityState = {
  sessions: loadFromStorage(),
}

export const sessionActivitySlice = createSlice({
  name: 'sessionActivity',
  initialState,
  reducers: {
    updateSessionActivity: (
      state,
      action: PayloadAction<{ sessionId: string; lastInputAt: number }>
    ) => {
      const { sessionId, lastInputAt } = action.payload
      const existing = state.sessions[sessionId] || 0

      if (lastInputAt > existing) {
        state.sessions[sessionId] = lastInputAt
        saveToStorage(state.sessions)
      }
    },
  },
})

export const { updateSessionActivity } = sessionActivitySlice.actions

export const selectSessionActivity = (
  state: { sessionActivity: SessionActivityState },
  sessionId: string
): number | undefined => state.sessionActivity.sessions[sessionId]

export const selectAllSessionActivity = (
  state: { sessionActivity: SessionActivityState }
): Record<string, number> => state.sessionActivity.sessions

export default sessionActivitySlice.reducer