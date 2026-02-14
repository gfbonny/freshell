import { describe, it, expect } from 'vitest'
import { getTabDirectoryPreference } from '@/lib/tab-directory-preference'
import type { PaneNode } from '@/store/paneTypes'

// Helper to create a terminal leaf
function terminalLeaf(id: string, initialCwd?: string): PaneNode {
  return {
    type: 'leaf',
    id,
    content: {
      kind: 'terminal',
      mode: 'claude',
      shell: 'system',
      createRequestId: `cr-${id}`,
      status: 'running',
      initialCwd,
    },
  }
}

// Helper to create a claude-chat leaf
function chatLeaf(id: string, initialCwd?: string): PaneNode {
  return {
    type: 'leaf',
    id,
    content: {
      kind: 'claude-chat',
      createRequestId: `cr-${id}`,
      status: 'connected',
      initialCwd,
    },
  }
}

// Helper to create a picker leaf
function pickerLeaf(id: string): PaneNode {
  return { type: 'leaf', id, content: { kind: 'picker' } }
}

// Helper to create a browser leaf
function browserLeaf(id: string): PaneNode {
  return { type: 'leaf', id, content: { kind: 'browser', url: '', devToolsOpen: false } }
}

function split(left: PaneNode, right: PaneNode): PaneNode {
  return {
    type: 'split',
    id: 'split-1',
    direction: 'horizontal',
    children: [left, right],
    sizes: [50, 50],
  }
}

describe('getTabDirectoryPreference', () => {
  it('returns undefined default and empty list for a single picker pane', () => {
    const result = getTabDirectoryPreference(pickerLeaf('p1'))
    expect(result).toEqual({ defaultCwd: undefined, tabDirectories: [] })
  })

  it('returns the only directory when one terminal pane exists', () => {
    const node = split(
      terminalLeaf('t1', '/home/user/code/freshell'),
      pickerLeaf('p1'),
    )
    const result = getTabDirectoryPreference(node)
    expect(result.defaultCwd).toBe('/home/user/code/freshell')
    expect(result.tabDirectories).toEqual(['/home/user/code/freshell'])
  })

  it('picks the most-used directory as default', () => {
    const node: PaneNode = {
      type: 'split',
      id: 's1',
      direction: 'horizontal',
      children: [
        split(
          terminalLeaf('t1', '/code/alpha'),
          terminalLeaf('t2', '/code/beta'),
        ),
        split(
          terminalLeaf('t3', '/code/alpha'),
          pickerLeaf('p1'),
        ),
      ],
      sizes: [50, 50],
    }
    const result = getTabDirectoryPreference(node)
    expect(result.defaultCwd).toBe('/code/alpha')
    expect(result.tabDirectories).toEqual(['/code/alpha', '/code/beta'])
  })

  it('uses alphabetical tiebreaker when directories have equal frequency', () => {
    const node = split(
      terminalLeaf('t1', '/code/beta'),
      terminalLeaf('t2', '/code/alpha'),
    )
    const result = getTabDirectoryPreference(node)
    expect(result.defaultCwd).toBe('/code/alpha')
    expect(result.tabDirectories).toEqual(['/code/alpha', '/code/beta'])
  })

  it('includes claude-chat pane directories', () => {
    const node = split(
      chatLeaf('c1', '/code/project'),
      terminalLeaf('t1', '/code/project'),
    )
    const result = getTabDirectoryPreference(node)
    expect(result.defaultCwd).toBe('/code/project')
    expect(result.tabDirectories).toEqual(['/code/project'])
  })

  it('ignores panes without initialCwd', () => {
    const node = split(
      terminalLeaf('t1', undefined),
      terminalLeaf('t2', '/code/alpha'),
    )
    const result = getTabDirectoryPreference(node)
    expect(result.defaultCwd).toBe('/code/alpha')
    expect(result.tabDirectories).toEqual(['/code/alpha'])
  })

  it('ignores browser and editor panes', () => {
    const node = split(
      browserLeaf('b1'),
      terminalLeaf('t1', '/code/alpha'),
    )
    const result = getTabDirectoryPreference(node)
    expect(result.defaultCwd).toBe('/code/alpha')
    expect(result.tabDirectories).toEqual(['/code/alpha'])
  })

  it('returns undefined default and empty list when no panes have directories', () => {
    const node = split(
      terminalLeaf('t1', undefined),
      browserLeaf('b1'),
    )
    const result = getTabDirectoryPreference(node)
    expect(result).toEqual({ defaultCwd: undefined, tabDirectories: [] })
  })
})
