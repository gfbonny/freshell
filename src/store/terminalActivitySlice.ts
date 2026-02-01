import { createSlice, PayloadAction } from '@reduxjs/toolkit'

/**
 * Transient state for tracking terminal output activity.
 * NOT persisted - this is purely runtime UI state.
 */
export interface TerminalActivityState {
  /** Map of paneId -> last output timestamp */
  lastOutputAt: Record<string, number>
  /** Map of paneId -> last input timestamp (for filtering echo) */
  lastInputAt: Record<string, number>
  /** Set of paneIds that have finished streaming and are awaiting user attention */
  ready: Record<string, boolean>
}

const initialState: TerminalActivityState = {
  lastOutputAt: {},
  lastInputAt: {},
  ready: {},
}

/** Threshold in ms to consider a terminal "streaming" (must be idle this long to trigger finished) */
export const STREAMING_THRESHOLD_MS = 20000

/** Window after input where output is considered echo (not streaming) */
export const INPUT_ECHO_WINDOW_MS = 200

/** Debounce window for sound notifications (30 seconds) */
export const SOUND_DEBOUNCE_MS = 30000

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

    /** Record input activity for a pane (to filter out echo) */
    recordInput: (state, action: PayloadAction<{ paneId: string }>) => {
      const { paneId } = action.payload
      state.lastInputAt[paneId] = Date.now()
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
      delete state.lastInputAt[paneId]
      delete state.ready[paneId]
    },
  },
})

export const {
  recordOutput,
  recordInput,
  markReady,
  clearReady,
  clearReadyForTab,
  removePaneActivity,
} = terminalActivitySlice.actions

export default terminalActivitySlice.reducer
