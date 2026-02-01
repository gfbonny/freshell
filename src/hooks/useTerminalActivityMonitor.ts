import { useEffect, useRef, useMemo, useCallback } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  enterWorking,
  finishWorking,
  clearFinishedForTab,
  resetInputForTab,
  STREAMING_THRESHOLD_MS,
  INPUT_ECHO_WINDOW_MS,
  WORKING_ENTER_THRESHOLD_MS,
} from '@/store/terminalActivitySlice'
import { useNotificationSound } from './useNotificationSound'
import type { PaneNode } from '@/store/paneTypes'

/** Extract all pane IDs from a pane tree */
function collectPaneIds(node: PaneNode | undefined): string[] {
  if (!node) return []
  if (node.type === 'leaf') return [node.id]
  return [...collectPaneIds(node.children[0]), ...collectPaneIds(node.children[1])]
}

/**
 * Check if a pane is streaming based on last output time.
 * Filters out output that's likely just input echo (within INPUT_ECHO_WINDOW_MS of input).
 */
function isPaneStreaming(
  lastOutputAt: number | undefined,
  lastInputAt: number | undefined,
  now: number
): boolean {
  if (!lastOutputAt) return false
  // No recent output = not streaming
  if (now - lastOutputAt >= STREAMING_THRESHOLD_MS) return false
  // If there's been recent input, output might just be echo - don't count as streaming
  if (lastInputAt && now - lastInputAt < INPUT_ECHO_WINDOW_MS) return false
  return true
}

/**
 * Check if a pane has output happening RIGHT NOW (for entering working state).
 * Uses a much shorter threshold than isPaneStreaming.
 */
function isPaneOutputActive(
  lastOutputAt: number | undefined,
  lastInputAt: number | undefined,
  now: number
): boolean {
  if (!lastOutputAt) return false
  // Must have very recent output (within last 1-2 seconds)
  if (now - lastOutputAt >= WORKING_ENTER_THRESHOLD_MS) return false
  // If there's been recent input, output might just be echo
  if (lastInputAt && now - lastInputAt < INPUT_ECHO_WINDOW_MS) return false
  return true
}

export interface TabActivityState {
  /** Tab has panes in working state (streaming, pulsing grey) */
  isWorking: boolean
  /** Tab has panes in finished state AND is a background tab (green ring) */
  isFinished: boolean
}

/**
 * Monitor terminal activity and handle state transitions.
 *
 * State machine:
 * - Ready (default): green dot - terminal is idle
 * - Working: pulsing grey - terminal is streaming (can only enter when tab is active)
 * - Finished: green ring - streaming stopped (only visible on background tabs)
 *
 * Transitions:
 * - Ready → Working: output starts AND tab is active
 * - Working → Finished: output stops (20s idle)
 * - Finished → Ready: user clicks on tab
 */
export function useTerminalActivityMonitor() {
  const dispatch = useAppDispatch()
  const { play: playSound } = useNotificationSound()

  const tabs = useAppSelector((s) => s.tabs.tabs)
  const activeTabId = useAppSelector((s) => s.tabs.activeTabId)
  const layouts = useAppSelector((s) => s.panes.layouts)
  const lastOutputAt = useAppSelector((s) => s.terminalActivity.lastOutputAt)
  const lastInputAt = useAppSelector((s) => s.terminalActivity.lastInputAt)
  const working = useAppSelector((s) => s.terminalActivity.working)
  const finished = useAppSelector((s) => s.terminalActivity.finished)
  const notifications = useAppSelector((s) => s.settings.settings.notifications)

  // Track previous streaming state to detect transitions
  const prevStreamingRef = useRef<Record<string, boolean>>({})

  // Track if we had streaming recently (to keep interval running long enough to catch transitions)
  const hadStreamingRef = useRef(false)

  // Find which tab owns a pane
  const findOwnerTab = useCallback(
    (paneId: string): string | null => {
      for (const tab of tabs) {
        const layout = layouts[tab.id]
        const paneIds = collectPaneIds(layout)
        if (paneIds.includes(paneId)) {
          return tab.id
        }
      }
      return null
    },
    [tabs, layouts]
  )

  // Check if any pane is currently streaming (to know if we need interval)
  const hasActiveStreaming = useMemo(() => {
    const now = Date.now()
    for (const paneId of Object.keys(lastOutputAt)) {
      if (isPaneStreaming(lastOutputAt[paneId], lastInputAt[paneId], now)) {
        return true
      }
    }
    return false
  }, [lastOutputAt, lastInputAt])

  // Handle entering working state when output starts on active tab after user input
  useEffect(() => {
    const now = Date.now()
    for (const paneId of Object.keys(lastOutputAt)) {
      // Skip if already working
      if (working[paneId]) continue

      // Must have had user input first (user initiated the work)
      if (!lastInputAt[paneId]) continue

      // Output must be happening after the input (response to user action)
      const outputTime = lastOutputAt[paneId]
      const inputTime = lastInputAt[paneId]
      if (!outputTime || outputTime < inputTime) continue

      // Check if output is happening RIGHT NOW
      if (!isPaneOutputActive(outputTime, inputTime, now)) continue

      // Check if this pane's tab is active
      const ownerTabId = findOwnerTab(paneId)
      if (ownerTabId === activeTabId) {
        // Enter working state
        dispatch(enterWorking({ paneId }))
      }
    }
  }, [lastOutputAt, lastInputAt, working, activeTabId, findOwnerTab, dispatch])

  // Callback to check for working → finished transitions
  const checkTransitions = useCallback(() => {
    const now = Date.now()

    // Calculate current streaming state
    const currentStreaming: Record<string, boolean> = {}
    for (const paneId of Object.keys(lastOutputAt)) {
      currentStreaming[paneId] = isPaneStreaming(lastOutputAt[paneId], lastInputAt[paneId], now)
    }

    const prevStreaming = prevStreamingRef.current
    let shouldPlaySound = false

    for (const [paneId, wasStreaming] of Object.entries(prevStreaming)) {
      const isNowStreaming = currentStreaming[paneId] ?? false

      // Transition: streaming -> idle
      if (wasStreaming && !isNowStreaming) {
        // Only transition to finished if the pane was in working state
        if (working[paneId]) {
          const ownerTabId = findOwnerTab(paneId)
          dispatch(finishWorking({ paneId }))

          // Play sound for background tabs, or when browser is hidden/unfocused
          const isBackgroundTab = ownerTabId !== activeTabId
          const isBrowserHidden = document.hidden || !document.hasFocus()
          if (ownerTabId && (isBackgroundTab || isBrowserHidden) && notifications?.soundWhenFinished) {
            shouldPlaySound = true
          }
        }
      }
    }

    if (shouldPlaySound) {
      playSound()
    }

    prevStreamingRef.current = currentStreaming
  }, [lastOutputAt, lastInputAt, working, activeTabId, findOwnerTab, notifications, dispatch, playSound])

  // Run transition check when output changes
  useEffect(() => {
    checkTransitions()
  }, [checkTransitions])

  // Run interval when streaming, and trigger final check when streaming stops
  useEffect(() => {
    if (hasActiveStreaming) {
      hadStreamingRef.current = true
      const interval = setInterval(checkTransitions, 1000)
      return () => clearInterval(interval)
    } else if (hadStreamingRef.current) {
      hadStreamingRef.current = false
      checkTransitions()
    }
  }, [hasActiveStreaming, checkTransitions])

  // Clear finished state and reset input tracking when tab is selected
  useEffect(() => {
    if (!activeTabId) return

    const layout = layouts[activeTabId]
    const paneIds = collectPaneIds(layout)
    if (paneIds.length > 0) {
      dispatch(clearFinishedForTab({ paneIds }))
      // Reset stale input timestamps so panes need fresh input to enter working state
      dispatch(resetInputForTab({ paneIds }))
    }
  }, [activeTabId, layouts, dispatch])

  // Compute activity states for all tabs
  const tabActivityStates = useMemo(() => {
    const states: Record<string, TabActivityState> = {}

    for (const tab of tabs) {
      const layout = layouts[tab.id]
      const paneIds = collectPaneIds(layout)
      const isActiveTab = tab.id === activeTabId

      // Check if any pane in this tab is working
      let isWorking = false
      for (const paneId of paneIds) {
        if (working[paneId]) {
          isWorking = true
          break
        }
      }

      // Check if any pane in this tab is finished (only show on background tabs)
      let isFinished = false
      if (!isActiveTab && notifications?.visualWhenFinished) {
        for (const paneId of paneIds) {
          if (finished[paneId]) {
            isFinished = true
            break
          }
        }
      }

      states[tab.id] = { isWorking, isFinished }
    }

    return states
  }, [tabs, layouts, working, finished, notifications, activeTabId])

  return { tabActivityStates }
}
