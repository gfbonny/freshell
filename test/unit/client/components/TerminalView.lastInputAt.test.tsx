import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import tabsReducer from '@/store/tabsSlice'
import panesReducer from '@/store/panesSlice'
import settingsReducer, { defaultSettings } from '@/store/settingsSlice'
import connectionReducer from '@/store/connectionSlice'
import TerminalView from '@/components/TerminalView'
import type { TerminalPaneContent } from '@/store/paneTypes'

let onDataCallback: ((data: string) => void) | null = null

vi.mock('xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    loadAddon: vi.fn(),
    open: vi.fn(),
    onData: vi.fn((cb: (data: string) => void) => {
      onDataCallback = cb
      return { dispose: vi.fn() }
    }),
    onTitleChange: vi.fn(() => ({ dispose: vi.fn() })),
    attachCustomKeyEventHandler: vi.fn(),
    dispose: vi.fn(),
    write: vi.fn(),
    writeln: vi.fn(),
    clear: vi.fn(),
    cols: 80,
    rows: 24,
    options: {},
    getSelection: vi.fn(() => ''),
  })),
}))

vi.mock('xterm-addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: vi.fn(),
  })),
}))

const mockSend = vi.fn()
vi.mock('@/lib/ws-client', () => ({
  getWsClient: () => ({
    send: mockSend,
    onMessage: vi.fn(() => () => {}),
    onReconnect: vi.fn(() => () => {}),
    connect: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.stubGlobal('ResizeObserver', vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
})))

describe('TerminalView - lastInputAt updates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    onDataCallback = null
  })

  afterEach(() => {
    cleanup()
  })

  function createStore() {
    return configureStore({
      reducer: {
        tabs: tabsReducer,
        panes: panesReducer,
        settings: settingsReducer,
        connection: connectionReducer,
      },
      preloadedState: {
        tabs: {
          tabs: [{
            id: 'tab-1',
            createRequestId: 'req-1',
            title: 'Test Tab',
            status: 'running' as const,
            mode: 'shell' as const,
            createdAt: Date.now(),
            terminalId: 'term-1',
          }],
          activeTabId: 'tab-1',
        },
        panes: {
          layouts: {},
          activePane: {},
        },
        settings: {
          settings: defaultSettings,
          loaded: true,
        },
        connection: {
          status: 'connected' as const,
        },
      },
    })
  }

  it('dispatches updateTab with lastInputAt when user types', async () => {
    const store = createStore()
    const paneContent: TerminalPaneContent = {
      kind: 'terminal',
      createRequestId: 'req-1',
      terminalId: 'term-1',
      mode: 'shell',
      shell: 'system',
      status: 'running',
    }

    render(
      <Provider store={store}>
        <TerminalView
          tabId="tab-1"
          paneId="pane-1"
          paneContent={paneContent}
        />
      </Provider>
    )

    expect(onDataCallback).not.toBeNull()
    const beforeInput = Date.now()
    onDataCallback!('hello')
    const afterInput = Date.now()

    const tab = store.getState().tabs.tabs[0]
    expect(tab.lastInputAt).toBeGreaterThanOrEqual(beforeInput)
    expect(tab.lastInputAt).toBeLessThanOrEqual(afterInput)
  })
})
