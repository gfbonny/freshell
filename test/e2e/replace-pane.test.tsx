import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import tabsReducer from '@/store/tabsSlice'
import panesReducer, { replacePane, updatePaneTitle } from '@/store/panesSlice'
import settingsReducer, { defaultSettings } from '@/store/settingsSlice'
import connectionReducer from '@/store/connectionSlice'
import turnCompletionReducer from '@/store/turnCompletionSlice'
import { findPaneContent } from '@/lib/pane-utils'
import type { PaneNode } from '@/store/paneTypes'

const wsMocks = vi.hoisted(() => ({
  send: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  onMessage: vi.fn().mockReturnValue(() => {}),
  onReconnect: vi.fn().mockReturnValue(() => {}),
}))

vi.mock('@/lib/ws-client', () => ({
  getWsClient: () => ({
    send: wsMocks.send,
    connect: wsMocks.connect,
    onMessage: wsMocks.onMessage,
    onReconnect: wsMocks.onReconnect,
  }),
}))

function createStore(layout: PaneNode, opts?: { paneTitleSetByUser?: Record<string, Record<string, boolean>> }) {
  return configureStore({
    reducer: {
      tabs: tabsReducer,
      panes: panesReducer,
      settings: settingsReducer,
      connection: connectionReducer,
      turnCompletion: turnCompletionReducer,
    },
    preloadedState: {
      tabs: {
        tabs: [
          {
            id: 'tab-1',
            title: 'Tab 1',
            createRequestId: 'tab-1',
            mode: 'shell' as const,
            status: 'running' as const,
            shell: 'system' as const,
            createdAt: Date.now(),
          },
        ],
        activeTabId: 'tab-1',
      },
      panes: {
        layouts: { 'tab-1': layout },
        activePane: { 'tab-1': 'pane-1' },
        paneTitles: { 'tab-1': { 'pane-1': 'Shell' } },
        paneTitleSetByUser: opts?.paneTitleSetByUser ?? {},
        renameRequestTabId: null,
        renameRequestPaneId: null,
      },
      settings: {
        settings: defaultSettings,
        loaded: true,
      },
      connection: {
        status: 'ready' as const,
        platform: 'linux',
        availableClis: {},
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

describe('replace pane (e2e)', () => {
  beforeEach(() => {
    wsMocks.send.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('replaces a terminal pane: content becomes picker', () => {
    const layout: PaneNode = {
      type: 'leaf',
      id: 'pane-1',
      content: {
        kind: 'terminal',
        createRequestId: 'req-1',
        status: 'running',
        mode: 'shell',
        shell: 'system',
        terminalId: 'term-1',
      },
    }
    const store = createStore(layout)

    // Simulate what ContextMenuProvider does: detach terminal, then dispatch replacePane
    const paneContent = findPaneContent(store.getState().panes.layouts['tab-1'], 'pane-1')
    expect(paneContent?.kind).toBe('terminal')
    if (paneContent?.kind === 'terminal' && paneContent.terminalId) {
      wsMocks.send({ type: 'terminal.detach', terminalId: paneContent.terminalId })
    }
    store.dispatch(replacePane({ tabId: 'tab-1', paneId: 'pane-1' }))

    // Verify terminal.detach was sent
    expect(wsMocks.send).toHaveBeenCalledWith({ type: 'terminal.detach', terminalId: 'term-1' })

    // Verify pane is now picker
    const state = store.getState().panes
    const resultContent = findPaneContent(state.layouts['tab-1'], 'pane-1')
    expect(resultContent).toEqual({ kind: 'picker' })

    // Verify title reset
    expect(state.paneTitles['tab-1']['pane-1']).toBe('New Tab')
  })

  it('replaces a pane in a single-pane tab (works without errors)', () => {
    const layout: PaneNode = {
      type: 'leaf',
      id: 'pane-1',
      content: {
        kind: 'terminal',
        createRequestId: 'req-1',
        status: 'running',
        mode: 'shell',
        shell: 'system',
      },
    }
    const store = createStore(layout)

    store.dispatch(replacePane({ tabId: 'tab-1', paneId: 'pane-1' }))

    const state = store.getState().panes
    // Layout should still be a leaf (not removed), just content changed
    expect(state.layouts['tab-1'].type).toBe('leaf')
    const leaf = state.layouts['tab-1'] as Extract<PaneNode, { type: 'leaf' }>
    expect(leaf.content).toEqual({ kind: 'picker' })
  })

  it('replaces a renamed pane: title resets to "New Tab"', () => {
    const layout: PaneNode = {
      type: 'leaf',
      id: 'pane-1',
      content: {
        kind: 'terminal',
        createRequestId: 'req-1',
        status: 'running',
        mode: 'shell',
        shell: 'system',
      },
    }
    const store = createStore(layout, {
      paneTitleSetByUser: { 'tab-1': { 'pane-1': true } },
    })

    // First rename the pane
    store.dispatch(updatePaneTitle({ tabId: 'tab-1', paneId: 'pane-1', title: 'My Custom Name' }))
    expect(store.getState().panes.paneTitles['tab-1']['pane-1']).toBe('My Custom Name')
    expect(store.getState().panes.paneTitleSetByUser['tab-1']?.['pane-1']).toBe(true)

    // Now replace it
    store.dispatch(replacePane({ tabId: 'tab-1', paneId: 'pane-1' }))

    const state = store.getState().panes
    expect(state.paneTitles['tab-1']['pane-1']).toBe('New Tab')
    expect(state.paneTitleSetByUser['tab-1']?.['pane-1']).toBeUndefined()
  })

  it('replaces one pane in a split without affecting the other', () => {
    const layout: PaneNode = {
      type: 'split',
      id: 'split-1',
      direction: 'horizontal',
      sizes: [50, 50],
      children: [
        {
          type: 'leaf',
          id: 'pane-1',
          content: {
            kind: 'terminal',
            createRequestId: 'req-1',
            status: 'running',
            mode: 'shell',
            shell: 'system',
            terminalId: 'term-1',
          },
        },
        {
          type: 'leaf',
          id: 'pane-2',
          content: {
            kind: 'terminal',
            createRequestId: 'req-2',
            status: 'running',
            mode: 'claude',
            shell: 'system',
            terminalId: 'term-2',
          },
        },
      ],
    }
    const store = createStore(layout)

    // Replace pane-1 only
    store.dispatch(replacePane({ tabId: 'tab-1', paneId: 'pane-1' }))

    const state = store.getState().panes
    const split = state.layouts['tab-1'] as Extract<PaneNode, { type: 'split' }>
    const pane1 = split.children[0] as Extract<PaneNode, { type: 'leaf' }>
    const pane2 = split.children[1] as Extract<PaneNode, { type: 'leaf' }>

    // pane-1 is now picker
    expect(pane1.content).toEqual({ kind: 'picker' })
    // pane-2 is untouched
    expect(pane2.content.kind).toBe('terminal')
    if (pane2.content.kind === 'terminal') {
      expect(pane2.content.terminalId).toBe('term-2')
    }
  })
})
