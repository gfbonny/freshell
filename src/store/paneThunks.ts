import { getWsClient } from '@/lib/ws-client'
import { findPaneContent } from '@/lib/pane-utils'
import { cancelCodingCliRequest } from './codingCliSlice'
import { updatePaneContent } from './panesSlice'
import { removePaneActivity } from './terminalActivitySlice'
import type { PaneContent } from './paneTypes'
import type { AppDispatch, RootState } from './store'

export const swapPaneContent =
  ({
    tabId,
    paneId,
    content,
    killTerminal,
  }: {
    tabId: string
    paneId: string
    content: PaneContent
    killTerminal?: boolean
  }) =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState()
    const layout = state.panes.layouts[tabId]
    const current = layout ? findPaneContent(layout, paneId) : null
    const ws = getWsClient()

    if (current?.kind === 'terminal') {
      const terminalId = current.terminalId
      const sameTerminal = content.kind === 'terminal' && content.terminalId === terminalId
      if (terminalId && !sameTerminal) {
        ws.send({ type: killTerminal ? 'terminal.kill' : 'terminal.detach', terminalId })
      }
      dispatch(removePaneActivity({ paneId }))
    }

    if (current?.kind === 'session') {
      const sessionId = current.sessionId
      if (state.codingCli.pendingRequests[sessionId]) {
        dispatch(cancelCodingCliRequest({ requestId: sessionId }))
      } else {
        ws.send({ type: 'codingcli.kill', sessionId })
      }
    }

    dispatch(updatePaneContent({ tabId, paneId, content }))
  }
