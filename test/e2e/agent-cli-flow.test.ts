import { describe, it, expect } from 'vitest'
import { spawn } from 'child_process'
import path from 'path'
import { createRequire } from 'module'
import express from 'express'
import http from 'http'
import { createAgentApiRouter } from '../../server/agent-api/router'

function startTestServer() {
  const app = express()
  app.use(express.json())
  app.use('/api', createAgentApiRouter({
    layoutStore: {
      listTabs: () => ([{ id: 'tab_1', title: 'Alpha', activePaneId: 'pane_1' }]),
    },
    registry: { create: () => ({ terminalId: 'term_1' }) },
  }))

  const server = http.createServer(app)
  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    server.listen(0, () => {
      const { port } = server.address() as { port: number }
      resolve({
        url: `http://localhost:${port}`,
        close: () => new Promise((done) => server.close(() => done())),
      })
    })
  })
}

describe('cli e2e flow', () => {
  it('runs list-tabs end-to-end', async () => {
    const { url, close } = await startTestServer()
    try {
      const require = createRequire(import.meta.url)
      const tsxRoot = path.dirname(require.resolve('tsx/package.json'))
      const tsxPath = path.join(tsxRoot, 'dist', 'cli.mjs')
      const cliPath = path.resolve(__dirname, '../../server/cli/index.ts')
      const proc = spawn(process.execPath, [tsxPath, cliPath, 'list-tabs', '--json'], {
        env: { ...process.env, FRESHELL_URL: url, FRESHELL_TOKEN: 'test-token' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      const output = await new Promise<string>((resolve, reject) => {
        let data = ''
        let err = ''
        proc.stdout.on('data', (chunk) => { data += chunk.toString() })
        proc.stderr.on('data', (chunk) => { err += chunk.toString() })
        proc.on('error', reject)
        proc.on('close', (code) => {
          if (code !== 0) return reject(new Error(`cli exited ${code}: ${err}`))
          resolve(data)
        })
      })

      expect(output).toContain('tabs')
    } finally {
      await close()
    }
  })
})
