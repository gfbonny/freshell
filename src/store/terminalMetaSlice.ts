import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { CodingCliProviderName } from './types'

export type TerminalTokenUsage = {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  totalTokens: number
  contextTokens?: number
  modelContextWindow?: number
  compactThresholdTokens?: number
  compactPercent?: number
}

export type TerminalMetaRecord = {
  terminalId: string
  cwd?: string
  checkoutRoot?: string
  repoRoot?: string
  displaySubdir?: string
  branch?: string
  isDirty?: boolean
  provider?: CodingCliProviderName
  sessionId?: string
  tokenUsage?: TerminalTokenUsage
  updatedAt: number
}

export type TerminalMetaState = {
  byTerminalId: Record<string, TerminalMetaRecord>
}

const initialState: TerminalMetaState = {
  byTerminalId: {},
}

const terminalMetaSlice = createSlice({
  name: 'terminalMeta',
  initialState,
  reducers: {
    setTerminalMetaSnapshot(state, action: PayloadAction<TerminalMetaRecord[]>) {
      const next: Record<string, TerminalMetaRecord> = {}
      for (const record of action.payload) {
        next[record.terminalId] = record
      }
      state.byTerminalId = next
    },
    upsertTerminalMeta(state, action: PayloadAction<TerminalMetaRecord[]>) {
      for (const record of action.payload) {
        state.byTerminalId[record.terminalId] = record
      }
    },
    removeTerminalMeta(state, action: PayloadAction<string>) {
      delete state.byTerminalId[action.payload]
    },
  },
})

export const {
  setTerminalMetaSnapshot,
  upsertTerminalMeta,
  removeTerminalMeta,
} = terminalMetaSlice.actions

export default terminalMetaSlice.reducer
