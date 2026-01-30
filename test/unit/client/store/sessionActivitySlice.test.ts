import { describe, it, expect, beforeEach, vi } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import sessionActivityReducer, {
  updateSessionActivity,
  selectSessionActivity,
} from '@/store/sessionActivitySlice'

describe('sessionActivitySlice - ratchet persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  function createStore() {
    return configureStore({
      reducer: { sessionActivity: sessionActivityReducer },
    })
  }

  it('stores lastInputAt for a session', () => {
    const store = createStore()
    const timestamp = Date.now()

    store.dispatch(updateSessionActivity({ sessionId: 'session-1', lastInputAt: timestamp }))

    const state = store.getState()
    expect(selectSessionActivity(state, 'session-1')).toBe(timestamp)
  })

  it('does not downgrade lastInputAt (ratchet behavior)', () => {
    const store = createStore()
    const oldTime = Date.now() - 10000
    const newTime = Date.now()

    store.dispatch(updateSessionActivity({ sessionId: 'session-1', lastInputAt: newTime }))
    store.dispatch(updateSessionActivity({ sessionId: 'session-1', lastInputAt: oldTime }))

    const state = store.getState()
    expect(selectSessionActivity(state, 'session-1')).toBe(newTime)
  })

  it('persists to localStorage', () => {
    const store = createStore()
    const timestamp = Date.now()

    store.dispatch(updateSessionActivity({ sessionId: 'session-1', lastInputAt: timestamp }))

    const stored = JSON.parse(localStorage.getItem('freshell.sessionActivity.v1') || '{}')
    expect(stored['session-1']).toBe(timestamp)
  })

  it('loads from localStorage on slice initialization', async () => {
    const timestamp = Date.now()
    localStorage.setItem('freshell.sessionActivity.v1', JSON.stringify({ 'session-1': timestamp }))

    vi.resetModules()
    const {
      default: freshReducer,
      selectSessionActivity: freshSelectSessionActivity,
    } = await import('@/store/sessionActivitySlice')

    const store = configureStore({
      reducer: { sessionActivity: freshReducer },
    })

    const state = store.getState()
    expect(freshSelectSessionActivity(state, 'session-1')).toBe(timestamp)
  })

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('freshell.sessionActivity.v1', 'not-valid-json')

    const store = createStore()
    const state = store.getState()
    expect(state.sessionActivity.sessions).toEqual({})
  })

  it('handles multiple sessions independently', () => {
    const store = createStore()
    const time1 = Date.now()
    const time2 = Date.now() + 1000

    store.dispatch(updateSessionActivity({ sessionId: 'session-1', lastInputAt: time1 }))
    store.dispatch(updateSessionActivity({ sessionId: 'session-2', lastInputAt: time2 }))

    const state = store.getState()
    expect(selectSessionActivity(state, 'session-1')).toBe(time1)
    expect(selectSessionActivity(state, 'session-2')).toBe(time2)
  })
})
