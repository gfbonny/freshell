import { PaneLayout } from './panes'
import { useAppSelector } from '@/store/hooks'
import { buildDefaultPaneContent } from '@/lib/default-pane'

interface TabContentProps {
  tabId: string
  hidden?: boolean
}

export default function TabContent({ tabId, hidden }: TabContentProps) {
  const tab = useAppSelector((s) => s.tabs.tabs.find((t) => t.id === tabId))
  const settings = useAppSelector((s) => s.settings.settings)

  if (!tab) return null

  const defaultContent = buildDefaultPaneContent(settings)

  // Use PaneLayout for all terminal-based tabs
  return (
    <div className={hidden ? 'tab-hidden' : 'tab-visible h-full w-full'}>
      <PaneLayout tabId={tabId} defaultContent={defaultContent} hidden={hidden} />
    </div>
  )
}
