import { describe, it, expect, afterEach } from 'vitest'
import http from 'http'
import { checkProdRunning } from '../../../scripts/prebuild-guard.js'

describe('prebuild-guard', () => {
  describe('checkProdRunning', () => {
    let server: http.Server
    let port: number

    afterEach(async () => {
      if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()))
      }
    })

    it('returns running with version when freshell is on the port', async () => {
      server = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ app: 'freshell', ok: true, version: '0.5.0', ready: true }))
      })
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve())
      })
      port = (server.address() as { port: number }).port

      const result = await checkProdRunning(port)
      expect(result).toEqual({ status: 'running', version: '0.5.0' })
    })

    it('returns not-running when port is free', async () => {
      // Use a port that nothing is listening on
      const result = await checkProdRunning(0)
      expect(result).toEqual({ status: 'not-running' })
    })

    it('returns not-running when non-freshell app is on the port', async () => {
      server = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ app: 'something-else' }))
      })
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve())
      })
      port = (server.address() as { port: number }).port

      const result = await checkProdRunning(port)
      expect(result).toEqual({ status: 'not-running' })
    })

    it('returns not-running when health endpoint returns non-200', async () => {
      server = http.createServer((_req, res) => {
        res.writeHead(500)
        res.end()
      })
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve())
      })
      port = (server.address() as { port: number }).port

      const result = await checkProdRunning(port)
      expect(result).toEqual({ status: 'not-running' })
    })

    it('returns not-running on timeout', async () => {
      // Server that never responds
      server = http.createServer(() => {
        // intentionally hang
      })
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve())
      })
      port = (server.address() as { port: number }).port

      const result = await checkProdRunning(port)
      expect(result).toEqual({ status: 'not-running' })
    })
  })
})
