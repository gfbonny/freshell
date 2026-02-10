import { describe, it, expect } from 'vitest'
import { collectPaneContents } from '@/lib/pane-utils'
import type { PaneNode, PaneContent } from '@/store/paneTypes'

function leaf(id: string, content: PaneContent): PaneNode {
  return { type: 'leaf', id, content }
}

function split(children: [PaneNode, PaneNode]): PaneNode {
  return { type: 'split', id: 'split-1', direction: 'horizontal', children, sizes: [50, 50] }
}

const shellContent: PaneContent = {
  kind: 'terminal', mode: 'shell', shell: 'system', createRequestId: 'r1', status: 'running',
}
const claudeContent: PaneContent = {
  kind: 'terminal', mode: 'claude', shell: 'system', createRequestId: 'r2', status: 'running',
}
const browserContent: PaneContent = {
  kind: 'browser', url: 'https://example.com', devToolsOpen: false,
}

describe('collectPaneContents', () => {
  it('returns content array from a single leaf', () => {
    const result = collectPaneContents(leaf('p1', shellContent))
    expect(result).toEqual([shellContent])
  })

  it('returns contents from both children of a split', () => {
    const result = collectPaneContents(split([
      leaf('p1', shellContent),
      leaf('p2', claudeContent),
    ]))
    expect(result).toEqual([shellContent, claudeContent])
  })

  it('traverses nested splits depth-first', () => {
    const nested = split([
      split([leaf('p1', shellContent), leaf('p2', claudeContent)]),
      leaf('p3', browserContent),
    ])
    const result = collectPaneContents(nested)
    expect(result).toEqual([shellContent, claudeContent, browserContent])
  })
})
