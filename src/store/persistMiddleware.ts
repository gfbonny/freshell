import type { Middleware } from '@reduxjs/toolkit'
import type { RootState } from './store'

const STORAGE_KEY = 'freshell.tabs.v1'
const PANES_STORAGE_KEY = 'freshell.panes.v1'

export function loadPersistedTabs(): any | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed
  } catch {
    return null
  }
}

export function loadPersistedPanes(): any | null {
  try {
    const raw = localStorage.getItem(PANES_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed
  } catch {
    return null
  }
}

export const persistMiddleware: Middleware<{}, RootState> = (store) => (next) => (action) => {
  const result = next(action)
  const state = store.getState()

  // Persist tabs slice
  const tabsPayload = {
    tabs: state.tabs,
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabsPayload))
  } catch {
    // ignore quota
  }

  // Persist panes slice
  try {
    const panesJson = JSON.stringify(state.panes)
    localStorage.setItem(PANES_STORAGE_KEY, panesJson)
    // Debug: log when we persist a split pane
    if (panesJson.includes('"type":"split"')) {
      console.log('[Panes Persist] Saved split pane to localStorage')
      console.log('[Panes Persist] Layout keys being saved:', Object.keys(state.panes.layouts))
    }
  } catch (err) {
    console.error('[Panes Persist] Failed to save to localStorage:', err)
  }

  return result
}
