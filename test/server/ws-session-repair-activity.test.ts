import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import WebSocket from 'ws'
import { EventEmitter } from 'events'

class FakeRegistry {
  list() {
    return []
  }
}

class FakeSessionRepairService extends EventEmitter {
  prioritizeSessions() {}
}

function listen(server: http.Server): Promise<{ port: number }> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (typeof addr === 'object' && addr) resolve({ port: addr.port })
    })
  })
}

describe('ws session repair activity', () => {
  let server: http.Server
  let port: number
  let sessionRepairService: FakeSessionRepairService

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    process.env.AUTH_TOKEN = 'testtoken-testtoken'

    const { WsHandler } = await import('../../server/ws-handler')
    server = http.createServer((_req, res) => {
      res.statusCode = 404
      res.end()
    })

    sessionRepairService = new FakeSessionRepairService()
    const registry = new FakeRegistry()

    new WsHandler(server, registry as any, undefined, sessionRepairService as any)
    const info = await listen(server)
    port = info.port
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('broadcasts session repair activity on scan events', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
    await new Promise<void>((resolve) => ws.on('open', () => resolve()))
    ws.send(JSON.stringify({ type: 'hello', token: 'testtoken-testtoken' }))

    await new Promise<void>((resolve) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'ready') resolve()
      })
    })

    const activityPromise = new Promise<any>((resolve) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'session.repair.activity') resolve(msg)
      })
    })

    sessionRepairService.emit('scanned', {
      sessionId: 'scan-1',
      filePath: '/tmp/scan-1.jsonl',
      status: 'corrupted',
      chainDepth: 1,
      orphanCount: 2,
      fileSize: 10,
      messageCount: 3,
    })

    const activity = await activityPromise

    expect(activity.event).toBe('scanned')
    expect(activity.sessionId).toBe('scan-1')
    expect(activity.status).toBe('corrupted')

    ws.close()
  })
})
