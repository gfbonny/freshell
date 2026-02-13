import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { closePane, removeLayout } from './panesSlice.js'

type TurnCompletePayload = {
  tabId: string
  paneId: string
  terminalId: string
  at: number
}

export type TurnCompleteEvent = TurnCompletePayload & { seq: number }

export interface TurnCompletionState {
  seq: number
  lastEvent: TurnCompleteEvent | null
  pendingEvents: TurnCompleteEvent[]
  attentionByTab: Record<string, boolean>
  attentionByPane: Record<string, boolean>
}

const initialState: TurnCompletionState = {
  seq: 0,
  lastEvent: null,
  pendingEvents: [],
  attentionByTab: {},
  attentionByPane: {},
}

const turnCompletionSlice = createSlice({
  name: 'turnCompletion',
  initialState,
  reducers: {
    recordTurnComplete(state, action: PayloadAction<TurnCompletePayload>) {
      state.seq += 1
      const event = {
        ...action.payload,
        seq: state.seq,
      }
      state.lastEvent = event
      state.pendingEvents.push(event)
    },
    consumeTurnCompleteEvents(state, action: PayloadAction<{ throughSeq: number }>) {
      const { throughSeq } = action.payload
      if (throughSeq <= 0) return
      state.pendingEvents = state.pendingEvents.filter((event) => event.seq > throughSeq)
    },
    markTabAttention(state, action: PayloadAction<{ tabId: string }>) {
      if (state.attentionByTab[action.payload.tabId]) return
      state.attentionByTab[action.payload.tabId] = true
    },
    clearTabAttention(state, action: PayloadAction<{ tabId: string }>) {
      if (!state.attentionByTab[action.payload.tabId]) return
      delete state.attentionByTab[action.payload.tabId]
    },
    markPaneAttention(state, action: PayloadAction<{ paneId: string }>) {
      if (state.attentionByPane[action.payload.paneId]) return
      state.attentionByPane[action.payload.paneId] = true
    },
    clearPaneAttention(state, action: PayloadAction<{ paneId: string }>) {
      if (!state.attentionByPane[action.payload.paneId]) return
      delete state.attentionByPane[action.payload.paneId]
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(closePane, (state, action) => {
        const { tabId, paneId } = action.payload
        if (state.attentionByPane) delete state.attentionByPane[paneId]
        if (state.attentionByTab) delete state.attentionByTab[tabId]
      })
      .addCase(removeLayout, (state, action) => {
        const { tabId } = action.payload
        if (state.attentionByTab) delete state.attentionByTab[tabId]
      })
  },
})

export const {
  recordTurnComplete,
  consumeTurnCompleteEvents,
  markTabAttention,
  clearTabAttention,
  markPaneAttention,
  clearPaneAttention,
} = turnCompletionSlice.actions

export default turnCompletionSlice.reducer
