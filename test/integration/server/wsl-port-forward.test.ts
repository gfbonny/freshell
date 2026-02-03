// test/integration/server/wsl-port-forward.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// This test verifies the bootstrap integration without actually running elevated commands
describe('WSL port forwarding bootstrap integration', () => {
  it('wsl-port-forward module exports all required functions', async () => {
    // Dynamically import to verify the module structure
    const wslModule = await import('../../../server/wsl-port-forward.js')

    expect(typeof wslModule.setupWslPortForwarding).toBe('function')
    expect(typeof wslModule.getWslIp).toBe('function')
    expect(typeof wslModule.getRequiredPorts).toBe('function')
    expect(typeof wslModule.needsPortForwardingUpdate).toBe('function')
    expect(typeof wslModule.buildPortForwardingScript).toBe('function')
  })

  it('server/index.ts imports and calls setupWslPortForwarding after dotenv', async () => {
    // Verify the integration by checking that server/index.ts:
    // 1. Imports setupWslPortForwarding from wsl-port-forward
    // 2. Calls it AFTER dotenv/config is imported
    const indexPath = path.resolve(__dirname, '../../../server/index.ts')
    const indexContent = fs.readFileSync(indexPath, 'utf-8')

    // Check import exists
    expect(indexContent).toContain("import { setupWslPortForwarding } from './wsl-port-forward.js'")

    // Check call exists
    expect(indexContent).toContain('setupWslPortForwarding()')

    // Verify ordering: dotenv must come before the call
    // Find positions of key lines
    const dotenvImportPos = indexContent.indexOf("import 'dotenv/config'")
    const setupCallPos = indexContent.indexOf('setupWslPortForwarding()')

    expect(dotenvImportPos).toBeGreaterThan(-1)
    expect(setupCallPos).toBeGreaterThan(-1)
    expect(setupCallPos).toBeGreaterThan(dotenvImportPos)
  })

  it('bootstrap.ts does NOT call setupWslPortForwarding (moved to index.ts)', async () => {
    // Verify bootstrap no longer calls setupWslPortForwarding
    // This ensures .env values are loaded before port forwarding reads them
    const bootstrapPath = path.resolve(__dirname, '../../../server/bootstrap.ts')
    const bootstrapContent = fs.readFileSync(bootstrapPath, 'utf-8')

    // Should NOT import or call setupWslPortForwarding
    expect(bootstrapContent).not.toContain('setupWslPortForwarding')
  })
})
