import type { PaneNode } from '@/store/paneTypes'

export type TabDirectoryPreference = {
  /** The best default directory for new panes in this tab (most-used, alpha tiebreaker) */
  defaultCwd: string | undefined
  /** All directories in use in this tab, sorted by frequency desc then alphabetically */
  tabDirectories: string[]
}

/**
 * Walk a pane tree and compute directory preference for the tab.
 * Counts initialCwd occurrences across terminal and claude-chat panes.
 * Returns the most-used directory (alphabetical tiebreaker) and a
 * frequency-sorted list of all tab directories.
 */
export function getTabDirectoryPreference(root: PaneNode): TabDirectoryPreference {
  const counts = new Map<string, number>()

  function walk(node: PaneNode): void {
    if (node.type === 'leaf') {
      const content = node.content
      if (content.kind === 'terminal' || content.kind === 'claude-chat') {
        const cwd = content.initialCwd?.trim()
        if (cwd) {
          counts.set(cwd, (counts.get(cwd) ?? 0) + 1)
        }
      }
      return
    }
    walk(node.children[0])
    walk(node.children[1])
  }

  walk(root)

  if (counts.size === 0) {
    return { defaultCwd: undefined, tabDirectories: [] }
  }

  // Sort by frequency descending, then alphabetically
  const sorted = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]
    return a[0].localeCompare(b[0])
  })

  return {
    defaultCwd: sorted[0][0],
    tabDirectories: sorted.map(([dir]) => dir),
  }
}
