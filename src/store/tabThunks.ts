import { createAsyncThunk } from '@reduxjs/toolkit'
import { nanoid } from 'nanoid'
import { addTab, closeTab } from './tabsSlice'
import { initLayout } from './panesSlice'
import type { PaneContentInput } from './paneTypes'
import { collectTerminalPanes, collectSessionPanes } from '@/lib/pane-utils'
import { getWsClient } from '@/lib/ws-client'
import { cancelCodingCliRequest } from './codingCliSlice'
import type { RootState } from './store'

export const createTabWithPane = createAsyncThunk(
  'tabs/createTabWithPane',
  async (
    {
      tabId,
      title,
      titleSetByUser,
      content,
    }: {
      tabId?: string
      title?: string
      titleSetByUser?: boolean
      content: PaneContentInput
    },
    { dispatch }
  ) => {
    const id = tabId || nanoid()
    dispatch(addTab({ id, title, titleSetByUser }))
    dispatch(initLayout({ tabId: id, content }))
    return id
  }
)

export const closeTabWithCleanup = createAsyncThunk(
  'tabs/closeTabWithCleanup',
  async (
    { tabId, killTerminals }: { tabId: string; killTerminals?: boolean },
    { dispatch, getState }
  ) => {
    const state = getState() as RootState
    const layout = state.panes.layouts[tabId]
    const ws = getWsClient()

    if (layout) {
      const terminalPanes = collectTerminalPanes(layout)
      for (const terminal of terminalPanes) {
        const terminalId = terminal.content.terminalId
        if (!terminalId) continue
        ws.send({ type: killTerminals ? 'terminal.kill' : 'terminal.detach', terminalId })
      }

      const sessionPanes = collectSessionPanes(layout)
      for (const session of sessionPanes) {
        const sessionId = session.content.sessionId
        if (state.codingCli.pendingRequests[sessionId]) {
          dispatch(cancelCodingCliRequest({ requestId: sessionId }))
        } else {
          ws.send({ type: 'codingcli.kill', sessionId })
        }
      }
    }

    dispatch(closeTab(tabId))
  }
)
