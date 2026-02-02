// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { loadEnv } from 'vite'

describe('vite config', () => {
  it('uses ipv4 loopback for backend proxy by default', async () => {
    const originalBackendHost = process.env.VITE_BACKEND_HOST
    const originalAltHost = process.env.BACKEND_HOST
    const originalPort = process.env.PORT

    try {
      delete process.env.VITE_BACKEND_HOST
      delete process.env.BACKEND_HOST
      delete process.env.PORT

      const env = loadEnv('development', process.cwd(), '')
      const expectedHost = env.VITE_BACKEND_HOST || env.BACKEND_HOST || '127.0.0.1'
      const expectedPort = env.PORT || '3001'
      const expectedUrl = `http://${expectedHost}:${expectedPort}`

      const configModule = await import('../../vite.config.ts')
      const configFn = configModule.default
      const config = configFn({ mode: 'development', command: 'serve' })
      const proxy = config.server?.proxy as Record<string, string | { target?: string }>
      const apiProxy = proxy['/api']
      const wsProxy = proxy['/ws']
      const apiTarget = typeof apiProxy === 'string' ? apiProxy : apiProxy?.target
      const wsTarget = typeof wsProxy === 'string' ? wsProxy : wsProxy?.target

      expect(apiTarget).toBe(expectedUrl)
      expect(wsTarget).toBe(expectedUrl)
    } finally {
      if (originalBackendHost !== undefined) {
        process.env.VITE_BACKEND_HOST = originalBackendHost
      } else {
        delete process.env.VITE_BACKEND_HOST
      }
      if (originalAltHost !== undefined) {
        process.env.BACKEND_HOST = originalAltHost
      } else {
        delete process.env.BACKEND_HOST
      }
      if (originalPort !== undefined) {
        process.env.PORT = originalPort
      } else {
        delete process.env.PORT
      }
    }
  })
})
