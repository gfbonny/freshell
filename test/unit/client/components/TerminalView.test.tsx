import { describe, it, expect, afterEach } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import { cleanup } from '@testing-library/react'
import panesReducer, { updatePaneTitle } from '@/store/panesSlice'
import type { PanesState } from '@/store/panesSlice'

function createStore(initialState: Partial<PanesState> = {}) {
  return configureStore({
    reducer: {
      panes: panesReducer,
    },
    preloadedState: {
      panes: {
        layouts: {
          'tab-1': {
            type: 'leaf',
            id: 'pane-1',
            content: { kind: 'terminal', createRequestId: 'req-1', status: 'running', mode: 'shell' },
          },
        },
        activePane: { 'tab-1': 'pane-1' },
        paneTitles: {},
        paneTitleSetByUser: {},
        ...initialState,
      },
    },
  })
}

describe('Pane title updates', () => {
  afterEach(() => {
    cleanup()
  })

  it('updates title when no user override exists', () => {
    const store = createStore()

    store.dispatch(updatePaneTitle({ tabId: 'tab-1', paneId: 'pane-1', title: 'Auto Title' }))

    const state = store.getState().panes
    expect(state.paneTitles['tab-1']['pane-1']).toBe('Auto Title')
  })

  it('ignores auto updates when user override is set', () => {
    const store = createStore({
      paneTitles: { 'tab-1': { 'pane-1': 'User Title' } },
      paneTitleSetByUser: { 'tab-1': { 'pane-1': true } },
    })

    store.dispatch(updatePaneTitle({ tabId: 'tab-1', paneId: 'pane-1', title: 'Auto Title' }))

    const state = store.getState().panes
    expect(state.paneTitles['tab-1']['pane-1']).toBe('User Title')
  })

  it('allows user updates to override existing titles', () => {
    const store = createStore({
      paneTitles: { 'tab-1': { 'pane-1': 'Old Title' } },
      paneTitleSetByUser: { 'tab-1': { 'pane-1': true } },
    })

    store.dispatch(updatePaneTitle({ tabId: 'tab-1', paneId: 'pane-1', title: 'New User Title', setByUser: true }))

    const state = store.getState().panes
    expect(state.paneTitles['tab-1']['pane-1']).toBe('New User Title')
  })
})
