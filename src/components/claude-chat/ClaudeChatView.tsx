import { useEffect, useRef } from 'react'
import type { ClaudeChatPaneContent } from '@/store/paneTypes'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { updatePaneContent } from '@/store/panesSlice'
import { getWsClient } from '@/lib/ws-client'

interface ClaudeChatViewProps {
  tabId: string
  paneId: string
  paneContent: ClaudeChatPaneContent
  hidden?: boolean
}

export default function ClaudeChatView({ tabId, paneId, paneContent, hidden }: ClaudeChatViewProps) {
  const dispatch = useAppDispatch()
  const ws = getWsClient()
  const createSentRef = useRef(false)

  // Send sdk.create when the pane first mounts with a createRequestId but no sessionId
  useEffect(() => {
    if (paneContent.sessionId || createSentRef.current) return
    if (paneContent.status !== 'creating') return

    createSentRef.current = true
    ws.send({
      type: 'sdk.create',
      requestId: paneContent.createRequestId,
      ...(paneContent.initialCwd ? { cwd: paneContent.initialCwd } : {}),
      ...(paneContent.resumeSessionId ? { resumeSessionId: paneContent.resumeSessionId } : {}),
    })

    // Update status to 'starting'
    dispatch(updatePaneContent({
      tabId,
      paneId,
      content: { ...paneContent, status: 'starting' },
    }))
  }, [paneContent.createRequestId, paneContent.sessionId, paneContent.status])

  if (hidden) return null

  return (
    <div className="h-full w-full flex flex-col" role="region" aria-label="Claude Web Chat">
      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b text-xs text-muted-foreground">
        <span>
          {paneContent.status === 'creating' && 'Creating session...'}
          {paneContent.status === 'starting' && 'Starting Claude Code...'}
          {paneContent.status === 'connected' && 'Connected'}
          {paneContent.status === 'running' && 'Running...'}
          {paneContent.status === 'idle' && 'Ready'}
          {paneContent.status === 'compacting' && 'Compacting context...'}
          {paneContent.status === 'exited' && 'Session ended'}
        </span>
        {paneContent.initialCwd && (
          <span className="truncate ml-2">{paneContent.initialCwd}</span>
        )}
      </div>

      {/* Message area (placeholder) */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="text-center text-muted-foreground text-sm py-8">
          <p className="font-medium mb-2">Claude Web Chat</p>
          <p>Rich chat UI for Claude Code sessions.</p>
          <p className="text-xs mt-2">Session: {paneContent.sessionId ?? 'pending'}</p>
        </div>
      </div>

      {/* Composer (placeholder) */}
      <div className="border-t p-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            className="flex-1 rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder={paneContent.status === 'idle' || paneContent.status === 'connected' ? 'Message Claude...' : 'Waiting for connection...'}
            disabled={paneContent.status !== 'idle' && paneContent.status !== 'connected'}
            aria-label="Chat message input"
          />
          <button
            type="button"
            className="px-3 py-2 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={paneContent.status !== 'idle' && paneContent.status !== 'connected'}
            aria-label="Send message"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
