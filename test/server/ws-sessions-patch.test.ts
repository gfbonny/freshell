import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import http from 'http'
import WebSocket from 'ws'

const TEST_TIMEOUT_MS = 30_000
vi.setConfig({ testTimeout: TEST_TIMEOUT_MS })

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const addr = server.address()
    if (typeof addr === 'object' && addr) resolve(addr.port)
  }))
}

function waitFor(ws: WebSocket, type: string, timeoutMs = 2000): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), timeoutMs)
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      if (msg.type === type) {
        clearTimeout(t)
        resolve(msg)
      }
    })
  })
}

class FakeRegistry { detach() {} }

describe('ws sessions.patch broadcast', () => {
  let server: http.Server
  let port: number
  let handler: any

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    process.env.AUTH_TOKEN = 'testtoken-testtoken'

    const { WsHandler } = await import('../../server/ws-handler.js')

    server = http.createServer()
    handler = new WsHandler(
      server,
      new FakeRegistry() as any,
      undefined,
      undefined,
      async () => ({
        projects: [{ projectPath: '/p1', sessions: [{ provider: 'claude', sessionId: 's1', projectPath: '/p1', updatedAt: 1 }] }],
      }),
    )
    port = await listen(server)
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('sends sessions.patch only to clients advertising capability and after snapshot', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
    await new Promise<void>((resolve) => ws.on('open', () => resolve()))

    ws.send(JSON.stringify({
      type: 'hello',
      token: 'testtoken-testtoken',
      capabilities: { sessionsPatchV1: true },
    }))

    await waitFor(ws, 'ready')
    await waitFor(ws, 'sessions.updated')

    const patchPromise = waitFor(ws, 'sessions.patch')
    handler.broadcastSessionsPatch({
      type: 'sessions.patch',
      upsertProjects: [{ projectPath: '/p2', sessions: [{ provider: 'claude', sessionId: 's2', projectPath: '/p2', updatedAt: 2 }] }],
      removeProjectPaths: ['/p1'],
    })

    const msg = await patchPromise
    expect(msg.removeProjectPaths).toEqual(['/p1'])
    ws.terminate()
  })
})

