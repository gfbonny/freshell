import type { Middleware } from '@reduxjs/toolkit'
import type { RootState } from './store'
import { removePaneActivity } from './terminalActivitySlice'
import type { PaneNode, PaneContent } from './paneTypes'

function collectPaneKindMap(layouts: Record<string, PaneNode>): Record<string, PaneContent['kind']> {
  const map: Record<string, PaneContent['kind']> = {}

  const walk = (node: PaneNode) => {
    if (node.type === 'leaf') {
      map[node.id] = node.content.kind
      return
    }
    walk(node.children[0])
    walk(node.children[1])
  }

  for (const layout of Object.values(layouts || {})) {
    if (layout) walk(layout)
  }

  return map
}

export const paneActivityCleanupMiddleware: Middleware<{}, RootState> = (store) => (next) => (action) => {
  const isPaneAction = typeof action?.type === 'string' && action.type.startsWith('panes/')
  if (!isPaneAction) return next(action)

  const prevLayouts = store.getState().panes.layouts
  const prevMap = collectPaneKindMap(prevLayouts)

  const result = next(action)

  const nextLayouts = store.getState().panes.layouts
  const nextMap = collectPaneKindMap(nextLayouts)

  for (const [paneId, kind] of Object.entries(prevMap)) {
    if (kind !== 'terminal') continue
    const nextKind = nextMap[paneId]
    if (!nextKind || nextKind !== 'terminal') {
      store.dispatch(removePaneActivity({ paneId }))
    }
  }

  return result
}
