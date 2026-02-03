import { describe, it, expect, vi, beforeEach } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import tabsReducer from '@/store/tabsSlice'
import panesReducer from '@/store/panesSlice'
import codingCliReducer from '@/store/codingCliSlice'
import { createCodingCliTab } from '@/store/codingCliThunks'
import { cancelCodingCliRequest } from '@/store/codingCliSlice'

const mockSend = vi.fn()
const mockConnect = vi.fn().mockResolvedValue(undefined)
let messageHandler: ((msg: any) => void) | null = null

vi.mock('@/lib/ws-client', () => ({
  getWsClient: () => ({
    send: mockSend,
    connect: mockConnect,
    onMessage: (handler: (msg: any) => void) => {
      messageHandler = handler
      return () => {}
    },
  }),
}))

function createStore() {
  return configureStore({
    reducer: {
      tabs: tabsReducer,
      codingCli: codingCliReducer,
      panes: panesReducer,
    },
    preloadedState: {
      tabs: { tabs: [], activeTabId: null },
      codingCli: { sessions: {}, pendingRequests: {} },
      panes: { layouts: {}, activePane: {}, paneTitles: {}, paneTitleSetByUser: {} },
    },
  })
}

describe('codingCliThunks', () => {
  beforeEach(() => {
    mockSend.mockClear()
    mockConnect.mockClear()
    messageHandler = null
  })

  it('creates a coding CLI tab and updates it when the session is created', async () => {
    const store = createStore()

    const promise = store.dispatch(
      createCodingCliTab({ provider: 'codex', prompt: 'Do the thing' })
    )

    const tabsAfterAdd = store.getState().tabs.tabs
    expect(tabsAfterAdd).toHaveLength(1)
    const tabId = tabsAfterAdd[0].id
    const layout = store.getState().panes.layouts[tabId]
    expect(layout).toBeDefined()
    expect(layout.type).toBe('leaf')
    const pendingSessionId =
      layout.type === 'leaf' && layout.content.kind === 'session'
        ? layout.content.sessionId
        : undefined
    expect(pendingSessionId).toBeDefined()

    await Promise.resolve()

    const sent = mockSend.mock.calls[0]?.[0]
    expect(sent).toMatchObject({
      type: 'codingcli.create',
      provider: 'codex',
      prompt: 'Do the thing',
      cwd: undefined,
    })
    expect(sent?.requestId).toBe(pendingSessionId)

    messageHandler?.({
      type: 'codingcli.created',
      requestId: pendingSessionId,
      sessionId: 'session-123',
      provider: 'codex',
    })

    await promise

    const updatedLayout = store.getState().panes.layouts[tabId]
    expect(updatedLayout.type).toBe('leaf')
    if (updatedLayout.type === 'leaf' && updatedLayout.content.kind === 'session') {
      expect(updatedLayout.content.sessionId).toBe('session-123')
    }
    expect(store.getState().codingCli.sessions['session-123']).toBeDefined()
  })

  it('kills created session when request was canceled', async () => {
    const store = createStore()

    const promise = store.dispatch(
      createCodingCliTab({ provider: 'claude', prompt: 'Cancel me' })
    )

    const tabId = store.getState().tabs.tabs[0].id
    const layout = store.getState().panes.layouts[tabId]
    const requestId =
      layout.type === 'leaf' && layout.content.kind === 'session'
        ? layout.content.sessionId
        : ''
    expect(requestId).not.toBe('')

    store.dispatch(cancelCodingCliRequest({ requestId }))

    await Promise.resolve()

    messageHandler?.({
      type: 'codingcli.created',
      requestId,
      sessionId: 'session-canceled',
      provider: 'claude',
    })

    const result = await promise
    expect(result.type).toBe('codingCli/createTab/rejected')
    expect(result.error?.message).toBe('Canceled')

    expect(mockSend).toHaveBeenCalledWith({
      type: 'codingcli.kill',
      sessionId: 'session-canceled',
    })
    expect(store.getState().codingCli.sessions['session-canceled']).toBeUndefined()
  })
})
