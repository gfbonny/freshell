# Remote Access Setup Experience — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a browser-based setup wizard that guides users through enabling remote access, with secure-by-default localhost binding, mDNS discovery, cross-platform firewall configuration, and QR code sharing.

**Architecture:** A `NetworkManager` server module owns all network state (bind host, mDNS, firewall status). It performs hot rebinding (close + re-listen) without process restart. The UI has three entry points (first-run wizard, Settings section, Share button) all consuming `GET /api/network/status`. Firewall commands run in Freshell's own terminal panes for elevation.

**Tech Stack:** `bonjour-service` (mDNS), `lean-qr` (QR codes, client+server), `internal-ip` (LAN IP detection), `is-port-reachable` (port diagnostics). Server is Node/Express/ESM. Client is React/Redux/Tailwind/shadcn.

**Design doc:** `docs/plans/2026-02-13-remote-access-setup-design.md`

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install the four new packages**

Run:
```bash
npm install bonjour-service lean-qr internal-ip is-port-reachable
```

**Step 2: Verify installation**

Run: `npm ls bonjour-service lean-qr internal-ip is-port-reachable`

Expected: All four packages listed without errors.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add dependencies for remote access setup

bonjour-service (mDNS advertising), lean-qr (QR codes),
internal-ip (LAN IP detection), is-port-reachable (port diagnostics)"
```

---

## Task 2: Extend Config Schema with Network Settings

**Files:**
- Modify: `server/config-store.ts` (lines 27-81 for AppSettings type, lines 113-139 for DEFAULT_SETTINGS)
- Test: `test/unit/server/config-store.test.ts`

The `AppSettings` type needs a new `network` property. The `DEFAULT_SETTINGS` needs defaults.

**Step 1: Write the failing test**

Add to `test/unit/server/config-store.test.ts`:

```typescript
describe('network settings', () => {
  it('should include network defaults with host 127.0.0.1 and configured false', async () => {
    const store = new ConfigStore(tmpPath)
    const settings = await store.getSettings()
    expect(settings.network).toEqual({
      host: '127.0.0.1',
      configured: false,
      mdns: {
        enabled: false,
        hostname: 'freshell',
      },
    })
  })

  it('should persist network settings through patch', async () => {
    const store = new ConfigStore(tmpPath)
    await store.patchSettings({
      network: {
        host: '0.0.0.0',
        configured: true,
        mdns: { enabled: true, hostname: 'mybox' },
      },
    })
    const settings = await store.getSettings()
    expect(settings.network).toEqual({
      host: '0.0.0.0',
      configured: true,
      mdns: { enabled: true, hostname: 'mybox' },
    })
  })

  it('should deep-merge network settings', async () => {
    const store = new ConfigStore(tmpPath)
    await store.patchSettings({
      network: { host: '0.0.0.0', configured: true, mdns: { enabled: true, hostname: 'freshell' } },
    })
    await store.patchSettings({
      network: { host: '0.0.0.0', configured: true, mdns: { enabled: true, hostname: 'custom' } },
    })
    const settings = await store.getSettings()
    expect(settings.network.mdns.hostname).toBe('custom')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/server/config-store.test.ts -t "network settings"`

Expected: FAIL — `settings.network` is undefined.

**Step 3: Add network types and defaults to config-store.ts**

In `server/config-store.ts`, add the network types to `AppSettings` (after the existing properties around line 81):

```typescript
export interface NetworkSettings {
  host: '127.0.0.1' | '0.0.0.0'
  configured: boolean
  mdns: {
    enabled: boolean
    hostname: string
  }
}
```

Add `network: NetworkSettings` to the `AppSettings` interface.

Add defaults to `DEFAULT_SETTINGS` (around line 139):

```typescript
network: {
  host: '127.0.0.1',
  configured: false,
  mdns: {
    enabled: false,
    hostname: 'freshell',
  },
},
```

Add `network` to the `mergeSettings` function in `src/store/settingsSlice.ts` (around line 79) to ensure deep merge works — the same pattern used for `terminal`, `logging`, `safety`, etc.:

```typescript
if (patch.network) {
  merged.network = {
    ...merged.network,
    ...patch.network,
    mdns: { ...merged.network.mdns, ...patch.network?.mdns },
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/server/config-store.test.ts -t "network settings"`

Expected: PASS

**Step 5: Run full test suite to check for regressions**

Run: `npm test`

Expected: All tests pass.

**Step 6: Commit**

```bash
git add server/config-store.ts src/store/settingsSlice.ts test/unit/server/config-store.test.ts
git commit -m "feat(config): add network settings schema

Adds NetworkSettings type with host, configured, and mdns properties.
Defaults to 127.0.0.1 (localhost-only) with mDNS disabled.
Deep merge support in settingsSlice for network.mdns."
```

---

## Task 3: Firewall Detection Module

**Files:**
- Create: `server/firewall.ts`
- Test: `test/unit/server/firewall.test.ts`

This module detects the active firewall and generates platform-specific commands. All shell commands are mocked in tests.

**Step 1: Write the failing tests**

Create `test/unit/server/firewall.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectFirewall, firewallCommands } from '../../server/firewall.js'
import * as cp from 'node:child_process'

vi.mock('node:child_process')

describe('firewall', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('detectFirewall', () => {
    it('detects ufw active on Linux', async () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
      vi.mocked(cp.execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('ufw status'))
          return Buffer.from('Status: active\n')
        throw new Error('unexpected')
      })
      const result = await detectFirewall()
      expect(result.platform).toBe('linux-ufw')
      expect(result.active).toBe(true)
    })

    it('detects ufw inactive on Linux', async () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
      vi.mocked(cp.execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('ufw status'))
          return Buffer.from('Status: inactive\n')
        throw new Error('unexpected')
      })
      const result = await detectFirewall()
      expect(result.platform).toBe('linux-ufw')
      expect(result.active).toBe(false)
    })

    it('detects firewalld on Linux when ufw not found', async () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
      let callCount = 0
      vi.mocked(cp.execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('ufw')) throw new Error('not found')
        if (cmd.includes('firewall-cmd --state'))
          return Buffer.from('running\n')
        throw new Error('unexpected')
      })
      const result = await detectFirewall()
      expect(result.platform).toBe('linux-firewalld')
      expect(result.active).toBe(true)
    })

    it('detects no firewall on Linux when neither ufw nor firewalld', async () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
      vi.mocked(cp.execSync).mockImplementation(() => {
        throw new Error('not found')
      })
      const result = await detectFirewall()
      expect(result.platform).toBe('linux-none')
      expect(result.active).toBe(false)
    })

    it('detects macOS firewall enabled', async () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
      vi.mocked(cp.execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('com.apple.alf'))
          return Buffer.from('1\n')
        throw new Error('unexpected')
      })
      const result = await detectFirewall()
      expect(result.platform).toBe('macos')
      expect(result.active).toBe(true)
    })

    it('detects macOS firewall disabled', async () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
      vi.mocked(cp.execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('com.apple.alf'))
          return Buffer.from('0\n')
        throw new Error('unexpected')
      })
      const result = await detectFirewall()
      expect(result.platform).toBe('macos')
      expect(result.active).toBe(false)
    })
  })

  describe('firewallCommands', () => {
    it('generates ufw commands for given ports', () => {
      const cmds = firewallCommands('linux-ufw', [3001])
      expect(cmds).toEqual(['sudo ufw allow 3001/tcp'])
    })

    it('generates ufw commands for multiple ports', () => {
      const cmds = firewallCommands('linux-ufw', [3001, 5173])
      expect(cmds).toEqual([
        'sudo ufw allow 3001/tcp',
        'sudo ufw allow 5173/tcp',
      ])
    })

    it('generates firewalld commands', () => {
      const cmds = firewallCommands('linux-firewalld', [3001])
      expect(cmds).toEqual([
        'sudo firewall-cmd --add-port=3001/tcp --permanent && sudo firewall-cmd --reload',
      ])
    })

    it('generates firewalld commands for multiple ports', () => {
      const cmds = firewallCommands('linux-firewalld', [3001, 5173])
      expect(cmds).toEqual([
        'sudo firewall-cmd --add-port=3001/tcp --add-port=5173/tcp --permanent && sudo firewall-cmd --reload',
      ])
    })

    it('generates macOS commands', () => {
      const cmds = firewallCommands('macos', [3001])
      expect(cmds.length).toBe(1)
      expect(cmds[0]).toContain('socketfilterfw')
    })

    it('returns empty for no-firewall platforms', () => {
      const cmds = firewallCommands('linux-none', [3001])
      expect(cmds).toEqual([])
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/server/firewall.test.ts`

Expected: FAIL — module not found.

**Step 3: Implement the firewall module**

Create `server/firewall.ts`:

```typescript
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

export type FirewallPlatform =
  | 'linux-ufw'
  | 'linux-firewalld'
  | 'linux-none'
  | 'macos'
  | 'windows'
  | 'wsl2'

export interface FirewallInfo {
  platform: FirewallPlatform
  active: boolean
}

function isWSL2(): boolean {
  try {
    const version = readFileSync('/proc/version', 'utf-8')
    return /microsoft/i.test(version)
  } catch {
    return false
  }
}

function detectLinuxFirewall(): FirewallInfo {
  // Try ufw first (Ubuntu, Debian, Mint, Pop!_OS)
  try {
    const output = execSync('ufw status', { encoding: 'utf-8', timeout: 5000 })
    return {
      platform: 'linux-ufw',
      active: output.includes('Status: active'),
    }
  } catch { /* ufw not installed or not accessible */ }

  // Try firewalld (Fedora, RHEL, CentOS)
  try {
    const output = execSync('firewall-cmd --state', { encoding: 'utf-8', timeout: 5000 })
    return {
      platform: 'linux-firewalld',
      active: output.trim() === 'running',
    }
  } catch { /* firewalld not installed */ }

  return { platform: 'linux-none', active: false }
}

function detectMacFirewall(): FirewallInfo {
  try {
    const output = execSync(
      'defaults read /Library/Preferences/com.apple.alf globalstate',
      { encoding: 'utf-8', timeout: 5000 },
    )
    return {
      platform: 'macos',
      active: parseInt(output.trim(), 10) > 0,
    }
  } catch {
    return { platform: 'macos', active: false }
  }
}

function detectWindowsFirewall(): FirewallInfo {
  try {
    const output = execSync(
      'netsh advfirewall show currentprofile state',
      { encoding: 'utf-8', timeout: 5000 },
    )
    return {
      platform: isWSL2() ? 'wsl2' : 'windows',
      active: output.includes('ON'),
    }
  } catch {
    return { platform: isWSL2() ? 'wsl2' : 'windows', active: false }
  }
}

export async function detectFirewall(): Promise<FirewallInfo> {
  const platform = process.platform

  if (platform === 'linux') {
    if (isWSL2()) {
      return detectWindowsFirewall()
    }
    return detectLinuxFirewall()
  }

  if (platform === 'darwin') {
    return detectMacFirewall()
  }

  if (platform === 'win32') {
    return detectWindowsFirewall()
  }

  return { platform: 'linux-none', active: false }
}

export function firewallCommands(platform: FirewallPlatform, ports: number[]): string[] {
  switch (platform) {
    case 'linux-ufw':
      return ports.map((p) => `sudo ufw allow ${p}/tcp`)

    case 'linux-firewalld': {
      const portArgs = ports.map((p) => `--add-port=${p}/tcp`).join(' ')
      return [`sudo firewall-cmd ${portArgs} --permanent && sudo firewall-cmd --reload`]
    }

    case 'macos':
      return [
        `sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add $(which node) && sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp $(which node)`,
      ]

    case 'windows':
    case 'wsl2':
      // WSL2/Windows firewall is handled by the existing wsl-port-forward.ts module
      return []

    case 'linux-none':
      return []
  }
}
```

**Note on WSL2:** The existing `wsl-port-forward.ts` already handles Windows firewall rules and port proxy setup with UAC elevation. The `firewallCommands` function returns empty for `wsl2`/`windows` because the NetworkManager will call `setupWslPortForwarding()` directly instead.

**Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/server/firewall.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add server/firewall.ts test/unit/server/firewall.test.ts
git commit -m "feat: add cross-platform firewall detection module

Detects active firewall (ufw, firewalld, macOS ALF, Windows/WSL2)
and generates platform-specific commands to open ports.
WSL2 defers to existing wsl-port-forward.ts for UAC elevation."
```

---

## Task 4: NetworkManager Server Module

**Files:**
- Create: `server/network-manager.ts`
- Test: `test/unit/server/network-manager.test.ts`

This is the core module. It manages bind state, mDNS, firewall status, and hot rebinding. It takes a reference to the `http.Server` and the `ConfigStore`.

**Step 1: Write the failing tests**

Create `test/unit/server/network-manager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import { NetworkManager } from '../../server/network-manager.js'

// Mock external dependencies
vi.mock('internal-ip', () => ({
  internalIpV4: vi.fn().mockResolvedValue('192.168.1.100'),
}))
vi.mock('is-port-reachable', () => ({
  default: vi.fn().mockResolvedValue(true),
}))
vi.mock('bonjour-service', () => {
  const unpublishAll = vi.fn()
  const publish = vi.fn().mockReturnValue({ name: 'freshell' })
  const destroy = vi.fn()
  return {
    default: vi.fn().mockImplementation(() => ({ publish, unpublishAll, destroy })),
    Bonjour: vi.fn().mockImplementation(() => ({ publish, unpublishAll, destroy })),
  }
})
vi.mock('../../server/firewall.js', () => ({
  detectFirewall: vi.fn().mockResolvedValue({ platform: 'linux-none', active: false }),
  firewallCommands: vi.fn().mockReturnValue([]),
}))

describe('NetworkManager', () => {
  let server: http.Server
  let mockConfigStore: any
  let manager: NetworkManager

  beforeEach(() => {
    server = http.createServer()
    mockConfigStore = {
      getSettings: vi.fn().mockResolvedValue({
        network: {
          host: '127.0.0.1',
          configured: false,
          mdns: { enabled: false, hostname: 'freshell' },
        },
      }),
      patchSettings: vi.fn().mockResolvedValue(undefined),
    }
  })

  afterEach(async () => {
    if (manager) await manager.stop()
    server.close()
  })

  it('starts with localhost binding by default', async () => {
    manager = new NetworkManager(server, mockConfigStore, 3001)
    const status = await manager.getStatus()
    expect(status.host).toBe('127.0.0.1')
    expect(status.configured).toBe(false)
  })

  it('reports LAN IPs from internal-ip', async () => {
    manager = new NetworkManager(server, mockConfigStore, 3001)
    const status = await manager.getStatus()
    expect(status.lanIps).toContain('192.168.1.100')
  })

  it('hot rebinds from localhost to 0.0.0.0', async () => {
    manager = new NetworkManager(server, mockConfigStore, 3001)
    // Start listening on localhost
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const originalPort = (server.address() as any).port

    await manager.configure({
      host: '0.0.0.0',
      configured: true,
      mdns: { enabled: false, hostname: 'freshell' },
    })

    expect(mockConfigStore.patchSettings).toHaveBeenCalledWith({
      network: {
        host: '0.0.0.0',
        configured: true,
        mdns: { enabled: false, hostname: 'freshell' },
      },
    })
  })

  it('starts mDNS when enabled', async () => {
    const Bonjour = (await import('bonjour-service')).default
    manager = new NetworkManager(server, mockConfigStore, 3001)
    await manager.configure({
      host: '0.0.0.0',
      configured: true,
      mdns: { enabled: true, hostname: 'mybox' },
    })
    expect(Bonjour).toHaveBeenCalled()
  })

  it('builds correct accessUrl with token and port', async () => {
    process.env.AUTH_TOKEN = 'test-token-1234567890'
    manager = new NetworkManager(server, mockConfigStore, 3001)
    mockConfigStore.getSettings.mockResolvedValue({
      network: {
        host: '0.0.0.0',
        configured: true,
        mdns: { enabled: false, hostname: 'freshell' },
      },
    })
    const status = await manager.getStatus()
    expect(status.accessUrl).toContain('192.168.1.100')
    expect(status.accessUrl).toContain('3001')
    expect(status.accessUrl).toContain('token=')
  })

  it('includes devMode ports', async () => {
    manager = new NetworkManager(server, mockConfigStore, 3001, true, 5173)
    const status = await manager.getStatus()
    expect(status.devMode).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/server/network-manager.test.ts`

Expected: FAIL — module not found.

**Step 3: Implement NetworkManager**

Create `server/network-manager.ts`:

```typescript
import http from 'node:http'
import { internalIpV4 } from 'internal-ip'
import isPortReachable from 'is-port-reachable'
import { Bonjour } from 'bonjour-service'
import { detectFirewall, firewallCommands, type FirewallInfo, type FirewallPlatform } from './firewall.js'
import type { ConfigStore, NetworkSettings } from './config-store.js'
import { logger } from './logger.js'

const log = logger.child({ component: 'network-manager' })

export interface NetworkStatus {
  configured: boolean
  host: '127.0.0.1' | '0.0.0.0'
  port: number
  lanIps: string[]
  mdns: { enabled: boolean; hostname: string } | null
  firewall: {
    platform: FirewallPlatform
    active: boolean
    portOpen: boolean | null
    commands: string[]
  }
  devMode: boolean
  devPort?: number
  accessUrl: string
}

export class NetworkManager {
  private bonjour: InstanceType<typeof Bonjour> | null = null
  private firewallInfo: FirewallInfo | null = null
  private lanIp: string | null = null

  constructor(
    private server: http.Server,
    private configStore: ConfigStore,
    private port: number,
    private devMode: boolean = false,
    private devPort?: number,
  ) {}

  async getStatus(): Promise<NetworkStatus> {
    const settings = await this.configStore.getSettings()
    const network = settings.network

    // Detect LAN IP (cached after first call)
    if (!this.lanIp) {
      try {
        this.lanIp = await internalIpV4() ?? null
      } catch {
        this.lanIp = null
      }
    }

    // Detect firewall (cached after first call)
    if (!this.firewallInfo) {
      this.firewallInfo = await detectFirewall()
    }

    const ports = this.getRelevantPorts()
    const commands = this.firewallInfo.active
      ? firewallCommands(this.firewallInfo.platform, ports)
      : []

    // Check port reachability if we have a LAN IP and are bound to 0.0.0.0
    let portOpen: boolean | null = null
    if (network.host === '0.0.0.0' && this.lanIp) {
      try {
        portOpen = await isPortReachable(this.port, { host: this.lanIp, timeout: 2000 })
      } catch {
        portOpen = null
      }
    }

    const token = process.env.AUTH_TOKEN ?? ''
    const accessHost = this.lanIp ?? 'localhost'
    const accessPort = this.devMode && this.devPort ? this.devPort : this.port
    const accessUrl = `http://${accessHost}:${accessPort}/?token=${token}`

    return {
      configured: network.configured,
      host: network.host,
      port: this.port,
      lanIps: this.lanIp ? [this.lanIp] : [],
      mdns: network.mdns,
      firewall: {
        platform: this.firewallInfo.platform,
        active: this.firewallInfo.active,
        portOpen,
        commands,
      },
      devMode: this.devMode,
      devPort: this.devPort,
      accessUrl,
    }
  }

  async configure(network: NetworkSettings): Promise<void> {
    const currentSettings = await this.configStore.getSettings()
    const currentNetwork = currentSettings.network
    const hostChanged = currentNetwork.host !== network.host

    // Persist config
    await this.configStore.patchSettings({ network })

    // Hot rebind if host changed and server is listening
    if (hostChanged && this.server.listening) {
      await this.rebind(network.host)
    }

    // Start/stop mDNS
    if (network.mdns.enabled && network.host === '0.0.0.0') {
      this.startMdns(network.mdns.hostname)
    } else {
      this.stopMdns()
    }

    // Reset cached firewall info so next getStatus() re-detects
    this.firewallInfo = null
  }

  async rebind(host: string): Promise<void> {
    log.info({ host, port: this.port }, 'Hot rebinding server')

    await new Promise<void>((resolve, reject) => {
      this.server.close((err) => {
        if (err) {
          log.error({ err }, 'Failed to close server for rebind')
          reject(err)
          return
        }
        this.server.listen(this.port, host, () => {
          log.info({ host, port: this.port }, 'Server rebound successfully')
          resolve()
        })
      })
    })
  }

  private startMdns(hostname: string): void {
    this.stopMdns()
    try {
      this.bonjour = new Bonjour()
      const port = this.devMode && this.devPort ? this.devPort : this.port
      this.bonjour.publish({ name: hostname, type: 'http', port })
      log.info({ hostname, port }, 'mDNS service published')
    } catch (err) {
      log.warn({ err }, 'Failed to start mDNS')
    }
  }

  private stopMdns(): void {
    if (this.bonjour) {
      this.bonjour.unpublishAll()
      this.bonjour.destroy()
      this.bonjour = null
    }
  }

  private getRelevantPorts(): number[] {
    const ports = [this.port]
    if (this.devMode && this.devPort && this.devPort !== this.port) {
      ports.push(this.devPort)
    }
    return ports
  }

  async stop(): Promise<void> {
    this.stopMdns()
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/server/network-manager.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add server/network-manager.ts test/unit/server/network-manager.test.ts
git commit -m "feat: add NetworkManager for hot rebind, mDNS, and firewall status

Manages server bind state, mDNS publishing via bonjour-service,
firewall detection, and LAN IP discovery via internal-ip.
Supports hot rebinding (close + re-listen) without process restart."
```

---

## Task 5: Integrate NetworkManager into Server Startup

**Files:**
- Modify: `server/index.ts` (lines 65-75 for WSL setup, line 162 for server creation, lines 786-809 for listen)
- Modify: `server/auth.ts` (line 87 for /local-file)
- Test: `test/server/api.test.ts` (add network endpoint tests)

**Step 1: Write failing tests for the new API endpoints**

Add to `test/server/api.test.ts` (or create a new `test/server/network-api.test.ts`):

```typescript
describe('GET /api/network/status', () => {
  it('returns network status with expected shape', async () => {
    const res = await request(app)
      .get('/api/network/status')
      .set('x-auth-token', token)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('configured')
    expect(res.body).toHaveProperty('host')
    expect(res.body).toHaveProperty('port')
    expect(res.body).toHaveProperty('lanIps')
    expect(res.body).toHaveProperty('firewall')
    expect(res.body).toHaveProperty('devMode')
    expect(res.body).toHaveProperty('accessUrl')
  })
})

describe('POST /api/network/configure', () => {
  it('accepts valid network configuration', async () => {
    const res = await request(app)
      .post('/api/network/configure')
      .set('x-auth-token', token)
      .send({
        host: '0.0.0.0',
        configured: true,
        mdns: { enabled: false, hostname: 'freshell' },
      })
    expect(res.status).toBe(200)
  })

  it('rejects invalid host values', async () => {
    const res = await request(app)
      .post('/api/network/configure')
      .set('x-auth-token', token)
      .send({
        host: '10.0.0.1',
        configured: true,
        mdns: { enabled: false, hostname: 'freshell' },
      })
    expect(res.status).toBe(400)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/server/api.test.ts -t "network"`

Expected: FAIL — routes not found (404).

**Step 3: Wire NetworkManager into server/index.ts**

In `server/index.ts`:

1. **Import NetworkManager** (near top):
```typescript
import { NetworkManager } from './network-manager.js'
```

2. **Create NetworkManager instance** (after `server` creation, around line 162):
```typescript
const isDev = process.env.NODE_ENV !== 'production'
const vitePort = isDev ? Number(process.env.VITE_PORT || 5173) : undefined
const networkManager = new NetworkManager(server, configStore, port, isDev, vitePort)
```

Note: move `const port = Number(process.env.PORT || 3001)` to before the `main()` function body or early in `main()` so it's available for NetworkManager instantiation.

3. **Add API endpoints** (after existing `/api` routes):
```typescript
app.get('/api/network/status', async (_req, res) => {
  try {
    const status = await networkManager.getStatus()
    res.json(status)
  } catch (err) {
    log.error({ err }, 'Failed to get network status')
    res.status(500).json({ error: 'Failed to get network status' })
  }
})

app.post('/api/network/configure', async (req, res) => {
  const { host, configured, mdns } = req.body
  if (host !== '127.0.0.1' && host !== '0.0.0.0') {
    return res.status(400).json({ error: 'host must be 127.0.0.1 or 0.0.0.0' })
  }
  try {
    await networkManager.configure({ host, configured, mdns })
    const status = await networkManager.getStatus()
    res.json(status)
  } catch (err) {
    log.error({ err }, 'Failed to configure network')
    res.status(500).json({ error: 'Failed to configure network' })
  }
})
```

4. **Change server.listen** to use config (replace line 787):
```typescript
const settings = await configStore.getSettings()
const bindHost = settings.network.host
server.listen(port, bindHost, () => {
```

5. **Start mDNS on startup if configured** (inside the listen callback, after startup message):
```typescript
if (settings.network.mdns.enabled && bindHost === '0.0.0.0') {
  // NetworkManager will start mDNS
  await networkManager.configure(settings.network)
}
```

6. **Make WSL port forwarding on-demand** — remove the automatic call at line 70-75. It will be triggered by NetworkManager when configuring remote access on WSL2.

7. **Add auth to /local-file** — in `server/index.ts` line 87, change:
```typescript
app.get('/local-file', (req, res) => {
```
to:
```typescript
app.get('/local-file', httpAuthMiddleware, (req, res) => {
```
This requires importing `httpAuthMiddleware` if not already imported at this scope. Check where the middleware is applied (line 134) — the `/local-file` route is registered at line 87, before the auth middleware at line 134, so it bypasses auth. Either move it after line 134 or add the middleware directly to the route.

8. **Add networkManager to shutdown** (in the shutdown handler):
```typescript
// After closing WebSocket connections
await networkManager.stop()
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/server/api.test.ts -t "network"`

Expected: PASS

**Step 5: Run full test suite**

Run: `npm test`

Expected: All tests pass. Pay attention to any tests that depend on the server binding to `0.0.0.0` — they may need updating.

**Step 6: Commit**

```bash
git add server/index.ts server/auth.ts test/server/api.test.ts
git commit -m "feat: integrate NetworkManager into server startup

Server now binds to host from config (default 127.0.0.1).
Adds /api/network/status and /api/network/configure endpoints.
WSL port forwarding is now on-demand instead of automatic.
Adds auth middleware to /local-file endpoint (fixes security hole)."
```

---

## Task 6: Update Vite Config to Read Network Settings

**Files:**
- Modify: `vite.config.ts` (line 46, `host: true`)
- Modify: `test/unit/vite-config.test.ts` (if exists)

**Step 1: Write failing test**

Check if `test/unit/vite-config.test.ts` exists and add:

```typescript
it('reads host from config.json when available', () => {
  // Test that vite config reads network.host from config
  // This may need to be an integration-level test
})
```

**Step 2: Modify vite.config.ts**

Replace the hardcoded `host: true` (line 46) with config-based host:

```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// Read network host from config, defaulting to localhost
function getNetworkHost(): string | boolean {
  try {
    const configPath = join(homedir(), '.freshell', 'config.json')
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    return config.settings?.network?.host ?? '127.0.0.1'
  } catch {
    return '127.0.0.1'
  }
}
```

Then in the server config:
```typescript
server: {
  host: getNetworkHost(),
  // ... rest unchanged
}
```

**Step 3: Verify dev server starts**

Run: `npm run dev:client` (briefly, verify it starts on the correct interface)

**Step 4: Commit**

```bash
git add vite.config.ts
git commit -m "feat(vite): read bind host from config instead of hardcoding

Vite dev server now reads network.host from ~/.freshell/config.json.
Defaults to 127.0.0.1 (localhost) matching the secure-by-default behavior.
Users enabling remote access via the setup wizard will rebind both servers."
```

---

## Task 7: Network Status Redux Slice + API Hook

**Files:**
- Create: `src/store/networkSlice.ts`
- Modify: `src/store/index.ts` (add reducer)
- Create: `src/hooks/useNetworkStatus.ts`
- Test: `test/unit/client/networkSlice.test.ts`

**Step 1: Write failing test**

Create `test/unit/client/networkSlice.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { networkReducer, setNetworkStatus, type NetworkState } from '@/store/networkSlice'

describe('networkSlice', () => {
  it('has correct initial state', () => {
    const state = networkReducer(undefined, { type: '@@INIT' })
    expect(state.status).toBeNull()
    expect(state.loading).toBe(false)
  })

  it('sets network status', () => {
    const mockStatus = {
      configured: true,
      host: '0.0.0.0' as const,
      port: 3001,
      lanIps: ['192.168.1.100'],
      mdns: { enabled: true, hostname: 'freshell' },
      firewall: { platform: 'linux-none' as const, active: false, portOpen: null, commands: [] },
      devMode: false,
      accessUrl: 'http://192.168.1.100:3001/?token=abc',
    }
    const state = networkReducer(undefined, setNetworkStatus(mockStatus))
    expect(state.status).toEqual(mockStatus)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/client/networkSlice.test.ts`

Expected: FAIL — module not found.

**Step 3: Implement networkSlice**

Create `src/store/networkSlice.ts`:

```typescript
import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit'
import { api } from '@/lib/api'

export interface NetworkStatusResponse {
  configured: boolean
  host: '127.0.0.1' | '0.0.0.0'
  port: number
  lanIps: string[]
  mdns: { enabled: boolean; hostname: string } | null
  firewall: {
    platform: string
    active: boolean
    portOpen: boolean | null
    commands: string[]
  }
  devMode: boolean
  devPort?: number
  accessUrl: string
}

export interface NetworkState {
  status: NetworkStatusResponse | null
  loading: boolean
  configuring: boolean
  error: string | null
}

const initialState: NetworkState = {
  status: null,
  loading: false,
  configuring: false,
  error: null,
}

export const fetchNetworkStatus = createAsyncThunk(
  'network/fetchStatus',
  async () => {
    return api.get<NetworkStatusResponse>('/api/network/status')
  },
)

export const configureNetwork = createAsyncThunk(
  'network/configure',
  async (config: { host: string; configured: boolean; mdns: { enabled: boolean; hostname: string } }) => {
    return api.post<NetworkStatusResponse>('/api/network/configure', config)
  },
)

const networkSlice = createSlice({
  name: 'network',
  initialState,
  reducers: {
    setNetworkStatus(state, action: PayloadAction<NetworkStatusResponse>) {
      state.status = action.payload
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNetworkStatus.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchNetworkStatus.fulfilled, (state, action) => {
        state.loading = false
        state.status = action.payload
      })
      .addCase(fetchNetworkStatus.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message ?? 'Failed to fetch network status'
      })
      .addCase(configureNetwork.pending, (state) => {
        state.configuring = true
        state.error = null
      })
      .addCase(configureNetwork.fulfilled, (state, action) => {
        state.configuring = false
        state.status = action.payload
      })
      .addCase(configureNetwork.rejected, (state, action) => {
        state.configuring = false
        state.error = action.error.message ?? 'Failed to configure network'
      })
  },
})

export const { setNetworkStatus } = networkSlice.actions
export const networkReducer = networkSlice.reducer
```

Add to `src/store/index.ts`:
```typescript
import { networkReducer } from './networkSlice'
// In the store config:
network: networkReducer,
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/client/networkSlice.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/store/networkSlice.ts src/store/index.ts test/unit/client/networkSlice.test.ts
git commit -m "feat(client): add networkSlice for network status state management

Redux slice with fetchNetworkStatus and configureNetwork async thunks.
Tracks loading/configuring/error states for UI consumption."
```

---

## Task 8: Setup Wizard Component

**Files:**
- Create: `src/components/SetupWizard.tsx`
- Modify: `src/App.tsx` (render wizard overlay)
- Test: `test/unit/client/SetupWizard.test.tsx`

This is the main UI component. It renders as a full-page overlay when `network.configured === false`.

**Step 1: Write failing tests**

Create `test/unit/client/SetupWizard.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { SetupWizard } from '@/components/SetupWizard'
import { networkReducer } from '@/store/networkSlice'

const mockDispatch = vi.fn()
vi.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: vi.fn((selector) => selector({
    network: {
      status: {
        configured: false,
        host: '127.0.0.1',
        port: 3001,
        lanIps: ['192.168.1.100'],
        mdns: { enabled: false, hostname: 'freshell' },
        firewall: { platform: 'linux-none', active: false, portOpen: null, commands: [] },
        devMode: false,
        accessUrl: 'http://192.168.1.100:3001/?token=abc',
      },
      loading: false,
      configuring: false,
      error: null,
    },
  })),
}))

describe('SetupWizard', () => {
  it('renders step 1 with setup prompt', () => {
    render(<SetupWizard onComplete={vi.fn()} />)
    expect(screen.getByText(/from your phone and other computers/i)).toBeInTheDocument()
  })

  it('shows "Yes, set it up" and "No, just this computer" buttons', () => {
    render(<SetupWizard onComplete={vi.fn()} />)
    expect(screen.getByRole('button', { name: /yes/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /no/i })).toBeInTheDocument()
  })

  it('calls onComplete when "No" is clicked', async () => {
    const onComplete = vi.fn()
    render(<SetupWizard onComplete={onComplete} />)
    fireEvent.click(screen.getByRole('button', { name: /no/i }))
    await waitFor(() => expect(mockDispatch).toHaveBeenCalled())
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/client/SetupWizard.test.tsx`

Expected: FAIL — module not found.

**Step 3: Implement SetupWizard**

Create `src/components/SetupWizard.tsx`. This is a multi-step wizard component. Use the existing shadcn components and Tailwind patterns from the codebase (look at SettingsView.tsx for conventions).

The wizard has three steps:

- **Step 1:** "Set up Freshell so you can use it from your phone and other computers?"
  - Two buttons: "Yes, set it up" / "No, just this computer"
  - "No" → dispatches `configureNetwork({ host: '127.0.0.1', configured: true, mdns: { enabled: false, hostname: 'freshell' } })` → calls `onComplete()`

- **Step 2:** Configuration checklist with auto-progressing items:
  1. "Binding to network..." → dispatches `configureNetwork(...)` with host `0.0.0.0`
  2. "Setting up local discovery..." → mDNS hostname input field
  3. "Checking firewall..." → shows status or "Configure now" button
  - "Configure now" button calls `POST /api/network/configure-firewall` which opens a terminal pane

- **Step 3:** "You're all set" — QR code, URL, mDNS name
  - Uses `lean-qr` for the QR code: `import { generate } from 'lean-qr'` and `import { toSvg } from 'lean-qr/extras/svg'` or the React component from `lean-qr/extras/react`

**Important implementation notes:**
- The component receives `onComplete` prop, called when the user finishes setup
- Uses `useAppDispatch()` and `useAppSelector()` from `@/store/hooks`
- Full-page overlay with `fixed inset-0 z-[70]` (above the share modal z-[60])
- Follow existing a11y patterns: `role="dialog"`, `aria-modal="true"`, semantic buttons

**Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/client/SetupWizard.test.tsx`

Expected: PASS

**Step 5: Wire into App.tsx**

In `src/App.tsx`:

1. Import `SetupWizard` and `fetchNetworkStatus`
2. Dispatch `fetchNetworkStatus()` on mount (in the bootstrap effect, around line 199)
3. Read network state: `const networkStatus = useAppSelector(s => s.network.status)`
4. Render wizard overlay when `networkStatus && !networkStatus.configured`:

```tsx
{networkStatus && !networkStatus.configured && (
  <SetupWizard onComplete={() => dispatch(fetchNetworkStatus())} />
)}
```

Place this after the AuthRequiredModal (around line 590).

**Step 6: Run full test suite**

Run: `npm test`

Expected: All tests pass.

**Step 7: Commit**

```bash
git add src/components/SetupWizard.tsx src/App.tsx test/unit/client/SetupWizard.test.tsx
git commit -m "feat(ui): add first-run setup wizard for remote access

Three-step wizard: ask → configure (rebind + mDNS + firewall) → done (QR code).
Renders as full-page overlay on first run when network is not configured.
Uses lean-qr for QR code generation."
```

---

## Task 9: Network Settings Section in SettingsView

**Files:**
- Modify: `src/components/SettingsView.tsx` (add Network Access section)
- Test: `test/unit/client/SettingsView.test.tsx` (if exists, add network tests)

**Step 1: Write failing test**

```typescript
describe('Network Access settings', () => {
  it('renders remote access toggle', () => {
    render(<SettingsView />)
    expect(screen.getByText(/remote access/i)).toBeInTheDocument()
  })

  it('renders mDNS hostname field when remote access enabled', () => {
    // Mock network status with host 0.0.0.0
    render(<SettingsView />)
    // Verify mDNS hostname input is present
  })
})
```

**Step 2: Implement the Network Access section**

Add a new `SettingsSection` to `SettingsView.tsx` (before the existing Appearance section, since it's a high-priority setting):

```tsx
<SettingsSection title="Network Access" description="Control how Freshell is accessible on your network">
  <SettingsRow label="Remote access" description="Allow connections from other devices on your network">
    <Toggle
      checked={networkStatus?.host === '0.0.0.0'}
      onChange={async (checked) => {
        await dispatch(configureNetwork({
          host: checked ? '0.0.0.0' : '127.0.0.1',
          configured: true,
          mdns: networkStatus?.mdns ?? { enabled: false, hostname: 'freshell' },
        }))
      }}
    />
  </SettingsRow>

  {networkStatus?.host === '0.0.0.0' && (
    <>
      <SettingsRow label="mDNS hostname" description="Discover Freshell on your network as hostname.local">
        <input
          type="text"
          value={mdnsHostname}
          onChange={(e) => setMdnsHostname(e.target.value)}
          onBlur={handleMdnsHostnameChange}
          className="..."
        />
      </SettingsRow>

      <SettingsRow label="Firewall status" description={firewallDescription}>
        {/* Show green/yellow/red indicator + Fix button if needed */}
      </SettingsRow>

      <SettingsRow label="Access URL" description="Share this URL with your devices">
        {/* Copyable URL + QR code */}
      </SettingsRow>
    </>
  )}
</SettingsSection>
```

**Step 3: Run tests**

Run: `npm test`

**Step 4: Commit**

```bash
git add src/components/SettingsView.tsx
git commit -m "feat(ui): add Network Access section to Settings

Toggle for remote access, mDNS hostname config, firewall status
indicator, and access URL with QR code. Uses same NetworkManager
API as the setup wizard."
```

---

## Task 10: Enhance Share Button with Network Awareness

**Files:**
- Modify: `src/App.tsx` (lines 136-185 for handleShare, lines 480-486 for share button, lines 537-589 for share modal)

**Step 1: Write failing test**

```typescript
describe('Share button', () => {
  it('opens setup wizard when network not configured', () => {
    // Mock network status as unconfigured
    // Click share button
    // Expect wizard to appear
  })

  it('shows QR code popover when network is configured', () => {
    // Mock network status as configured with remote access
    // Click share button
    // Expect QR code and URL in popover
  })
})
```

**Step 2: Modify handleShare in App.tsx**

Replace the current `handleShare` function (lines 136-185) with network-aware logic:

```typescript
const handleShare = async () => {
  if (!networkStatus?.configured) {
    // Open setup wizard
    setShowSetupWizard(true)
    return
  }

  if (networkStatus.host === '127.0.0.1') {
    // Network not enabled — prompt to enable
    setShowSetupWizard(true)
    return
  }

  // Network is configured and remote — show QR code popover
  setShowSharePanel(true)
}
```

**Step 3: Replace share modal with network-aware share panel**

The share panel (replacing the Windows-only modal at lines 537-589) should show:
- QR code of the access URL (via `lean-qr`)
- Copyable URL text
- mDNS hostname if enabled
- Network status indicator
- Copy button that copies the URL

**Step 4: Run tests**

Run: `npm test`

**Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ui): make Share button network-aware

Opens setup wizard if network not configured. Shows QR code panel
with access URL, mDNS hostname, and copy button when configured.
Replaces the previous Windows-only share modal."
```

---

## Task 11: Firewall Configuration via Terminal Pane

**Files:**
- Create: `server/routes/network.ts` (or add to index.ts)
- Modify: `server/network-manager.ts`
- Test: `test/unit/server/network-manager.test.ts`

When the user clicks "Configure now" for firewall setup, the server needs to:
1. Create a terminal that runs the firewall command
2. Return the terminal ID so the UI can show the terminal pane
3. Watch for command completion

**Step 1: Write failing test**

```typescript
describe('configureFirewall', () => {
  it('returns commands for the detected platform', async () => {
    const { detectFirewall } = await import('../../server/firewall.js')
    vi.mocked(detectFirewall).mockResolvedValue({ platform: 'linux-ufw', active: true })

    manager = new NetworkManager(server, mockConfigStore, 3001)
    const status = await manager.getStatus()
    expect(status.firewall.commands).toEqual(['sudo ufw allow 3001/tcp'])
  })
})
```

**Step 2: Add POST /api/network/configure-firewall endpoint**

```typescript
app.post('/api/network/configure-firewall', async (req, res) => {
  const status = await networkManager.getStatus()
  const commands = status.firewall.commands

  if (commands.length === 0) {
    // WSL2 or no firewall — use existing WSL port forwarding path
    if (status.firewall.platform === 'wsl2') {
      const result = setupWslPortForwarding()
      return res.json({ method: 'wsl2', result })
    }
    return res.json({ method: 'none', result: 'no-firewall' })
  }

  // For Linux/macOS: return the command to run in a terminal pane
  // The client will create a terminal pane with this command
  const command = commands.join(' && ')
  res.json({ method: 'terminal', command })
})
```

The client side: when receiving `method: 'terminal'`, create a new terminal pane that runs the command. The user sees the sudo prompt and authenticates. When the command completes, the UI re-fetches network status to update the firewall indicator.

**Step 3: Run tests**

Run: `npm test`

**Step 4: Commit**

```bash
git add server/index.ts server/network-manager.ts test/unit/server/network-manager.test.ts
git commit -m "feat: add firewall configuration endpoint

POST /api/network/configure-firewall returns firewall commands
for the detected platform. Linux/macOS commands run in a terminal
pane for sudo authentication. WSL2 uses existing UAC elevation."
```

---

## Task 12: Update Bootstrap to Not Auto-Run WSL Port Forwarding

**Files:**
- Modify: `server/bootstrap.ts` (remove auto-ALLOWED_ORIGINS building or make it config-aware)
- Modify: `test/unit/server/bootstrap.test.ts`

**Step 1: Review existing bootstrap tests**

Read `test/unit/server/bootstrap.test.ts` to understand what's tested.

**Step 2: Modify bootstrap.ts**

The bootstrap still generates `AUTH_TOKEN` on first run (that stays). But `ALLOWED_ORIGINS` building should be aware of the network config:
- If `config.json` exists and `network.host` is `127.0.0.1`, only include localhost origins
- If `network.host` is `0.0.0.0`, include LAN IPs as before

The `detectLanIps()` function can stay (it's used in the startup message), but `buildAllowedOrigins()` should be config-aware.

**Step 3: Update tests to reflect new behavior**

**Step 4: Run tests**

Run: `npx vitest run test/unit/server/bootstrap.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add server/bootstrap.ts test/unit/server/bootstrap.test.ts
git commit -m "refactor(bootstrap): make ALLOWED_ORIGINS config-aware

ALLOWED_ORIGINS now respects network.host from config.json.
Localhost-only mode only includes localhost origins.
LAN IPs still included when remote access is enabled."
```

---

## Task 13: Update Startup Message

**Files:**
- Modify: `server/index.ts` (lines 790-806)

The startup message currently says "Visit from anywhere on your network." This should reflect the actual bind state.

**Step 1: Update the startup message**

```typescript
if (bindHost === '127.0.0.1') {
  console.log(`   Local only: \x1b[36mhttp://localhost:${visitPort}/?token=${token}\x1b[0m`)
  console.log(`   Run the setup wizard to enable remote access.`)
} else {
  console.log(`   Visit from anywhere on your network: \x1b[36m${url}\x1b[0m`)
  const networkSettings = settings.network
  if (networkSettings.mdns.enabled) {
    console.log(`   Or use: \x1b[36mhttp://${networkSettings.mdns.hostname}.local:${visitPort}/\x1b[0m`)
  }
}
```

**Step 2: Commit**

```bash
git add server/index.ts
git commit -m "feat: update startup message to reflect network bind state

Shows localhost-only URL with setup hint when bound to 127.0.0.1.
Shows LAN URL and mDNS hostname when remote access is enabled."
```

---

## Task 14: E2E Tests

**Files:**
- Create: `test/e2e/network-setup.test.ts`

**Step 1: Write E2E tests for the wizard flow**

```typescript
describe('Network Setup Wizard', () => {
  it('shows wizard on first run when network not configured', async () => {
    // Navigate to app
    // Expect wizard overlay to be visible
    // Expect "Set up Freshell so you can use it from your phone and other computers?" text
  })

  it('dismisses wizard when "No, just this computer" is clicked', async () => {
    // Click "No" button
    // Expect wizard to disappear
    // Expect network status configured = true, host = 127.0.0.1
  })

  it('proceeds to configuration when "Yes" is clicked', async () => {
    // Click "Yes" button
    // Expect step 2 with configuration checklist
  })
})

describe('Share button', () => {
  it('opens wizard when network not configured', async () => {
    // Click share button
    // Expect wizard to appear
  })

  it('shows QR code when network configured', async () => {
    // Configure network first
    // Click share button
    // Expect QR code panel to appear
  })
})
```

**Step 2: Run E2E tests**

Run: `npx vitest run test/e2e/network-setup.test.ts`

**Step 3: Commit**

```bash
git add test/e2e/network-setup.test.ts
git commit -m "test(e2e): add network setup wizard and share button tests"
```

---

## Task 15: Update docs/index.html

**Files:**
- Modify: `docs/index.html`

Per the AGENTS.md rule: "When adding new user-facing features or making significant UI changes, update `docs/index.html` to reflect them."

Add mention of:
- Setup wizard for remote access
- Share button with QR code
- Network Access settings section
- mDNS discovery (freshell.local)

**Step 1: Update the docs page**

**Step 2: Commit**

```bash
git add docs/index.html
git commit -m "docs: add remote access setup features to index.html"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Install dependencies | package.json |
| 2 | Config schema extension | config-store.ts, settingsSlice.ts |
| 3 | Firewall detection module | server/firewall.ts |
| 4 | NetworkManager module | server/network-manager.ts |
| 5 | Server integration + /local-file auth | server/index.ts |
| 6 | Vite config update | vite.config.ts |
| 7 | Redux slice + hooks | src/store/networkSlice.ts |
| 8 | Setup Wizard component | src/components/SetupWizard.tsx, App.tsx |
| 9 | Settings Network Access section | src/components/SettingsView.tsx |
| 10 | Share button enhancement | src/App.tsx |
| 11 | Firewall terminal pane endpoint | server routes |
| 12 | Bootstrap refactor | server/bootstrap.ts |
| 13 | Startup message update | server/index.ts |
| 14 | E2E tests | test/e2e/ |
| 15 | Documentation | docs/index.html |
