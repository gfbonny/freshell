import { describe, it, expect } from 'vitest'
import { getSessionsForHello, findTabIdForSession, findPaneForSession } from '@/lib/session-utils'
import type { RootState } from '@/store/store'
import type { PaneNode, TerminalPaneContent } from '@/store/paneTypes'

const VALID_SESSION_ID = '550e8400-e29b-41d4-a716-446655440000'
const OTHER_SESSION_ID = '6f1c2b3a-4d5e-6f70-8a9b-0c1d2e3f4a5b'

function terminalContent(mode: TerminalPaneContent['mode'], resumeSessionId: string): TerminalPaneContent {
  return {
    kind: 'terminal',
    mode,
    status: 'running',
    createRequestId: `req-${resumeSessionId}`,
    resumeSessionId,
  }
}

function leaf(id: string, content: TerminalPaneContent): PaneNode {
  return {
    type: 'leaf',
    id,
    content,
  }
}

describe('getSessionsForHello', () => {
  it('filters non-claude sessions from active/visible/background', () => {
    const layoutActive: PaneNode = {
      type: 'split',
      id: 'split-1',
      direction: 'horizontal',
      sizes: [50, 50],
      children: [
        leaf('pane-codex', terminalContent('codex', 'codex-active')),
        leaf('pane-claude', terminalContent('claude', VALID_SESSION_ID)),
      ],
    }

    const layoutBackground: PaneNode = {
      type: 'split',
      id: 'split-2',
      direction: 'vertical',
      sizes: [50, 50],
      children: [
        leaf('pane-claude-bg', terminalContent('claude', OTHER_SESSION_ID)),
        leaf('pane-codex-bg', terminalContent('codex', 'codex-bg')),
      ],
    }

    const state = {
      tabs: {
        activeTabId: 'tab-1',
        tabs: [{ id: 'tab-1' }, { id: 'tab-2' }],
      },
      panes: {
        layouts: {
          'tab-1': layoutActive,
          'tab-2': layoutBackground,
        },
        activePane: {
          'tab-1': 'pane-codex',
        },
      },
    } as unknown as RootState

    const result = getSessionsForHello(state)

    expect(result.active).toBeUndefined()
    expect(result.visible).toEqual([VALID_SESSION_ID])
    expect(result.background).toEqual([OTHER_SESSION_ID])
  })

  it('captures active claude session when active pane is claude', () => {
    const layoutActive: PaneNode = {
      type: 'split',
      id: 'split-1',
      direction: 'horizontal',
      sizes: [50, 50],
      children: [
        leaf('pane-claude', terminalContent('claude', VALID_SESSION_ID)),
        leaf('pane-codex', terminalContent('codex', 'codex-visible')),
      ],
    }

    const state = {
      tabs: {
        activeTabId: 'tab-1',
        tabs: [{ id: 'tab-1' }],
      },
      panes: {
        layouts: {
          'tab-1': layoutActive,
        },
        activePane: {
          'tab-1': 'pane-claude',
        },
      },
    } as unknown as RootState

    const result = getSessionsForHello(state)

    expect(result.active).toBe(VALID_SESSION_ID)
    expect(result.visible).toEqual([])
    expect(result.background).toBeUndefined()
  })

  it('drops invalid claude session IDs', () => {
    const layoutActive: PaneNode = {
      type: 'leaf',
      id: 'pane-claude',
      content: terminalContent('claude', 'not-a-uuid'),
    }

    const state = {
      tabs: {
        activeTabId: 'tab-1',
        tabs: [{ id: 'tab-1' }],
      },
      panes: {
        layouts: {
          'tab-1': layoutActive,
        },
        activePane: {
          'tab-1': 'pane-claude',
        },
      },
    } as unknown as RootState

    const result = getSessionsForHello(state)

    expect(result.active).toBeUndefined()
    expect(result.visible).toEqual([])
    expect(result.background).toBeUndefined()
  })
})

describe('findTabIdForSession', () => {
  it('falls back to tab resumeSessionId when layout is missing', () => {
    const state = {
      tabs: {
        activeTabId: 'tab-1',
        tabs: [{ id: 'tab-1', mode: 'claude', resumeSessionId: VALID_SESSION_ID }],
      },
      panes: {
        layouts: {},
        activePane: {},
      },
    } as unknown as RootState

    expect(findTabIdForSession(state, 'claude', VALID_SESSION_ID)).toBe('tab-1')
  })
})

describe('findPaneForSession', () => {
  it('returns tabId and paneId when session is in a leaf', () => {
    const state = {
      tabs: {
        activeTabId: 'tab-1',
        tabs: [{ id: 'tab-1' }],
      },
      panes: {
        layouts: {
          'tab-1': leaf('pane-a', terminalContent('claude', VALID_SESSION_ID)),
        },
        activePane: { 'tab-1': 'pane-a' },
      },
    } as unknown as RootState

    expect(findPaneForSession(state, 'claude', VALID_SESSION_ID)).toEqual({
      tabId: 'tab-1',
      paneId: 'pane-a',
    })
  })

  it('finds session in a nested split', () => {
    const layout: PaneNode = {
      type: 'split',
      id: 'split-1',
      direction: 'horizontal',
      sizes: [50, 50],
      children: [
        leaf('pane-a', terminalContent('shell' as TerminalPaneContent['mode'], '')),
        leaf('pane-b', terminalContent('claude', VALID_SESSION_ID)),
      ],
    }

    const state = {
      tabs: {
        activeTabId: 'tab-1',
        tabs: [{ id: 'tab-1' }],
      },
      panes: {
        layouts: { 'tab-1': layout },
        activePane: { 'tab-1': 'pane-a' },
      },
    } as unknown as RootState

    expect(findPaneForSession(state, 'claude', VALID_SESSION_ID)).toEqual({
      tabId: 'tab-1',
      paneId: 'pane-b',
    })
  })

  it('finds session in a background tab', () => {
    const state = {
      tabs: {
        activeTabId: 'tab-1',
        tabs: [{ id: 'tab-1' }, { id: 'tab-2' }],
      },
      panes: {
        layouts: {
          'tab-1': leaf('pane-a', terminalContent('shell' as TerminalPaneContent['mode'], '')),
          'tab-2': leaf('pane-b', terminalContent('codex', OTHER_SESSION_ID)),
        },
        activePane: { 'tab-1': 'pane-a', 'tab-2': 'pane-b' },
      },
    } as unknown as RootState

    expect(findPaneForSession(state, 'codex', OTHER_SESSION_ID)).toEqual({
      tabId: 'tab-2',
      paneId: 'pane-b',
    })
  })

  it('returns undefined when session is not open', () => {
    const state = {
      tabs: {
        activeTabId: 'tab-1',
        tabs: [{ id: 'tab-1' }],
      },
      panes: {
        layouts: {
          'tab-1': leaf('pane-a', terminalContent('shell' as TerminalPaneContent['mode'], '')),
        },
        activePane: { 'tab-1': 'pane-a' },
      },
    } as unknown as RootState

    expect(findPaneForSession(state, 'claude', VALID_SESSION_ID)).toBeUndefined()
  })

  it('returns undefined for tabs without layouts', () => {
    const state = {
      tabs: {
        activeTabId: 'tab-1',
        tabs: [{ id: 'tab-1' }],
      },
      panes: {
        layouts: {},
        activePane: {},
      },
    } as unknown as RootState

    expect(findPaneForSession(state, 'claude', VALID_SESSION_ID)).toBeUndefined()
  })

  it('falls back to tab-level match when tab has resumeSessionId but no layout', () => {
    const state = {
      tabs: {
        activeTabId: 'tab-1',
        tabs: [{ id: 'tab-1', mode: 'claude', resumeSessionId: VALID_SESSION_ID }],
      },
      panes: {
        layouts: {},
        activePane: {},
      },
    } as unknown as RootState

    // Returns tabId but no paneId since there's no pane tree yet
    expect(findPaneForSession(state, 'claude', VALID_SESSION_ID)).toEqual({
      tabId: 'tab-1',
      paneId: undefined,
    })
  })
})
