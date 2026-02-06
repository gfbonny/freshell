import { describe, it, expect } from 'vitest'
import { handleUiCommand } from '../../../src/lib/ui-commands'

describe('handleUiCommand', () => {
  it('handles tab.create', () => {
    const actions: any[] = []
    const dispatch = (action: any) => {
      actions.push(action)
      return action
    }

    handleUiCommand({ type: 'ui.command', command: 'tab.create', payload: { id: 't1', title: 'Alpha' } }, dispatch)
    expect(actions[0].type).toBe('tabs/addTab')
  })

  it('initializes layout when tab.create includes pane content', () => {
    const actions: any[] = []
    const dispatch = (action: any) => {
      actions.push(action)
      return action
    }

    handleUiCommand({
      type: 'ui.command',
      command: 'tab.create',
      payload: { id: 't1', title: 'Alpha', paneId: 'pane-1', paneContent: { kind: 'browser', url: 'https://example.com', devToolsOpen: false } },
    }, dispatch)

    expect(actions.map((a) => a.type)).toEqual(['tabs/addTab', 'panes/initLayout'])
    expect(actions[1].payload.paneId).toBe('pane-1')
    expect(actions[1].payload.content.kind).toBe('browser')
  })

  it('passes through newPaneId on pane.split', () => {
    const actions: any[] = []
    const dispatch = (action: any) => {
      actions.push(action)
      return action
    }

    handleUiCommand({
      type: 'ui.command',
      command: 'pane.split',
      payload: { tabId: 't1', paneId: 'p1', direction: 'horizontal', newPaneId: 'p2', newContent: { kind: 'terminal', mode: 'shell' } },
    }, dispatch)

    expect(actions[0].type).toBe('panes/splitPane')
    expect(actions[0].payload.newPaneId).toBe('p2')
  })

  it('handles pane.resize and pane.swap', () => {
    const actions: any[] = []
    const dispatch = (action: any) => {
      actions.push(action)
      return action
    }

    handleUiCommand({
      type: 'ui.command',
      command: 'pane.resize',
      payload: { tabId: 't1', splitId: 's1', sizes: [30, 70] },
    }, dispatch)

    handleUiCommand({
      type: 'ui.command',
      command: 'pane.swap',
      payload: { tabId: 't1', paneId: 'p1', otherId: 'p2' },
    }, dispatch)

    expect(actions[0].type).toBe('panes/resizePanes')
    expect(actions[1].type).toBe('panes/swapPanes')
  })
})
