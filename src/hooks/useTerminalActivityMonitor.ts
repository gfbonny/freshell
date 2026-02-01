import { useEffect, useRef, useState, useMemo } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { markReady, clearReadyForTab, STREAMING_THRESHOLD_MS } from '@/store/terminalActivitySlice'
import { useNotificationSound } from './useNotificationSound'
import type { PaneNode } from '@/store/paneTypes'

/** Extract all pane IDs from a pane tree */
function collectPaneIds(node: PaneNode | undefined): string[] {
  if (!node) return []
  if (node.type === 'leaf') return [node.id]
  return [...collectPaneIds(node.children[0]), ...collectPaneIds(node.children[1])]
}

/** Check if a pane is streaming based on last output time */
function isStreaming(lastOutputAt: number | undefined, now: number): boolean {
  if (!lastOutputAt) return false
  return now - lastOutputAt < STREAMING_THRESHOLD_MS
}

export interface TabActivityState {
  /** Terminal is actively streaming (only shown on active tab) */
  isWorking: boolean
  /** Terminal stopped streaming on background tab (needs attention) */
  isFinished: boolean
}

/**
 * Monitor terminal activity and handle transitions.
 *
 * States:
 * - Ready (default): green dot - terminal is idle
 * - Working: pulsing grey - terminal is streaming (only shown on active tab)
 * - Finished: green dot + blue tab bg - streaming stopped on background tab
 *
 * Rules:
 * - Working can only be shown when tab is active
 * - Finished is entered when background tab stops streaming
 * - Selecting a finished tab clears it to ready
 */
export function useTerminalActivityMonitor() {
  const dispatch = useAppDispatch()
  const { play: playSound } = useNotificationSound()

  const tabs = useAppSelector((s) => s.tabs.tabs)
  const activeTabId = useAppSelector((s) => s.tabs.activeTabId)
  const layouts = useAppSelector((s) => s.panes.layouts)
  const lastOutputAt = useAppSelector((s) => s.terminalActivity.lastOutputAt)
  const ready = useAppSelector((s) => s.terminalActivity.ready)
  const notifications = useAppSelector((s) => s.settings.settings.notifications)

  // Force re-render periodically to update streaming state (time-based)
  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 500)
    return () => clearInterval(interval)
  }, [])

  // Track previous streaming state to detect transitions
  const prevStreamingRef = useRef<Record<string, boolean>>({})

  // Check for streaming -> idle transitions and handle notifications
  useEffect(() => {
    const now = Date.now()

    // Calculate current streaming state
    const currentStreaming: Record<string, boolean> = {}
    for (const paneId of Object.keys(lastOutputAt)) {
      currentStreaming[paneId] = isStreaming(lastOutputAt[paneId], now)
    }

    const prevStreaming = prevStreamingRef.current
    let shouldPlaySound = false

    for (const [paneId, wasStreaming] of Object.entries(prevStreaming)) {
      const isNowStreaming = currentStreaming[paneId] ?? false

      // Transition: streaming -> idle
      if (wasStreaming && !isNowStreaming) {
        // Find which tab this pane belongs to
        let ownerTabId: string | null = null
        for (const tab of tabs) {
          const layout = layouts[tab.id]
          const paneIds = collectPaneIds(layout)
          if (paneIds.includes(paneId)) {
            ownerTabId = tab.id
            break
          }
        }

        // Only mark ready if this isn't the active tab
        if (ownerTabId && ownerTabId !== activeTabId) {
          if (notifications?.visualWhenFinished) {
            dispatch(markReady({ paneId }))
          }
          if (notifications?.soundWhenFinished) {
            shouldPlaySound = true
          }
        }
      }
    }

    // Play sound (debounced by the hook)
    if (shouldPlaySound) {
      playSound()
    }

    prevStreamingRef.current = currentStreaming
  }, [lastOutputAt, tabs, layouts, activeTabId, notifications, dispatch, playSound])

  // Clear ready state when tab is selected
  useEffect(() => {
    if (!activeTabId) return

    const layout = layouts[activeTabId]
    const paneIds = collectPaneIds(layout)
    if (paneIds.length > 0) {
      dispatch(clearReadyForTab({ paneIds }))
    }
  }, [activeTabId, layouts, dispatch])

  // Compute activity states for all tabs
  const tabActivityStates = useMemo(() => {
    const now = Date.now()
    const states: Record<string, TabActivityState> = {}

    for (const tab of tabs) {
      const layout = layouts[tab.id]
      const paneIds = collectPaneIds(layout)

      let isStreaming = false
      let isFinished = false

      for (const paneId of paneIds) {
        if (lastOutputAt[paneId] && now - lastOutputAt[paneId] < STREAMING_THRESHOLD_MS) {
          isStreaming = true
        }
        if (ready[paneId]) {
          isFinished = true
        }
      }

      const isActiveTab = tab.id === activeTabId

      // Working: only shown on active tab when streaming
      // Finished: shown on background tabs that stopped streaming
      states[tab.id] = {
        isWorking: notifications?.visualWhenWorking && isActiveTab && isStreaming,
        isFinished: notifications?.visualWhenFinished && !isActiveTab && isFinished,
      }
    }

    return states
  }, [tabs, layouts, lastOutputAt, ready, notifications, activeTabId])

  return { tabActivityStates }
}
