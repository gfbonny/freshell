import TerminalView from './TerminalView'
import ClaudeSessionView from './ClaudeSessionView'
import { useAppSelector } from '@/store/hooks'

interface TabContentProps {
  tabId: string
  hidden?: boolean
}

export default function TabContent({ tabId, hidden }: TabContentProps) {
  const tab = useAppSelector((s) => s.tabs.tabs.find((t) => t.id === tabId))

  if (!tab) return null

  // Use ClaudeSessionView for claude mode with claudeSessionId
  if (tab.mode === 'claude' && tab.claudeSessionId) {
    return <ClaudeSessionView sessionId={tab.claudeSessionId} hidden={hidden} />
  }

  // Fall back to terminal for shell mode or claude without claudeSessionId yet
  return <TerminalView tabId={tabId} hidden={hidden} />
}
