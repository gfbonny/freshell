import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TerminalStatus } from '@/store/types'
import PaneHeader from './PaneHeader'

interface PaneProps {
  isActive: boolean
  isOnlyPane: boolean
  title?: string
  status?: TerminalStatus
  onClose: () => void
  onFocus: () => void
  children: React.ReactNode
}

export default function Pane({
  isActive,
  isOnlyPane,
  title,
  status,
  onClose,
  onFocus,
  children,
}: PaneProps) {
  const showHeader = !isOnlyPane && title !== undefined

  return (
    <div
      className={cn(
        'relative h-full w-full overflow-hidden flex flex-col',
        !isActive && 'opacity-70'
      )}
      onClick={onFocus}
    >
      {/* Pane header - shown when multiple panes and title available */}
      {showHeader && (
        <PaneHeader
          title={title}
          status={status || 'creating'}
          isActive={isActive}
          onClose={onClose}
        />
      )}

      {/* Fallback close button - shown when no header but multiple panes */}
      {!isOnlyPane && !showHeader && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="absolute top-1 right-1 z-10 p-1 rounded opacity-50 hover:opacity-100 text-muted-foreground hover:bg-muted/50 transition-opacity"
          title="Close pane"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 w-full">
        {children}
      </div>
    </div>
  )
}
