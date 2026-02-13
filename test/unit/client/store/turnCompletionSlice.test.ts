import { describe, it, expect } from 'vitest'
import reducer, {
  clearTabAttention,
  clearPaneAttention,
  consumeTurnCompleteEvents,
  markTabAttention,
  markPaneAttention,
  recordTurnComplete,
  type TurnCompletionState,
} from '@/store/turnCompletionSlice'
import { closePane, removeLayout } from '@/store/panesSlice'

describe('turnCompletionSlice', () => {
  it('records latest event with sequence id', () => {
    const state = reducer(
      undefined,
      recordTurnComplete({ tabId: 'tab-2', paneId: 'pane-9', terminalId: 'term-2', at: 123 })
    )

    expect(state.lastEvent?.seq).toBe(1)
    expect(state.lastEvent?.tabId).toBe('tab-2')
    expect(state.lastEvent?.paneId).toBe('pane-9')
    expect(state.lastEvent?.terminalId).toBe('term-2')
    expect(state.lastEvent?.at).toBe(123)
    expect(state.pendingEvents).toHaveLength(1)
    expect(state.pendingEvents[0]?.seq).toBe(1)
  })

  it('increments sequence across events', () => {
    let state = reducer(
      undefined,
      recordTurnComplete({ tabId: 'tab-1', paneId: 'pane-1', terminalId: 'term-1', at: 100 })
    )
    state = reducer(
      state,
      recordTurnComplete({ tabId: 'tab-2', paneId: 'pane-2', terminalId: 'term-2', at: 200 })
    )

    expect(state.lastEvent?.seq).toBe(2)
    expect(state.seq).toBe(2)
    expect(state.pendingEvents).toHaveLength(2)
    expect(state.pendingEvents[0]?.seq).toBe(1)
    expect(state.pendingEvents[1]?.seq).toBe(2)
  })

  it('consumes pending events up through the handled sequence', () => {
    let state = reducer(
      undefined,
      recordTurnComplete({ tabId: 'tab-1', paneId: 'pane-1', terminalId: 'term-1', at: 100 })
    )
    state = reducer(
      state,
      recordTurnComplete({ tabId: 'tab-2', paneId: 'pane-2', terminalId: 'term-2', at: 200 })
    )
    state = reducer(
      state,
      consumeTurnCompleteEvents({ throughSeq: 1 })
    )

    expect(state.pendingEvents).toHaveLength(1)
    expect(state.pendingEvents[0]?.seq).toBe(2)
  })

  it('marks and clears tab attention', () => {
    let state = reducer(undefined, markTabAttention({ tabId: 'tab-2' }))
    expect(state.attentionByTab['tab-2']).toBe(true)

    state = reducer(state, clearTabAttention({ tabId: 'tab-2' }))
    expect(state.attentionByTab['tab-2']).toBeUndefined()
  })

  it('markTabAttention is a no-op when already set (perf guard)', () => {
    const state = reducer(undefined, markTabAttention({ tabId: 'tab-1' }))
    const next = reducer(state, markTabAttention({ tabId: 'tab-1' }))
    // Immer returns the same reference when the draft is unmodified
    expect(next).toBe(state)
  })

  it('clearTabAttention is a no-op when not set (perf guard)', () => {
    const state = reducer(undefined, clearTabAttention({ tabId: 'tab-1' }))
    const initial: TurnCompletionState = {
      seq: 0,
      lastEvent: null,
      pendingEvents: [],
      attentionByTab: {},
      attentionByPane: {},
    }
    // Should return exact same state reference — no draft modification
    expect(state).toEqual(initial)
    // Also verify repeated clears don't mutate
    const next = reducer(state, clearTabAttention({ tabId: 'tab-1' }))
    expect(next).toBe(state)
  })

  it('marks and clears pane attention', () => {
    let state = reducer(undefined, markPaneAttention({ paneId: 'pane-5' }))
    expect(state.attentionByPane['pane-5']).toBe(true)

    state = reducer(state, clearPaneAttention({ paneId: 'pane-5' }))
    expect(state.attentionByPane['pane-5']).toBeUndefined()
  })

  it('markPaneAttention is a no-op when already set (perf guard)', () => {
    const state = reducer(undefined, markPaneAttention({ paneId: 'pane-1' }))
    const next = reducer(state, markPaneAttention({ paneId: 'pane-1' }))
    // Immer returns the same reference when the draft is unmodified
    expect(next).toBe(state)
  })

  it('clearPaneAttention is a no-op when not set (perf guard)', () => {
    const state = reducer(undefined, clearPaneAttention({ paneId: 'pane-1' }))
    // Should return exact same state reference — no draft modification
    const next = reducer(state, clearPaneAttention({ paneId: 'pane-1' }))
    expect(next).toBe(state)
  })

  describe('extraReducers — pane/tab close cleanup', () => {
    function stateWithAttention(overrides?: Partial<TurnCompletionState>): TurnCompletionState {
      return {
        seq: 0,
        lastEvent: null,
        pendingEvents: [],
        attentionByTab: { 'tab-1': true },
        attentionByPane: { 'pane-1': true },
        ...overrides,
      }
    }

    it('closePane clears both pane and tab attention', () => {
      const state = stateWithAttention()
      const next = reducer(state, closePane({ tabId: 'tab-1', paneId: 'pane-1' }))
      expect(next.attentionByTab['tab-1']).toBeUndefined()
      expect(next.attentionByPane['pane-1']).toBeUndefined()
    })

    it('closePane on a pane without attention is a no-op', () => {
      const state = stateWithAttention()
      const next = reducer(state, closePane({ tabId: 'tab-2', paneId: 'pane-99' }))
      // Existing attention for tab-1/pane-1 is untouched
      expect(next.attentionByTab['tab-1']).toBe(true)
      expect(next.attentionByPane['pane-1']).toBe(true)
    })

    it('removeLayout clears tab attention', () => {
      const state = stateWithAttention()
      const next = reducer(state, removeLayout({ tabId: 'tab-1' }))
      expect(next.attentionByTab['tab-1']).toBeUndefined()
      // Pane entries are orphaned but not cleared (no tab→pane mapping in this slice)
    })

    it('removeLayout on a tab without attention is a no-op', () => {
      const state = stateWithAttention()
      const next = reducer(state, removeLayout({ tabId: 'tab-99' }))
      expect(next.attentionByTab['tab-1']).toBe(true)
    })
  })
})
