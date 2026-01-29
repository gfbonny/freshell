import { X, Plus, Circle, Terminal, MessageSquare, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { addTab, removeTab, setActiveTab, updateTab } from '@/store/tabsSlice'
import { createClaudeSession } from '@/store/claudeSlice'
import { getWsClient } from '@/lib/ws-client'
import { useMemo, useState, useRef, useEffect } from 'react'

function StatusIndicator({ status }: { status: string }) {
  if (status === 'running') {
    return (
      <div className="relative">
        <Circle className="h-2 w-2 fill-success text-success" />
      </div>
    )
  }
  if (status === 'exited') {
    return <Circle className="h-2 w-2 text-muted-foreground/40" />
  }
  if (status === 'error') {
    return <Circle className="h-2 w-2 fill-destructive text-destructive" />
  }
  return <Circle className="h-2 w-2 text-muted-foreground/20 animate-pulse" />
}

export default function TabBar() {
  const dispatch = useAppDispatch()
  const { tabs, activeTabId } = useAppSelector((s) => s.tabs)

  const ws = useMemo(() => getWsClient(), [])

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showNewMenu, setShowNewMenu] = useState(false)
  const [showPromptDialog, setShowPromptDialog] = useState(false)
  const [claudePrompt, setClaudePrompt] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const promptInputRef = useRef<HTMLInputElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowNewMenu(false)
      }
    }
    if (showNewMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showNewMenu])

  // Focus prompt input when dialog opens
  useEffect(() => {
    if (showPromptDialog && promptInputRef.current) {
      promptInputRef.current.focus()
    }
  }, [showPromptDialog])

  const handleCreateClaudeSession = () => {
    if (!claudePrompt.trim()) return

    const requestId = `claude-${Date.now()}`

    // Create Claude session in Redux
    dispatch(
      createClaudeSession({
        sessionId: requestId,
        prompt: claudePrompt.trim(),
      })
    )

    // Create tab linked to Claude session
    dispatch(
      addTab({
        title: claudePrompt.trim().slice(0, 30) + (claudePrompt.trim().length > 30 ? '...' : ''),
        mode: 'claude',
        claudeSessionId: requestId,
        status: 'creating',
      })
    )

    // Send WebSocket request to create the Claude session on server
    ws.send({
      type: 'claude.create',
      requestId,
      prompt: claudePrompt.trim(),
    })

    setClaudePrompt('')
    setShowPromptDialog(false)
  }

  if (tabs.length === 0) return null

  return (
    <div className="h-10 flex items-center gap-1 px-2 border-b border-border/30 bg-background">
      <div className="flex items-center gap-0.5 overflow-x-auto flex-1 py-1">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              className={cn(
                'group flex items-center gap-2 h-7 px-3 rounded-md text-sm cursor-pointer transition-all',
                active
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
              onClick={() => dispatch(setActiveTab(tab.id))}
              onDoubleClick={() => {
                setRenamingId(tab.id)
                setRenameValue(tab.title)
              }}
            >
              <StatusIndicator status={tab.status} />

              {renamingId === tab.id ? (
                <input
                  className="bg-transparent outline-none w-32 text-sm"
                  value={renameValue}
                  autoFocus
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => {
                    dispatch(updateTab({ id: tab.id, updates: { title: renameValue || tab.title } }))
                    setRenamingId(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') {
                      ;(e.target as HTMLInputElement).blur()
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="whitespace-nowrap max-w-[10rem] truncate text-xs">
                  {tab.title}
                </span>
              )}

              <button
                className={cn(
                  'ml-0.5 p-0.5 rounded transition-opacity',
                  active ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'
                )}
                title="Close (Shift+Click to kill)"
                onClick={(e) => {
                  e.stopPropagation()
                  if (tab.terminalId) {
                    ws.send({
                      type: e.shiftKey ? 'terminal.kill' : 'terminal.detach',
                      terminalId: tab.terminalId,
                    })
                  }
                  dispatch(removeTab(tab.id))
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )
        })}
      </div>

      <div className="relative" ref={menuRef}>
        <button
          className="flex items-center gap-0.5 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          title="New tab"
          onClick={() => setShowNewMenu(!showNewMenu)}
        >
          <Plus className="h-3.5 w-3.5" />
          <ChevronDown className="h-2.5 w-2.5" />
        </button>

        {showNewMenu && (
          <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-lg z-50 min-w-[140px] py-1">
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted/50 transition-colors"
              onClick={() => {
                dispatch(addTab({ mode: 'shell' }))
                setShowNewMenu(false)
              }}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>Shell</span>
            </button>
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted/50 transition-colors"
              onClick={() => {
                setShowNewMenu(false)
                setShowPromptDialog(true)
              }}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Claude</span>
            </button>
          </div>
        )}
      </div>

      {/* Claude Prompt Dialog */}
      {showPromptDialog && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-popover border border-border rounded-lg shadow-lg p-4 w-full max-w-md">
            <h3 className="text-lg font-medium mb-3">New Claude Session</h3>
            <input
              ref={promptInputRef}
              type="text"
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Enter your prompt..."
              value={claudePrompt}
              onChange={(e) => setClaudePrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateClaudeSession()
                if (e.key === 'Escape') {
                  setShowPromptDialog(false)
                  setClaudePrompt('')
                }
              }}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                className="px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                onClick={() => {
                  setShowPromptDialog(false)
                  setClaudePrompt('')
                }}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                disabled={!claudePrompt.trim()}
                onClick={handleCreateClaudeSession}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
