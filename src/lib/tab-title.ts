import { deriveTabName } from './deriveTabName'
import type { Tab } from '@/store/types'
import type { PaneNode } from '@/store/paneTypes'

export function getTabDisplayTitle(
  tab: Tab,
  layout?: PaneNode,
  paneTitles?: Record<string, string>,
  activePaneId?: string
): string {
  const title = tab.title ?? ''
  const activePaneTitle =
    activePaneId && paneTitles ? paneTitles[activePaneId] : undefined
  const derivedName = layout ? deriveTabName(layout) : null
  const effectiveDerivedName = activePaneTitle || derivedName
  if (tab.titleSetByUser) {
    return title || effectiveDerivedName || 'Tab'
  }
  if (title && !title.match(/^Tab \d+$/) && title !== effectiveDerivedName) {
    return title
  }
  return effectiveDerivedName ?? (title || 'Tab')
}
