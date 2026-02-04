import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createAgentApiRouter } from '../../server/agent-api/router'

class FakeRegistry {
  create() {
    return { terminalId: 'term_1' }
  }
}

const layoutStore = {
  createTab: () => ({ tabId: 'tab_1', paneId: 'pane_1' }),
  attachPaneContent: () => {},
  selectTab: () => ({}),
  renameTab: () => ({}),
  closeTab: () => ({}),
  hasTab: () => true,
  selectNextTab: () => ({ tabId: 'tab_1' }),
  selectPrevTab: () => ({ tabId: 'tab_1' }),
}

describe('tab endpoints', () => {
  it('creates a new tab and returns ids', async () => {
    const app = express()
    app.use(express.json())
    app.use('/api', createAgentApiRouter({ layoutStore, registry: new FakeRegistry(), wsHandler: { broadcastUiCommand: () => {} } }))
    const res = await request(app).post('/api/tabs').send({ name: 'alpha' })
    expect(res.body.status).toBe('ok')
    expect(res.body.data.tabId).toBe('tab_1')
  })
})
