import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import WebSocket from 'ws'

type Snapshot = {
  settings: any
  projects: any[]
}

function listen(server: http.Server): Promise<{ port: number }> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (typeof addr === 'object' && addr) resolve({ port: addr.port })
    })
  })
}

class FakeRegistry {
  detach() {
    return true
  }
}

function waitForMessage(ws: WebSocket, predicate: (msg: any) => boolean, timeoutMs = 2000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off('message', handler)
      reject(new Error('Timeout waiting for message'))
    }, timeoutMs)

    const handler = (data: WebSocket.Data) => {
      const msg = JSON.parse(data.toString())
      if (predicate(msg)) {
        clearTimeout(timeout)
        ws.off('message', handler)
        resolve(msg)
      }
    }
    ws.on('message', handler)
  })
}

describe('ws handshake snapshot', () => {
  let server: http.Server
  let port: number
  let snapshot: Snapshot

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    process.env.AUTH_TOKEN = 'testtoken-testtoken'
    process.env.HELLO_TIMEOUT_MS = '100'

    const { WsHandler } = await import('../../server/ws-handler')

    snapshot = {
      settings: {
        theme: 'dark',
        uiScale: 1,
        terminal: {
          fontSize: 14,
          fontFamily: 'Consolas',
          lineHeight: 1,
          cursorBlink: true,
          scrollback: 5000,
          theme: 'auto',
        },
        safety: {
          autoKillIdleMinutes: 180,
          warnBeforeKillMinutes: 5,
        },
        panes: {
          defaultNewPane: 'ask',
        },
        sidebar: {
          sortMode: 'activity',
          showProjectBadges: true,
          width: 288,
          collapsed: false,
        },
        codingCli: {
          enabledProviders: ['claude'],
          providers: {},
        },
      },
      projects: [
        {
          projectPath: '/tmp/demo',
          sessions: [
            {
              provider: 'claude',
              sessionId: 'sess-1',
              projectPath: '/tmp/demo',
              updatedAt: Date.now(),
            },
          ],
        },
      ],
    }

    server = http.createServer((_req, res) => {
      res.statusCode = 404
      res.end()
    })

    new (WsHandler as any)(
      server,
      new FakeRegistry() as any,
      undefined,
      undefined,
      async () => snapshot
    )

    const info = await listen(server)
    port = info.port
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('sends settings and sessions snapshot after ready', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
    const closeWs = async () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.terminate()
      }
      await new Promise<void>((resolve) => ws.on('close', () => resolve()))
    }

    try {
      await new Promise<void>((resolve) => ws.on('open', () => resolve()))

      const readyPromise = waitForMessage(ws, (m) => m.type === 'ready')
      const settingsPromise = waitForMessage(ws, (m) => m.type === 'settings.updated')
      const sessionsPromise = waitForMessage(ws, (m) => m.type === 'sessions.updated')

      ws.send(JSON.stringify({ type: 'hello', token: 'testtoken-testtoken' }))

      await readyPromise

      const settingsMsg = await settingsPromise
      const sessionsMsg = await sessionsPromise

      expect(settingsMsg.settings).toEqual(snapshot.settings)
      expect(sessionsMsg.projects).toEqual(snapshot.projects)
    } finally {
      await closeWs()
    }
  })
})
