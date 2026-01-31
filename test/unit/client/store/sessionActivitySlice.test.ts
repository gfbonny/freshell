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

  it('does not write to localStorage from the reducer', () => {
    const store = createStore()
    const timestamp = Date.now()
    const setItemSpy = vi.spyOn(localStorage, 'setItem')

    store.dispatch(updateSessionActivity({ sessionId: 'session-1', lastInputAt: timestamp }))

    expect(setItemSpy).not.toHaveBeenCalled()
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

  it('drops non-numeric entries loaded from localStorage', async () => {
    const now = Date.now()
    localStorage.setItem(
      'freshell.sessionActivity.v1',
      JSON.stringify({ 'session-1': 'bad-value', 'session-2': now })
    )

    vi.resetModules()
    const {
      default: freshReducer,
      selectSessionActivity: freshSelectSessionActivity,
    } = await import('@/store/sessionActivitySlice')

    const store = configureStore({
      reducer: { sessionActivity: freshReducer },
    })

    const state = store.getState()
    expect(freshSelectSessionActivity(state, 'session-1')).toBeUndefined()
    expect(freshSelectSessionActivity(state, 'session-2')).toBe(now)
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

  it('prunes sessions older than the retention window', () => {
    const store = createStore()
    const now = Date.now()
    const oldTime = now - 1000 * 60 * 60 * 24 * 31 // 31 days ago

    store.dispatch(updateSessionActivity({ sessionId: 'old-session', lastInputAt: oldTime }))
    store.dispatch(updateSessionActivity({ sessionId: 'fresh-session', lastInputAt: now }))

    const state = store.getState()
    expect(selectSessionActivity(state, 'old-session')).toBeUndefined()
    expect(selectSessionActivity(state, 'fresh-session')).toBe(now)
  })
})
