import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import TabContent from '@/components/TabContent'
import tabsReducer from '@/store/tabsSlice'
import panesReducer from '@/store/panesSlice'
import settingsReducer, { defaultSettings } from '@/store/settingsSlice'

// Hoist mock functions so vi.mock can reference them
const { mockPaneLayout } = vi.hoisted(() => ({
  mockPaneLayout: vi.fn(() => <div data-testid="pane-layout" />),
}))

// Mock PaneLayout to capture props
vi.mock('@/components/panes', () => ({
  PaneLayout: mockPaneLayout,
}))

interface TabConfig {
  id: string
}

interface StoreOptions {
  defaultNewPane?: 'ask' | 'shell' | 'browser' | 'editor'
  defaultCwd?: string
}

function createStore(tabs: TabConfig[], options: StoreOptions = {}) {
  const settings = {
    ...defaultSettings,
    panes: {
      ...defaultSettings.panes,
      defaultNewPane: options.defaultNewPane || 'ask',
    },
    defaultCwd: options.defaultCwd,
  }
  return configureStore({
    reducer: {
      tabs: tabsReducer,
      panes: panesReducer,
      settings: settingsReducer,
    },
    preloadedState: {
      tabs: {
        tabs: tabs.map((t) => ({
          id: t.id,
          title: 'Test',
          createdAt: Date.now(),
        })),
        activeTabId: tabs[0]?.id,
      },
      panes: {
        layouts: {},
        activePane: {},
        paneTitles: {},
        paneTitleSetByUser: {},
      },
      settings: {
        settings,
        loaded: true,
      },
    },
  })
}

describe('TabContent', () => {
  beforeEach(() => {
    mockPaneLayout.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  describe('defaultContent', () => {
    it('shows picker when defaultNewPane is ask', () => {
      const store = createStore([{ id: 'tab-1' }], { defaultNewPane: 'ask' })

      render(
        <Provider store={store}>
          <TabContent tabId="tab-1" />
        </Provider>
      )

      expect(mockPaneLayout).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultContent: { kind: 'picker' },
        }),
        expect.anything()
      )
    })

    it('uses browser content when defaultNewPane is browser', () => {
      const store = createStore([{ id: 'tab-1' }], { defaultNewPane: 'browser' })

      render(
        <Provider store={store}>
          <TabContent tabId="tab-1" />
        </Provider>
      )

      expect(mockPaneLayout).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultContent: expect.objectContaining({ kind: 'browser' }),
        }),
        expect.anything()
      )
    })

    it('uses editor content when defaultNewPane is editor', () => {
      const store = createStore([{ id: 'tab-1' }], { defaultNewPane: 'editor' })

      render(
        <Provider store={store}>
          <TabContent tabId="tab-1" />
        </Provider>
      )

      expect(mockPaneLayout).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultContent: expect.objectContaining({ kind: 'editor' }),
        }),
        expect.anything()
      )
    })

    it('uses shell terminal when defaultNewPane is shell', () => {
      const store = createStore([{ id: 'tab-1' }], { defaultNewPane: 'shell', defaultCwd: '/tmp' })

      render(
        <Provider store={store}>
          <TabContent tabId="tab-1" />
        </Provider>
      )

      expect(mockPaneLayout).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultContent: expect.objectContaining({
            kind: 'terminal',
            mode: 'shell',
            shell: 'system',
            initialCwd: '/tmp',
          }),
        }),
        expect.anything()
      )
    })
  })

  describe('hidden prop propagation', () => {
    it('passes hidden=true to PaneLayout when hidden prop is true', () => {
      const store = createStore([{ id: 'tab-1' }])

      render(
        <Provider store={store}>
          <TabContent tabId="tab-1" hidden={true} />
        </Provider>
      )

      expect(mockPaneLayout).toHaveBeenCalledWith(
        expect.objectContaining({ hidden: true }),
        expect.anything()
      )
    })

    it('passes hidden=false to PaneLayout when hidden prop is false', () => {
      const store = createStore([{ id: 'tab-1' }])

      render(
        <Provider store={store}>
          <TabContent tabId="tab-1" hidden={false} />
        </Provider>
      )

      expect(mockPaneLayout).toHaveBeenCalledWith(
        expect.objectContaining({ hidden: false }),
        expect.anything()
      )
    })

    it('passes hidden=undefined to PaneLayout when hidden prop is not provided', () => {
      const store = createStore([{ id: 'tab-1' }])

      render(
        <Provider store={store}>
          <TabContent tabId="tab-1" />
        </Provider>
      )

      expect(mockPaneLayout).toHaveBeenCalledWith(
        expect.objectContaining({ hidden: undefined }),
        expect.anything()
      )
    })
  })

  describe('visibility CSS classes', () => {
    it('applies tab-hidden class when hidden=true', () => {
      const store = createStore([{ id: 'tab-1' }])

      const { container } = render(
        <Provider store={store}>
          <TabContent tabId="tab-1" hidden={true} />
        </Provider>
      )

      const wrapper = container.firstChild as HTMLElement
      expect(wrapper.className).toContain('tab-hidden')
      // Ensure we're not using Tailwind's 'hidden' class (display:none) - check class list
      expect(wrapper.classList.contains('hidden')).toBe(false)
    })

    it('applies tab-visible class when hidden=false', () => {
      const store = createStore([{ id: 'tab-1' }])

      const { container } = render(
        <Provider store={store}>
          <TabContent tabId="tab-1" hidden={false} />
        </Provider>
      )

      const wrapper = container.firstChild as HTMLElement
      expect(wrapper.className).toContain('tab-visible')
      expect(wrapper.className).not.toContain('tab-hidden')
    })

    it('applies tab-visible class when hidden is undefined', () => {
      const store = createStore([{ id: 'tab-1' }])

      const { container } = render(
        <Provider store={store}>
          <TabContent tabId="tab-1" />
        </Provider>
      )

      const wrapper = container.firstChild as HTMLElement
      expect(wrapper.className).toContain('tab-visible')
    })
  })
})
