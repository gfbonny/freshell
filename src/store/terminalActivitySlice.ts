import { createSlice, PayloadAction } from '@reduxjs/toolkit'

/**
 * Transient state for tracking terminal output activity.
 * NOT persisted - this is purely runtime UI state.
 *
 * State machine:
 * - Ready (default): idle, green dot
 * - Working: streaming, pulsing grey (can only be entered when tab is active)
 * - Finished: streaming stopped, green ring (only visible on background tabs)
 *
 * Transitions:
 * - Ready → Working: output starts AND tab is active
 * - Working → Finished: output stops (20s idle)
 * - Finished → Ready: user clicks on tab
 */
export interface TerminalActivityState {
  /** Map of paneId -> last output timestamp */
  lastOutputAt: Record<string, number>
  /** Map of paneId -> last input timestamp (for filtering echo) */
  lastInputAt: Record<string, number>
  /** Set of paneIds currently in "working" state (streaming, entered while active) */
  working: Record<string, boolean>
  /** Set of paneIds in "finished" state (was working, now idle, awaiting attention) */
  finished: Record<string, boolean>
}

const initialState: TerminalActivityState = {
  lastOutputAt: {},
  lastInputAt: {},
  working: {},
  finished: {},
}

/** Threshold in ms to consider a terminal "streaming" (must be idle this long to trigger finished) */
export const STREAMING_THRESHOLD_MS = 20000

/** Threshold in ms for output to be considered "active" (for entering working state) */
export const WORKING_ENTER_THRESHOLD_MS = 2000

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
      // Clear finished state when new output arrives (terminal is working again)
      delete state.finished[paneId]
    },

    /** Record input activity for a pane (to filter out echo) */
    recordInput: (state, action: PayloadAction<{ paneId: string }>) => {
      const { paneId } = action.payload
      state.lastInputAt[paneId] = Date.now()
    },

    /** Enter working state (only called when tab is active and output starts) */
    enterWorking: (state, action: PayloadAction<{ paneId: string }>) => {
      const { paneId } = action.payload
      state.working[paneId] = true
    },

    /** Transition from working to finished (output stopped) */
    finishWorking: (state, action: PayloadAction<{ paneId: string }>) => {
      const { paneId } = action.payload
      delete state.working[paneId]
      state.finished[paneId] = true
    },

    /** Clear finished state for a tab's panes (user clicked on tab) */
    clearFinishedForTab: (state, action: PayloadAction<{ paneIds: string[] }>) => {
      const { paneIds } = action.payload
      for (const paneId of paneIds) {
        delete state.finished[paneId]
      }
    },

    /** Reset input timestamps for non-working panes (when tab becomes active) */
    resetInputForTab: (state, action: PayloadAction<{ paneIds: string[] }>) => {
      const { paneIds } = action.payload
      for (const paneId of paneIds) {
        // Only reset if pane is not currently working
        if (!state.working[paneId]) {
          delete state.lastInputAt[paneId]
        }
      }
    },

    /** Clean up all state for removed panes */
    removePaneActivity: (state, action: PayloadAction<{ paneId: string }>) => {
      const { paneId } = action.payload
      delete state.lastOutputAt[paneId]
      delete state.lastInputAt[paneId]
      delete state.working[paneId]
      delete state.finished[paneId]
    },
  },
})

export const {
  recordOutput,
  recordInput,
  enterWorking,
  finishWorking,
  clearFinishedForTab,
  resetInputForTab,
  removePaneActivity,
} = terminalActivitySlice.actions

export default terminalActivitySlice.reducer
