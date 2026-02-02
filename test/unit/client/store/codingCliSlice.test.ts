import { describe, it, expect } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import codingCliReducer, {
  CODING_CLI_MAX_EVENTS,
  createCodingCliSession,
  addCodingCliEvent,
  getCodingCliSessionEvents,
  setCodingCliSessionStatus,
  clearCodingCliSession,
  registerCodingCliRequest,
  cancelCodingCliRequest,
  resolveCodingCliRequest,
} from '../../../../src/store/codingCliSlice'
import type { NormalizedEvent } from '../../../../src/lib/coding-cli-types'

function createTestStore(preloadedState = {}) {
  return configureStore({
    reducer: { codingCli: codingCliReducer },
    preloadedState: { codingCli: { sessions: {}, pendingRequests: {}, ...preloadedState } },
  })
}

describe('codingCliSlice', () => {
  describe('createCodingCliSession', () => {
    it('creates a new session with empty events', () => {
      const store = createTestStore()
      store.dispatch(createCodingCliSession({ sessionId: 'session-1', provider: 'claude', prompt: 'hello' }))

      const state = store.getState().codingCli
      expect(state.sessions['session-1']).toBeDefined()
      expect(state.sessions['session-1'].events).toEqual([])
      expect(state.sessions['session-1'].status).toBe('running')
      expect(state.sessions['session-1'].prompt).toBe('hello')
    })
  })

  describe('addCodingCliEvent', () => {
    it('appends event to session', () => {
      const store = createTestStore()
      store.dispatch(createCodingCliSession({ sessionId: 'session-1', provider: 'claude', prompt: 'test' }))

      const event: NormalizedEvent = {
        type: 'message.assistant',
        timestamp: new Date().toISOString(),
        sessionId: 'provider-session',
        provider: 'claude',
        message: { role: 'assistant', content: 'hello' },
      }
      store.dispatch(addCodingCliEvent({ sessionId: 'session-1', event }))

      const state = store.getState().codingCli
      expect(state.sessions['session-1'].events).toHaveLength(1)
      expect(state.sessions['session-1'].events[0]).toEqual(event)
    })

    it('ignores events for unknown sessions', () => {
      const store = createTestStore()
      const event: NormalizedEvent = {
        type: 'message.assistant',
        timestamp: new Date().toISOString(),
        sessionId: 'provider-session',
        provider: 'claude',
        message: { role: 'assistant', content: '' },
      }
      store.dispatch(addCodingCliEvent({ sessionId: 'unknown', event }))

      const state = store.getState().codingCli
      expect(state.sessions['unknown']).toBeUndefined()
    })

    it('extracts providerSessionId from session.start event', () => {
      const store = createTestStore()
      store.dispatch(createCodingCliSession({ sessionId: 'session-1', provider: 'claude', prompt: 'test' }))

      const initEvent: NormalizedEvent = {
        type: 'session.start',
        timestamp: new Date().toISOString(),
        sessionId: 'provider-session-abc',
        provider: 'claude',
        sessionInfo: { cwd: '/test', model: 'claude-3', provider: 'claude' },
      }
      store.dispatch(addCodingCliEvent({ sessionId: 'session-1', event: initEvent }))

      const state = store.getState().codingCli
      expect(state.sessions['session-1'].providerSessionId).toBe('provider-session-abc')
    })

    it('extracts providerSessionId from session.init event', () => {
      const store = createTestStore()
      store.dispatch(createCodingCliSession({ sessionId: 'session-1', provider: 'claude', prompt: 'test' }))

      const initEvent = {
        type: 'session.init',
        timestamp: new Date().toISOString(),
        sessionId: 'provider-session-init',
        provider: 'claude',
        sessionInfo: { cwd: '/test', model: 'claude-3', provider: 'claude' },
      } as unknown as NormalizedEvent

      store.dispatch(addCodingCliEvent({ sessionId: 'session-1', event: initEvent }))

      const state = store.getState().codingCli
      expect(state.sessions['session-1'].providerSessionId).toBe('provider-session-init')
    })

    it('caps events and tracks total count', () => {
      const store = createTestStore()
      store.dispatch(createCodingCliSession({ sessionId: 'session-1', provider: 'claude', prompt: 'test' }))

      for (let i = 1; i <= CODING_CLI_MAX_EVENTS + 5; i++) {
        const event: NormalizedEvent = {
          type: 'message.assistant',
          timestamp: new Date().toISOString(),
          sessionId: 'provider-session',
          provider: 'claude',
          sequenceNumber: i,
          message: { role: 'assistant', content: String(i) },
        }
        store.dispatch(addCodingCliEvent({ sessionId: 'session-1', event }))
      }

      const session = store.getState().codingCli.sessions['session-1']
      const events = getCodingCliSessionEvents(session)

      expect(events).toHaveLength(CODING_CLI_MAX_EVENTS)
      expect(events[0].sequenceNumber).toBe(6)
      expect(events[events.length - 1].sequenceNumber).toBe(CODING_CLI_MAX_EVENTS + 5)
      expect(session.eventCount).toBe(CODING_CLI_MAX_EVENTS + 5)
    })

  })
  describe('setCodingCliSessionStatus', () => {
    it('updates session status', () => {
      const store = createTestStore()
      store.dispatch(createCodingCliSession({ sessionId: 'session-1', provider: 'claude', prompt: 'test' }))
      store.dispatch(setCodingCliSessionStatus({ sessionId: 'session-1', status: 'completed' }))

      const state = store.getState().codingCli
      expect(state.sessions['session-1'].status).toBe('completed')
    })
  })

  describe('clearCodingCliSession', () => {
    it('removes session from state', () => {
      const store = createTestStore()
      store.dispatch(createCodingCliSession({ sessionId: 'session-1', provider: 'claude', prompt: 'test' }))
      store.dispatch(clearCodingCliSession({ sessionId: 'session-1' }))

      const state = store.getState().codingCli
      expect(state.sessions['session-1']).toBeUndefined()
    })
  })

  describe('pending request lifecycle', () => {
    it('tracks, cancels, and resolves pending requests', () => {
      const store = createTestStore()
      store.dispatch(registerCodingCliRequest({ requestId: 'req-1', provider: 'codex', prompt: 'hello' }))

      let state = store.getState().codingCli
      expect(state.pendingRequests['req-1']).toBeDefined()
      expect(state.pendingRequests['req-1'].canceled).toBe(false)

      store.dispatch(cancelCodingCliRequest({ requestId: 'req-1' }))
      state = store.getState().codingCli
      expect(state.pendingRequests['req-1'].canceled).toBe(true)

      store.dispatch(resolveCodingCliRequest({ requestId: 'req-1' }))
      state = store.getState().codingCli
      expect(state.pendingRequests['req-1']).toBeUndefined()
    })
  })
})
