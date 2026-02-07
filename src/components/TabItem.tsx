import { useEffect, useRef } from 'react'
import { X, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import type { Tab, TerminalStatus } from '@/store/types'
import type { MouseEvent, KeyboardEvent } from 'react'
import { ContextIds } from '@/components/context-menu/context-menu-constants'

function StatusIndicator({ status, isWorking }: { status: TerminalStatus; isWorking?: boolean }) {
  // Working state: pulsing grey (terminal is streaming)
  if (isWorking) {
    return <Circle className="h-2 w-2 fill-muted-foreground text-muted-foreground animate-pulse" />
  }
  // Ready state (default): green dot for running terminals
  if (status === 'running') {
    return <Circle className="h-2 w-2 fill-success text-success" />
  }
  if (status === 'exited') {
    return <Circle className="h-2 w-2 text-muted-foreground/40" />
  }
  if (status === 'error') {
    return <Circle className="h-2 w-2 fill-destructive text-destructive" />
  }
  // Creating state
  return <Circle className="h-2 w-2 text-muted-foreground/20 animate-pulse" />
}

export interface TabItemProps {
  tab: Tab
  status: TerminalStatus
  isWorking?: boolean
  isActive: boolean
  isDragging: boolean
  isRenaming: boolean
  renameValue: string
  onRenameChange: (value: string) => void
  onRenameBlur: () => void
  onRenameKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
  onClose: (e: MouseEvent<HTMLButtonElement>) => void
  onClick: () => void
  onDoubleClick: () => void
}

export default function TabItem({
  tab,
  status,
  isWorking,
  isActive,
  isDragging,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameBlur,
  onRenameKeyDown,
  onClose,
  onClick,
  onDoubleClick,
}: TabItemProps) {
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isRenaming) return
    renameInputRef.current?.focus()
  }, [isRenaming])

  return (
    <div
      className={cn(
        'group flex items-center gap-2 h-8 px-3 rounded-t-md text-sm cursor-pointer transition-all',
        isActive
          ? 'bg-background text-foreground shadow-sm'
          : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-accent mt-1',
        isDragging && 'opacity-50'
      )}
      data-context={ContextIds.Tab}
      data-tab-id={tab.id}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      role="button"
      tabIndex={0}
      aria-label={`Switch to tab ${tab.title}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <StatusIndicator status={status} isWorking={isWorking} />

      {isRenaming ? (
        <input
          className="bg-transparent outline-none w-32 text-sm"
          value={renameValue}
          ref={renameInputRef}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onRenameBlur}
          onKeyDown={onRenameKeyDown}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                'whitespace-nowrap truncate text-sm',
                isActive ? 'max-w-[10rem]' : 'max-w-[5rem]'
              )}
            >
              {tab.title}
            </span>
          </TooltipTrigger>
          <TooltipContent>{tab.title}</TooltipContent>
        </Tooltip>
      )}

      <button
        className={cn(
          'ml-0.5 p-0.5 rounded transition-opacity',
          isActive
            ? 'opacity-60 hover:opacity-100'
            : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'
        )}
        title="Close (Shift+Click to kill)"
        onClick={(e) => {
          e.stopPropagation()
          onClose(e)
        }}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
