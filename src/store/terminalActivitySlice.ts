import { createSlice, PayloadAction } from '@reduxjs/toolkit'

/**
 * Transient state for tracking terminal output activity.
 * NOT persisted - this is purely runtime UI state.
 */
export interface TerminalActivityState {
  /** Map of paneId -> last output timestamp */
  lastOutputAt: Record<string, number>
  /** Set of paneIds that have finished streaming and are awaiting user attention */
  ready: Record<string, boolean>
}

const initialState: TerminalActivityState = {
  lastOutputAt: {},
  ready: {},
}

/** Threshold in ms to consider a terminal "streaming" */
export const STREAMING_THRESHOLD_MS = 1000

/** Debounce window for sound notifications */
export const SOUND_DEBOUNCE_MS = 2000

export const terminalActivitySlice = createSlice({
  name: 'terminalActivity',
  initialState,
  reducers: {
    /** Record output activity for a pane */
    recordOutput: (state, action: PayloadAction<{ paneId: string }>) => {
      const { paneId } = action.payload
      state.lastOutputAt[paneId] = Date.now()
      // Clear ready state when new output arrives (terminal is working again)
      delete state.ready[paneId]
    },

    /** Mark a pane as ready (finished streaming, awaiting attention) */
    markReady: (state, action: PayloadAction<{ paneId: string }>) => {
      const { paneId } = action.payload
      state.ready[paneId] = true
    },

    /** Clear ready state for a pane (user viewed it) */
    clearReady: (state, action: PayloadAction<{ paneId: string }>) => {
      const { paneId } = action.payload
      delete state.ready[paneId]
    },

    /** Clear all ready states for a tab's panes */
    clearReadyForTab: (state, action: PayloadAction<{ paneIds: string[] }>) => {
      const { paneIds } = action.payload
      for (const paneId of paneIds) {
        delete state.ready[paneId]
      }
    },

    /** Clean up state for removed panes */
    removePaneActivity: (state, action: PayloadAction<{ paneId: string }>) => {
      const { paneId } = action.payload
      delete state.lastOutputAt[paneId]
      delete state.ready[paneId]
    },
  },
})

export const {
  recordOutput,
  markReady,
  clearReady,
  clearReadyForTab,
  removePaneActivity,
} = terminalActivitySlice.actions

export default terminalActivitySlice.reducer
