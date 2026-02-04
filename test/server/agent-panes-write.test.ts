import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createAgentApiRouter } from '../../server/agent-api/router'

it('splits a pane horizontally', async () => {
  const app = express()
  app.use(express.json())
  app.use('/api', createAgentApiRouter({
    layoutStore: { splitPane: () => ({ newPaneId: 'pane_new', tabId: 'tab_1' }) },
    registry: { create: () => ({ terminalId: 'term_new' }) },
    wsHandler: { broadcastUiCommand: () => {} },
  }))

  const res = await request(app).post('/api/panes/pane_1/split').send({ direction: 'horizontal' })
  expect(res.body.status).toBe('ok')
  expect(res.body.data.paneId).toBe('pane_new')
})
