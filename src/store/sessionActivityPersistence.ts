import type { Middleware } from '@reduxjs/toolkit'
import { SESSION_ACTIVITY_STORAGE_KEY } from './sessionActivitySlice'

export const SESSION_ACTIVITY_PERSIST_DEBOUNCE_MS = 5000

type SessionActivityState = {
  sessionActivity?: {
    sessions?: Record<string, number>
  }
}

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

export const sessionActivityPersistMiddleware: Middleware<{}, SessionActivityState> = (store) => {
  let dirty = false
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    flushTimer = null
    if (!dirty) return
    if (!canUseStorage()) {
      scheduleFlush()
      return
    }

    try {
      const sessions = store.getState().sessionActivity?.sessions || {}
      localStorage.setItem(SESSION_ACTIVITY_STORAGE_KEY, JSON.stringify(sessions))
      dirty = false
    } catch {
      // Ignore storage errors (quota exceeded, etc.)
      scheduleFlush()
    }
  }

  const scheduleFlush = () => {
    if (flushTimer) return
    flushTimer = setTimeout(flush, SESSION_ACTIVITY_PERSIST_DEBOUNCE_MS)
  }

  return (next) => (action) => {
    const result = next(action)

    if (typeof action?.type === 'string' && action.type.startsWith('sessionActivity/')) {
      dirty = true
      scheduleFlush()
    }

    return result
  }
}
