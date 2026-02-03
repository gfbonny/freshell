import { createAsyncThunk } from '@reduxjs/toolkit'
import { getWsClient } from '@/lib/ws-client'
import { updatePaneContent } from './panesSlice'
import { createTabWithPane } from './tabThunks'
import { createCodingCliSession, registerCodingCliRequest, resolveCodingCliRequest, setCodingCliSessionStatus } from './codingCliSlice'
import type { RootState } from './store'
import type { CodingCliProviderName } from '@/lib/coding-cli-types'
import { nanoid } from 'nanoid'
import { findPaneContent, findPaneIdByContent } from '@/lib/pane-utils'

export const createCodingCliTab = createAsyncThunk(
  'codingCli/createTab',
  async (
    { provider, prompt, cwd }: { provider: CodingCliProviderName; prompt: string; cwd?: string },
    { dispatch, getState }
  ) => {
    const requestId = nanoid()

    dispatch(registerCodingCliRequest({ requestId, provider, prompt, cwd }))

    const title = prompt.slice(0, 30) + (prompt.length > 30 ? '...' : '')
    const tabId = nanoid()
    dispatch(createTabWithPane({
      tabId,
      title,
      content: {
        kind: 'session',
        sessionId: requestId,
        provider,
        title,
      },
    }))

    const ws = getWsClient()
    try {
      await ws.connect()
    } catch (err) {
      dispatch(resolveCodingCliRequest({ requestId }))
      dispatch(createCodingCliSession({ sessionId: requestId, provider, prompt, cwd }))
      dispatch(setCodingCliSessionStatus({ sessionId: requestId, status: 'error' }))
      throw err
    }

    return new Promise<string>((resolve, reject) => {
      const unsub = ws.onMessage((msg) => {
        if (msg.type === 'codingcli.created' && msg.requestId === requestId) {
          const canceled = (getState() as RootState).codingCli.pendingRequests[requestId]?.canceled
          dispatch(resolveCodingCliRequest({ requestId }))
          unsub()
          if (canceled) {
            ws.send({ type: 'codingcli.kill', sessionId: msg.sessionId })
            reject(new Error('Canceled'))
            return
          }
          dispatch(
            createCodingCliSession({
              sessionId: msg.sessionId,
              provider,
              prompt,
              cwd,
            })
          )
          const state = getState() as RootState
          const layout = state.panes.layouts[tabId]
          if (layout) {
            const paneId = findPaneIdByContent(
              layout,
              (content) => content.kind === 'session' && content.sessionId === requestId
            )
            if (paneId) {
              const content = findPaneContent(layout, paneId)
              if (content?.kind === 'session') {
                dispatch(updatePaneContent({
                  tabId,
                  paneId,
                  content: {
                    ...content,
                    sessionId: msg.sessionId,
                    provider,
                  },
                }))
              }
            }
          }
          resolve(msg.sessionId)
        }
        if (msg.type === 'error' && msg.requestId === requestId) {
          const canceled = (getState() as RootState).codingCli.pendingRequests[requestId]?.canceled
          dispatch(resolveCodingCliRequest({ requestId }))
          unsub()
          if (!canceled) {
            dispatch(createCodingCliSession({ sessionId: requestId, provider, prompt, cwd }))
            dispatch(setCodingCliSessionStatus({ sessionId: requestId, status: 'error' }))
          }
          reject(new Error(canceled ? 'Canceled' : msg.message))
        }
      })

      ws.send({
        type: 'codingcli.create',
        requestId,
        provider,
        prompt,
        cwd,
      })
    })
  }
)
