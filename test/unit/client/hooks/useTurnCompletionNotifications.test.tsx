import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act, waitFor } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import tabsReducer from '@/store/tabsSlice'
import turnCompletionReducer, { recordTurnComplete } from '@/store/turnCompletionSlice'
import { useTurnCompletionNotifications } from '@/hooks/useTurnCompletionNotifications'
import type { Tab } from '@/store/types'

const playSound = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/useNotificationSound', () => ({
  useNotificationSound: () => ({ play: playSound }),
}))

function TestComponent() {
  useTurnCompletionNotifications()
  return null
}

function createStore(activeTabId = 'tab-1') {
  const now = Date.now()
  const tabs: Tab[] = [
    {
      id: 'tab-1',
      createRequestId: 'req-1',
      title: 'Tab 1',
      status: 'running',
      mode: 'codex',
      shell: 'system',
      createdAt: now,
    },
    {
      id: 'tab-2',
      createRequestId: 'req-2',
      title: 'Tab 2',
      status: 'running',
      mode: 'claude',
      shell: 'system',
      createdAt: now,
    },
  ]

  return configureStore({
    reducer: {
      tabs: tabsReducer,
      turnCompletion: turnCompletionReducer,
    },
    preloadedState: {
      tabs: {
        tabs,
        activeTabId,
        renameRequestTabId: null,
      },
      turnCompletion: {
        seq: 0,
        lastEvent: null,
        pendingEvents: [],
        attentionByTab: {},
      },
    },
  })
}

describe('useTurnCompletionNotifications', () => {
  let hasFocus = true
  let hidden = false
  const originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden')
  const originalHasFocus = Object.getOwnPropertyDescriptor(document, 'hasFocus')

  beforeEach(() => {
    playSound.mockClear()
    hasFocus = true
    hidden = false

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    })

    Object.defineProperty(document, 'hasFocus', {
      configurable: true,
      value: () => hasFocus,
    })
  })

  afterEach(() => {
    cleanup()

    if (originalHidden) {
      Object.defineProperty(document, 'hidden', originalHidden)
    }

    if (originalHasFocus) {
      Object.defineProperty(document, 'hasFocus', originalHasFocus)
    }
  })

  it('plays bell and marks attention when a background tab completes while focused', async () => {
    const store = createStore('tab-1')

    render(
      <Provider store={store}>
        <TestComponent />
      </Provider>
    )

    act(() => {
      store.dispatch(recordTurnComplete({ tabId: 'tab-2', paneId: 'pane-2', terminalId: 'term-2', at: 100 }))
    })

    await waitFor(() => {
      expect(playSound).toHaveBeenCalledTimes(1)
    })
    expect(store.getState().turnCompletion.attentionByTab['tab-2']).toBe(true)
    expect(store.getState().turnCompletion.pendingEvents).toHaveLength(0)
  })

  it('marks attention but does not play bell when the active tab completes while focused', async () => {
    const store = createStore('tab-1')

    render(
      <Provider store={store}>
        <TestComponent />
      </Provider>
    )

    act(() => {
      store.dispatch(recordTurnComplete({ tabId: 'tab-1', paneId: 'pane-1', terminalId: 'term-1', at: 100 }))
    })

    await waitFor(() => {
      expect(store.getState().turnCompletion.pendingEvents).toHaveLength(0)
    })

    expect(playSound).not.toHaveBeenCalled()
    // Attention is always marked — cleared by typing, not by focus
    expect(store.getState().turnCompletion.attentionByTab['tab-1']).toBe(true)
  })

  it('plays bell and marks attention when active tab completes while window is unfocused', async () => {
    hasFocus = false
    const store = createStore('tab-1')

    render(
      <Provider store={store}>
        <TestComponent />
      </Provider>
    )

    act(() => {
      store.dispatch(recordTurnComplete({ tabId: 'tab-1', paneId: 'pane-1', terminalId: 'term-1', at: 100 }))
    })

    await waitFor(() => {
      expect(playSound).toHaveBeenCalledTimes(1)
    })
    expect(store.getState().turnCompletion.attentionByTab['tab-1']).toBe(true)
    expect(store.getState().turnCompletion.pendingEvents).toHaveLength(0)
  })

  it('does not drop completion when focus state transitions before blur listener updates', async () => {
    const store = createStore('tab-1')

    render(
      <Provider store={store}>
        <TestComponent />
      </Provider>
    )

    act(() => {
      hasFocus = false
      store.dispatch(recordTurnComplete({ tabId: 'tab-1', paneId: 'pane-1', terminalId: 'term-1', at: 100 }))
    })

    await waitFor(() => {
      expect(playSound).toHaveBeenCalledTimes(1)
    })
    expect(store.getState().turnCompletion.attentionByTab['tab-1']).toBe(true)
    expect(store.getState().turnCompletion.pendingEvents).toHaveLength(0)
  })

  it('marks attention on all tabs in burst completions', async () => {
    const store = createStore('tab-1')

    render(
      <Provider store={store}>
        <TestComponent />
      </Provider>
    )

    act(() => {
      store.dispatch(recordTurnComplete({ tabId: 'tab-1', paneId: 'pane-1', terminalId: 'term-1', at: 100 }))
      store.dispatch(recordTurnComplete({ tabId: 'tab-2', paneId: 'pane-2', terminalId: 'term-2', at: 200 }))
    })

    await waitFor(() => {
      expect(store.getState().turnCompletion.pendingEvents).toHaveLength(0)
    })

    // Sound plays once (for the background tab-2; active tab-1 skips sound)
    expect(playSound).toHaveBeenCalledTimes(1)
    // Attention is marked on ALL tabs — cleared by typing, not by focus
    expect(store.getState().turnCompletion.attentionByTab['tab-1']).toBe(true)
    expect(store.getState().turnCompletion.attentionByTab['tab-2']).toBe(true)
  })

  it('attention persists after switching tabs (cleared by typing, not focus)', async () => {
    hasFocus = false
    const store = createStore('tab-1')

    render(
      <Provider store={store}>
        <TestComponent />
      </Provider>
    )

    act(() => {
      store.dispatch(recordTurnComplete({ tabId: 'tab-2', paneId: 'pane-2', terminalId: 'term-2', at: 100 }))
    })

    await waitFor(() => {
      expect(store.getState().turnCompletion.attentionByTab['tab-2']).toBe(true)
    })

    // Regain focus and switch to tab-2 — attention should persist
    // (previously, focus change would auto-clear; now only typing clears it)
    act(() => {
      hasFocus = true
      window.dispatchEvent(new Event('focus'))
    })

    // Give a tick for any effects to run
    await waitFor(() => {
      expect(store.getState().turnCompletion.attentionByTab['tab-2']).toBe(true)
    })
  })
})
