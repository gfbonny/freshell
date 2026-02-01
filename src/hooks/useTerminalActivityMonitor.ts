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
  isWorking: boolean
  isReady: boolean
}

/**
 * Monitor terminal activity and handle transitions.
 * Also returns activity state for all tabs.
 *
 * This hook:
 * - Detects streaming -> idle transitions
 * - Marks panes as ready when they finish on non-active tabs
 * - Plays notification sound when configured
 * - Clears ready state when tab is selected
 * - Returns { tabActivityStates: Record<tabId, { isWorking, isReady }> }
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

      let tabIsWorking = false
      let tabIsReady = false

      for (const paneId of paneIds) {
        if (isStreaming(lastOutputAt[paneId], now)) {
          tabIsWorking = true
        }
        if (ready[paneId]) {
          tabIsReady = true
        }
      }

      // Working takes precedence over ready
      if (tabIsWorking) {
        tabIsReady = false
      }

      states[tab.id] = {
        isWorking: notifications?.visualWhenWorking ? tabIsWorking : false,
        isReady: notifications?.visualWhenFinished ? tabIsReady : false,
      }
    }

    return states
  }, [tabs, layouts, lastOutputAt, ready, notifications])

  return { tabActivityStates }
}
