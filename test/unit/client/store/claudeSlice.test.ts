import { describe, it, expect } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import claudeReducer, {
  createClaudeSession,
  addClaudeEvent,
  setClaudeSessionStatus,
  clearClaudeSession,
} from '../../../../src/store/claudeSlice'
import type { ClaudeEvent } from '../../../../src/lib/claude-types'

function createTestStore(preloadedState = {}) {
  return configureStore({
    reducer: { claude: claudeReducer },
    preloadedState: { claude: { sessions: {}, ...preloadedState } },
  })
}

describe('claudeSlice', () => {
  describe('createClaudeSession', () => {
    it('creates a new session with empty events', () => {
      const store = createTestStore()
      store.dispatch(createClaudeSession({ sessionId: 'session-1', prompt: 'hello' }))

      const state = store.getState().claude
      expect(state.sessions['session-1']).toBeDefined()
      expect(state.sessions['session-1'].events).toEqual([])
      expect(state.sessions['session-1'].status).toBe('running')
      expect(state.sessions['session-1'].prompt).toBe('hello')
    })
  })

  describe('addClaudeEvent', () => {
    it('appends event to session', () => {
      const store = createTestStore()
      store.dispatch(createClaudeSession({ sessionId: 'session-1', prompt: 'test' }))

      const event: ClaudeEvent = {
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
        session_id: 'abc',
        uuid: '123',
      }
      store.dispatch(addClaudeEvent({ sessionId: 'session-1', event }))

      const state = store.getState().claude
      expect(state.sessions['session-1'].events).toHaveLength(1)
      expect(state.sessions['session-1'].events[0]).toEqual(event)
    })

    it('ignores events for unknown sessions', () => {
      const store = createTestStore()
      const event: ClaudeEvent = {
        type: 'assistant',
        message: { role: 'assistant', content: [] },
        session_id: 'x',
        uuid: 'y',
      }
      store.dispatch(addClaudeEvent({ sessionId: 'unknown', event }))

      const state = store.getState().claude
      expect(state.sessions['unknown']).toBeUndefined()
    })

    it('extracts claudeSessionId from init event', () => {
      const store = createTestStore()
      store.dispatch(createClaudeSession({ sessionId: 'session-1', prompt: 'test' }))

      const initEvent: ClaudeEvent = {
        type: 'system',
        subtype: 'init',
        session_id: 'claude-session-abc',
        cwd: '/test',
        model: 'claude-3',
        tools: [],
        claude_code_version: '1.0.0',
      }
      store.dispatch(addClaudeEvent({ sessionId: 'session-1', event: initEvent }))

      const state = store.getState().claude
      expect(state.sessions['session-1'].claudeSessionId).toBe('claude-session-abc')
    })
  })

  describe('setClaudeSessionStatus', () => {
    it('updates session status', () => {
      const store = createTestStore()
      store.dispatch(createClaudeSession({ sessionId: 'session-1', prompt: 'test' }))
      store.dispatch(setClaudeSessionStatus({ sessionId: 'session-1', status: 'completed' }))

      const state = store.getState().claude
      expect(state.sessions['session-1'].status).toBe('completed')
    })
  })

  describe('clearClaudeSession', () => {
    it('removes session from state', () => {
      const store = createTestStore()
      store.dispatch(createClaudeSession({ sessionId: 'session-1', prompt: 'test' }))
      store.dispatch(clearClaudeSession({ sessionId: 'session-1' }))

      const state = store.getState().claude
      expect(state.sessions['session-1']).toBeUndefined()
    })
  })
})
