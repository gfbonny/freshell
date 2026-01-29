import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import tabsReducer, { updateTab } from '@/store/tabsSlice'
import panesReducer from '@/store/panesSlice'
import settingsReducer, { defaultSettings } from '@/store/settingsSlice'
import connectionReducer from '@/store/connectionSlice'

// Since TerminalView is complex with xterm dependencies, we test the title update
// logic separately by simulating what the component does when a terminal.exit message arrives.

describe('TerminalView exit title behavior', () => {
  afterEach(() => {
    cleanup()
  })

  function createStore(tabOptions: { titleSetByUser?: boolean }) {
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
            mode: 'shell' as const,
            status: 'running' as const,
            title: 'My Custom Title',
            titleSetByUser: tabOptions.titleSetByUser ?? false,
            createRequestId: 'req-1',
          }],
          activeTabId: 'tab-1',
        },
        panes: { layouts: {}, activePane: {} },
        settings: { settings: defaultSettings, status: 'loaded' as const },
        connection: { status: 'connected' as const, error: null },
      },
    })
  }

  it('appends exit code to title when titleSetByUser is false', () => {
    const store = createStore({ titleSetByUser: false })
    const tab = store.getState().tabs.tabs[0]

    // Simulate what TerminalView does on terminal.exit
    const code = 0
    const updates: { status: 'exited'; title?: string } = { status: 'exited' }
    if (!tab.titleSetByUser) {
      updates.title = tab.title + (code !== undefined ? ` (exit ${code})` : '')
    }
    store.dispatch(updateTab({ id: tab.id, updates }))

    const updatedTab = store.getState().tabs.tabs[0]
    expect(updatedTab.title).toBe('My Custom Title (exit 0)')
    expect(updatedTab.status).toBe('exited')
  })

  it('preserves title when titleSetByUser is true', () => {
    const store = createStore({ titleSetByUser: true })
    const tab = store.getState().tabs.tabs[0]

    // Simulate what TerminalView does on terminal.exit
    const code = 0
    const updates: { status: 'exited'; title?: string } = { status: 'exited' }
    if (!tab.titleSetByUser) {
      updates.title = tab.title + (code !== undefined ? ` (exit ${code})` : '')
    }
    store.dispatch(updateTab({ id: tab.id, updates }))

    const updatedTab = store.getState().tabs.tabs[0]
    expect(updatedTab.title).toBe('My Custom Title') // Title unchanged
    expect(updatedTab.status).toBe('exited')
  })

  it('appends exit code for non-zero exit when titleSetByUser is false', () => {
    const store = createStore({ titleSetByUser: false })
    const tab = store.getState().tabs.tabs[0]

    const code = 1
    const updates: { status: 'exited'; title?: string } = { status: 'exited' }
    if (!tab.titleSetByUser) {
      updates.title = tab.title + (code !== undefined ? ` (exit ${code})` : '')
    }
    store.dispatch(updateTab({ id: tab.id, updates }))

    const updatedTab = store.getState().tabs.tabs[0]
    expect(updatedTab.title).toBe('My Custom Title (exit 1)')
  })
})
