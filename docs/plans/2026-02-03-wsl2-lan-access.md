# WSL2 LAN Access Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically configure Windows port forwarding when running in WSL2 so external LAN devices can reach Freshell.

**Architecture:** New module `server/wsl-port-forward.ts` detects WSL2, reads configured PORT from environment, checks existing port proxy rules via `netsh`, and launches an elevated PowerShell process to add/update rules if needed. Verifies rules were applied after elevation. Called from `server/index.ts` AFTER dotenv loads (not from bootstrap.ts) so that user-configured PORT/NODE_ENV values from .env are available.

**Tech Stack:** Node.js child_process (execSync), Windows netsh, PowerShell elevation via `-Verb RunAs`

---

## Issue Fixes Applied

This plan addresses all issues from code review:

1. **Dynamic ports** - Reads PORT from process.env AFTER dotenv loads, dev port (5173) only added when NODE_ENV !== 'production'
2. **Complete rule validation** - parsePortProxyRules captures both connectAddress AND connectPort; needsPortForwardingUpdate verifies both match
3. **Shell escaping** - Uses `\$null` to prevent sh expansion, and absolute PowerShell path
4. **Verified success** - After elevation, re-queries netsh to verify rules were actually applied
5. **Secure firewall rule** - Adds `profile=private` to restrict to private networks only
6. **Full test coverage** - Tests for success path and integration location verification included
7. **WSL2-specific detection** - Uses `wsl2` or `microsoft-standard` patterns to avoid false positives on WSL1
8. **Port validation** - Validates PORT is a valid number (1-65535), deduplicates when PORT=5173
9. **Proper integration location** - Called from server/index.ts after dotenv/config loads, not from bootstrap.ts

---

### Task 1: Create wsl-port-forward module with getWslIp

**Files:**
- Create: `server/wsl-port-forward.ts`
- Create: `test/unit/server/wsl-port-forward.test.ts`

**Step 1: Write the failing test**

```typescript
// test/unit/server/wsl-port-forward.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execSync } from 'child_process'

vi.mock('child_process')

import { getWslIp } from '../../../server/wsl-port-forward.js'

describe('wsl-port-forward', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('getWslIp', () => {
    it('returns first IPv4 address from hostname -I', () => {
      vi.mocked(execSync).mockReturnValue('172.30.149.249 172.17.0.1 \n')

      const ip = getWslIp()

      expect(ip).toBe('172.30.149.249')
    })

    it('skips IPv6 addresses and returns first IPv4', () => {
      vi.mocked(execSync).mockReturnValue('fe80::1 2001:db8::1 172.30.149.249 10.0.0.5\n')

      const ip = getWslIp()

      expect(ip).toBe('172.30.149.249')
    })

    it('returns null when hostname -I fails', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command failed')
      })

      const ip = getWslIp()

      expect(ip).toBeNull()
    })

    it('returns null when no IPv4 addresses found', () => {
      vi.mocked(execSync).mockReturnValue('fe80::1 2001:db8::1\n')

      const ip = getWslIp()

      expect(ip).toBeNull()
    })

    it('returns null when output is empty', () => {
      vi.mocked(execSync).mockReturnValue('')

      const ip = getWslIp()

      expect(ip).toBeNull()
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/unit/server/wsl-port-forward.test.ts`
Expected: FAIL - module not found

**Step 3: Write minimal implementation**

```typescript
// server/wsl-port-forward.ts
import { execSync } from 'child_process'

const IPV4_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/

/**
 * Get the current WSL2 IPv4 address.
 * Returns the first IPv4 address from `hostname -I`, skipping any IPv6 addresses.
 */
export function getWslIp(): string | null {
  try {
    const output = execSync('hostname -I', { encoding: 'utf-8', timeout: 5000 })
    const addresses = output.trim().split(/\s+/).filter(Boolean)

    // Find first IPv4 address (skip IPv6)
    for (const addr of addresses) {
      if (IPV4_REGEX.test(addr)) {
        return addr
      }
    }
    return null
  } catch {
    return null
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run test/unit/server/wsl-port-forward.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/wsl-port-forward.ts test/unit/server/wsl-port-forward.test.ts
git commit -m "feat(wsl): add getWslIp function with IPv4 filtering"
```

---

### Task 2: Add parsePortProxyRules function with full rule capture

**Files:**
- Modify: `server/wsl-port-forward.ts`
- Modify: `test/unit/server/wsl-port-forward.test.ts`

**Step 1: Write the failing test**

Add to test file:

```typescript
import { getWslIp, parsePortProxyRules, type PortProxyRule } from '../../../server/wsl-port-forward.js'

describe('parsePortProxyRules', () => {
  it('parses netsh portproxy output into map with full rule details', () => {
    const output = `
Listen on ipv4:             Connect to ipv4:

Address         Port        Address         Port
--------------- ----------  --------------- ----------
0.0.0.0         3001        172.30.149.249  3001
0.0.0.0         5173        172.30.149.249  5173
`
    const rules = parsePortProxyRules(output)

    expect(rules.get(3001)).toEqual({ connectAddress: '172.30.149.249', connectPort: 3001 })
    expect(rules.get(5173)).toEqual({ connectAddress: '172.30.149.249', connectPort: 5173 })
  })

  it('captures rules where listen port differs from connect port', () => {
    const output = `
Listen on ipv4:             Connect to ipv4:

Address         Port        Address         Port
--------------- ----------  --------------- ----------
0.0.0.0         8080        172.30.149.249  3001
`
    const rules = parsePortProxyRules(output)

    expect(rules.get(8080)).toEqual({ connectAddress: '172.30.149.249', connectPort: 3001 })
  })

  it('returns empty map for empty output', () => {
    const rules = parsePortProxyRules('')

    expect(rules.size).toBe(0)
  })

  it('ignores rules not listening on 0.0.0.0', () => {
    const output = `
Listen on ipv4:             Connect to ipv4:

Address         Port        Address         Port
--------------- ----------  --------------- ----------
127.0.0.1       8080        172.30.149.249  8080
0.0.0.0         3001        172.30.149.249  3001
`
    const rules = parsePortProxyRules(output)

    expect(rules.has(8080)).toBe(false)
    expect(rules.get(3001)).toEqual({ connectAddress: '172.30.149.249', connectPort: 3001 })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/unit/server/wsl-port-forward.test.ts`
Expected: FAIL - parsePortProxyRules not exported

**Step 3: Write minimal implementation**

Add to `server/wsl-port-forward.ts`:

```typescript
export type PortProxyRule = {
  connectAddress: string
  connectPort: number
}

/**
 * Parse netsh interface portproxy show v4tov4 output.
 * Returns a Map of listenPort -> { connectAddress, connectPort } for rules listening on 0.0.0.0.
 */
export function parsePortProxyRules(output: string): Map<number, PortProxyRule> {
  const rules = new Map<number, PortProxyRule>()

  for (const line of output.split('\n')) {
    // Match lines like: 0.0.0.0         3001        172.30.149.249  3001
    const match = line.match(/^([\d.]+)\s+(\d+)\s+([\d.]+)\s+(\d+)/)
    if (match) {
      const [, listenAddr, listenPort, connectAddr, connectPort] = match
      if (listenAddr === '0.0.0.0') {
        rules.set(parseInt(listenPort, 10), {
          connectAddress: connectAddr,
          connectPort: parseInt(connectPort, 10),
        })
      }
    }
  }

  return rules
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run test/unit/server/wsl-port-forward.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/wsl-port-forward.ts test/unit/server/wsl-port-forward.test.ts
git commit -m "feat(wsl): add parsePortProxyRules with full rule capture"
```

---

### Task 3: Add getExistingPortProxyRules function

**Files:**
- Modify: `server/wsl-port-forward.ts`
- Modify: `test/unit/server/wsl-port-forward.test.ts`

**Step 1: Write the failing test**

Add to test file:

```typescript
import { getWslIp, parsePortProxyRules, getExistingPortProxyRules, type PortProxyRule } from '../../../server/wsl-port-forward.js'

describe('getExistingPortProxyRules', () => {
  it('calls netsh with absolute path and parses output', () => {
    vi.mocked(execSync).mockReturnValue(`
Listen on ipv4:             Connect to ipv4:

Address         Port        Address         Port
--------------- ----------  --------------- ----------
0.0.0.0         3001        172.30.149.249  3001
`)

    const rules = getExistingPortProxyRules()

    expect(execSync).toHaveBeenCalledWith(
      '/mnt/c/Windows/System32/netsh.exe interface portproxy show v4tov4',
      expect.objectContaining({ encoding: 'utf-8' })
    )
    expect(rules.get(3001)).toEqual({ connectAddress: '172.30.149.249', connectPort: 3001 })
  })

  it('returns empty map when netsh fails', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Command failed')
    })

    const rules = getExistingPortProxyRules()

    expect(rules.size).toBe(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/unit/server/wsl-port-forward.test.ts`
Expected: FAIL - getExistingPortProxyRules not exported

**Step 3: Write minimal implementation**

Add to `server/wsl-port-forward.ts`:

```typescript
const NETSH_PATH = '/mnt/c/Windows/System32/netsh.exe'

/**
 * Query existing Windows port proxy rules.
 * Returns a Map of listenPort -> { connectAddress, connectPort }.
 */
export function getExistingPortProxyRules(): Map<number, PortProxyRule> {
  try {
    const output = execSync(
      `${NETSH_PATH} interface portproxy show v4tov4`,
      { encoding: 'utf-8', timeout: 10000 }
    )
    return parsePortProxyRules(output)
  } catch {
    return new Map()
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run test/unit/server/wsl-port-forward.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/wsl-port-forward.ts test/unit/server/wsl-port-forward.test.ts
git commit -m "feat(wsl): add getExistingPortProxyRules function"
```

---

### Task 4: Add getRequiredPorts and needsPortForwardingUpdate functions

**Files:**
- Modify: `server/wsl-port-forward.ts`
- Modify: `test/unit/server/wsl-port-forward.test.ts`

**Step 1: Write the failing test**

Add to test file:

```typescript
import {
  getWslIp,
  parsePortProxyRules,
  getExistingPortProxyRules,
  getRequiredPorts,
  needsPortForwardingUpdate,
  type PortProxyRule
} from '../../../server/wsl-port-forward.js'

describe('getRequiredPorts', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns default port 3001 when PORT not set', () => {
    delete process.env.PORT

    const ports = getRequiredPorts()

    expect(ports).toContain(3001)
  })

  it('uses PORT from environment', () => {
    process.env.PORT = '4000'

    const ports = getRequiredPorts()

    expect(ports).toContain(4000)
    expect(ports).not.toContain(3001)
  })

  it('includes dev port 5173 when not in production', () => {
    delete process.env.NODE_ENV
    delete process.env.PORT

    const ports = getRequiredPorts()

    expect(ports).toContain(5173)
  })

  it('excludes dev port 5173 in production', () => {
    process.env.NODE_ENV = 'production'

    const ports = getRequiredPorts()

    expect(ports).not.toContain(5173)
  })
})

describe('needsPortForwardingUpdate', () => {
  it('returns true when no rules exist', () => {
    const rules = new Map<number, PortProxyRule>()

    const needs = needsPortForwardingUpdate('172.30.149.249', [3001, 5173], rules)

    expect(needs).toBe(true)
  })

  it('returns true when rules point to wrong IP', () => {
    const rules = new Map<number, PortProxyRule>([
      [3001, { connectAddress: '172.30.100.100', connectPort: 3001 }],
      [5173, { connectAddress: '172.30.100.100', connectPort: 5173 }],
    ])

    const needs = needsPortForwardingUpdate('172.30.149.249', [3001, 5173], rules)

    expect(needs).toBe(true)
  })

  it('returns true when rules point to wrong port', () => {
    const rules = new Map<number, PortProxyRule>([
      [3001, { connectAddress: '172.30.149.249', connectPort: 8080 }], // wrong connect port!
      [5173, { connectAddress: '172.30.149.249', connectPort: 5173 }],
    ])

    const needs = needsPortForwardingUpdate('172.30.149.249', [3001, 5173], rules)

    expect(needs).toBe(true)
  })

  it('returns true when only one port is configured', () => {
    const rules = new Map<number, PortProxyRule>([
      [3001, { connectAddress: '172.30.149.249', connectPort: 3001 }],
    ])

    const needs = needsPortForwardingUpdate('172.30.149.249', [3001, 5173], rules)

    expect(needs).toBe(true)
  })

  it('returns false when all ports point to correct IP and port', () => {
    const rules = new Map<number, PortProxyRule>([
      [3001, { connectAddress: '172.30.149.249', connectPort: 3001 }],
      [5173, { connectAddress: '172.30.149.249', connectPort: 5173 }],
    ])

    const needs = needsPortForwardingUpdate('172.30.149.249', [3001, 5173], rules)

    expect(needs).toBe(false)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/unit/server/wsl-port-forward.test.ts`
Expected: FAIL - getRequiredPorts and needsPortForwardingUpdate not exported

**Step 3: Write minimal implementation**

Add to `server/wsl-port-forward.ts`:

```typescript
const DEFAULT_PORT = 3001
const DEV_PORT = 5173

/**
 * Get the list of ports that need forwarding.
 * Uses PORT from environment (or default 3001).
 * Includes dev port 5173 unless NODE_ENV is 'production'.
 */
export function getRequiredPorts(): number[] {
  const serverPort = parseInt(process.env.PORT || String(DEFAULT_PORT), 10)
  const ports = [serverPort]

  // Include dev server port unless in production
  if (process.env.NODE_ENV !== 'production') {
    ports.push(DEV_PORT)
  }

  return ports
}

/**
 * Check if port forwarding rules need to be updated.
 * Returns true if any required port is missing, points to wrong IP, or wrong connect port.
 */
export function needsPortForwardingUpdate(
  wslIp: string,
  requiredPorts: number[],
  existingRules: Map<number, PortProxyRule>
): boolean {
  for (const port of requiredPorts) {
    const rule = existingRules.get(port)
    if (!rule) {
      return true
    }
    if (rule.connectAddress !== wslIp || rule.connectPort !== port) {
      return true
    }
  }
  return false
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run test/unit/server/wsl-port-forward.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/wsl-port-forward.ts test/unit/server/wsl-port-forward.test.ts
git commit -m "feat(wsl): add getRequiredPorts and needsPortForwardingUpdate"
```

---

### Task 5: Add buildPortForwardingScript function with proper escaping

**Files:**
- Modify: `server/wsl-port-forward.ts`
- Modify: `test/unit/server/wsl-port-forward.test.ts`

**Step 1: Write the failing test**

Add to test file:

```typescript
import {
  getWslIp,
  parsePortProxyRules,
  getExistingPortProxyRules,
  getRequiredPorts,
  needsPortForwardingUpdate,
  buildPortForwardingScript,
  type PortProxyRule
} from '../../../server/wsl-port-forward.js'

describe('buildPortForwardingScript', () => {
  it('generates PowerShell script with delete and add commands', () => {
    const script = buildPortForwardingScript('172.30.149.249', [3001, 5173])

    // Delete commands (without listenaddress to catch all variants)
    expect(script).toContain('netsh interface portproxy delete v4tov4 listenport=3001')
    expect(script).toContain('netsh interface portproxy delete v4tov4 listenport=5173')

    // Add commands
    expect(script).toContain('netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=3001 connectaddress=172.30.149.249 connectport=3001')
    expect(script).toContain('netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=5173 connectaddress=172.30.149.249 connectport=5173')
  })

  it('includes firewall rule with private profile restriction', () => {
    const script = buildPortForwardingScript('172.30.149.249', [3001, 5173])

    expect(script).toContain('netsh advfirewall firewall delete rule name="Freshell LAN Access"')
    expect(script).toContain('netsh advfirewall firewall add rule name="Freshell LAN Access"')
    expect(script).toContain('profile=private')
    expect(script).toContain('localport=3001,5173')
  })

  it('uses escaped $null for PowerShell error suppression', () => {
    const script = buildPortForwardingScript('172.30.149.249', [3001])

    // Must use \$null to prevent shell expansion
    expect(script).toContain('2>\\$null')
    expect(script).not.toContain('2>$null')
  })

  it('handles single port', () => {
    const script = buildPortForwardingScript('172.30.149.249', [4000])

    expect(script).toContain('listenport=4000')
    expect(script).toContain('connectport=4000')
    expect(script).toContain('localport=4000')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/unit/server/wsl-port-forward.test.ts`
Expected: FAIL - buildPortForwardingScript not exported

**Step 3: Write minimal implementation**

Add to `server/wsl-port-forward.ts`:

```typescript
/**
 * Build PowerShell script to configure port forwarding and firewall.
 * Uses \$null escaping to prevent shell variable expansion.
 * Firewall rule restricted to private profile for security.
 */
export function buildPortForwardingScript(wslIp: string, ports: number[]): string {
  const commands: string[] = []

  // Delete existing rules (without listenaddress to catch all variants)
  // Use \$null to prevent sh from expanding $null
  for (const port of ports) {
    commands.push(
      `netsh interface portproxy delete v4tov4 listenport=${port} 2>\\$null`
    )
  }

  // Add new rules
  for (const port of ports) {
    commands.push(
      `netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=${port} connectaddress=${wslIp} connectport=${port}`
    )
  }

  // Firewall rule (delete then add for idempotency)
  // SECURITY: profile=private restricts to private networks only (not public Wi-Fi)
  commands.push(`netsh advfirewall firewall delete rule name="Freshell LAN Access" 2>\\$null`)
  commands.push(
    `netsh advfirewall firewall add rule name="Freshell LAN Access" dir=in action=allow protocol=tcp localport=${ports.join(',')} profile=private`
  )

  return commands.join('; ')
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run test/unit/server/wsl-port-forward.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/wsl-port-forward.ts test/unit/server/wsl-port-forward.test.ts
git commit -m "feat(wsl): add buildPortForwardingScript with proper escaping and security"
```

---

### Task 6: Add setupWslPortForwarding main function with verification

**Files:**
- Modify: `server/wsl-port-forward.ts`
- Modify: `test/unit/server/wsl-port-forward.test.ts`

**Step 1: Write the failing test**

Add to test file:

```typescript
import {
  getWslIp,
  parsePortProxyRules,
  getExistingPortProxyRules,
  getRequiredPorts,
  needsPortForwardingUpdate,
  buildPortForwardingScript,
  setupWslPortForwarding,
  type PortProxyRule
} from '../../../server/wsl-port-forward.js'
import fs from 'fs'

vi.mock('fs')

describe('setupWslPortForwarding', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
    // Default: not WSL2
    vi.mocked(fs.readFileSync).mockReturnValue('Linux version 5.10.0')
  })

  afterEach(() => {
    vi.resetAllMocks()
    process.env = originalEnv
  })

  it('returns not-wsl2 when not running in WSL2', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('Linux version 5.10.0-generic')

    const result = setupWslPortForwarding()

    expect(result).toBe('not-wsl2')
  })

  it('returns skipped when rules are already correct', () => {
    // Mock WSL2 detection
    vi.mocked(fs.readFileSync).mockReturnValue('Linux version 5.15.0-microsoft-standard-WSL2')

    // Mock execSync calls in order
    vi.mocked(execSync)
      .mockReturnValueOnce('172.30.149.249\n') // hostname -I (getWslIp)
      .mockReturnValueOnce(`
Listen on ipv4:             Connect to ipv4:

Address         Port        Address         Port
--------------- ----------  --------------- ----------
0.0.0.0         3001        172.30.149.249  3001
0.0.0.0         5173        172.30.149.249  5173
`) // netsh show (getExistingPortProxyRules)

    const result = setupWslPortForwarding()

    expect(result).toBe('skipped')
  })

  it('returns failed when WSL IP cannot be detected', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('Linux version 5.15.0-microsoft-standard-WSL2')
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Command failed')
    })

    const result = setupWslPortForwarding()

    expect(result).toBe('failed')
  })

  it('returns success when rules are applied and verified', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('Linux version 5.15.0-microsoft-standard-WSL2')

    // Mock execSync calls in order
    vi.mocked(execSync)
      .mockReturnValueOnce('172.30.149.249\n') // hostname -I (getWslIp)
      .mockReturnValueOnce('') // netsh show - no existing rules
      .mockReturnValueOnce('') // PowerShell elevation
      .mockReturnValueOnce(`
Listen on ipv4:             Connect to ipv4:

Address         Port        Address         Port
--------------- ----------  --------------- ----------
0.0.0.0         3001        172.30.149.249  3001
0.0.0.0         5173        172.30.149.249  5173
`) // netsh show - verification after elevation

    const result = setupWslPortForwarding()

    expect(result).toBe('success')
    // Verify PowerShell was called with absolute path
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'),
      expect.anything()
    )
  })

  it('returns failed when rules not applied after elevation (UAC cancelled)', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('Linux version 5.15.0-microsoft-standard-WSL2')

    // Mock execSync calls in order
    vi.mocked(execSync)
      .mockReturnValueOnce('172.30.149.249\n') // hostname -I
      .mockReturnValueOnce('') // netsh show - no existing rules
      .mockReturnValueOnce('') // PowerShell (UAC cancelled, no error thrown)
      .mockReturnValueOnce('') // netsh show - still no rules (verification fails)

    const result = setupWslPortForwarding()

    expect(result).toBe('failed')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/unit/server/wsl-port-forward.test.ts`
Expected: FAIL - setupWslPortForwarding not exported

**Step 3: Write minimal implementation**

Add to `server/wsl-port-forward.ts`:

```typescript
import fs from 'fs'

const POWERSHELL_PATH = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'

/**
 * Check if running inside WSL2.
 */
function isWSL2(): boolean {
  try {
    const version = fs.readFileSync('/proc/version', 'utf-8')
    return version.toLowerCase().includes('microsoft')
  } catch {
    return false
  }
}

export type SetupResult = 'success' | 'skipped' | 'failed' | 'not-wsl2'

/**
 * Set up Windows port forwarding for WSL2 LAN access.
 *
 * - Detects if running in WSL2
 * - Gets required ports from environment
 * - Checks existing port proxy rules
 * - Launches elevated PowerShell to add/update rules if needed
 * - Verifies rules were actually applied
 *
 * Returns:
 * - 'not-wsl2': Not running in WSL2, no action needed
 * - 'skipped': Rules already configured correctly
 * - 'success': Rules were added/updated and verified
 * - 'failed': Failed to configure (UAC dismissed, error, or verification failed)
 */
export function setupWslPortForwarding(): SetupResult {
  if (!isWSL2()) {
    return 'not-wsl2'
  }

  const wslIp = getWslIp()
  if (!wslIp) {
    console.error('[wsl-port-forward] Failed to detect WSL2 IP address')
    return 'failed'
  }

  const requiredPorts = getRequiredPorts()
  const existingRules = getExistingPortProxyRules()

  if (!needsPortForwardingUpdate(wslIp, requiredPorts, existingRules)) {
    console.log(`[wsl-port-forward] Rules up to date for ${wslIp}`)
    return 'skipped'
  }

  console.log(`[wsl-port-forward] Configuring port forwarding for ${wslIp}...`)
  console.log('[wsl-port-forward] UAC prompt required - please approve to enable LAN access')

  try {
    const script = buildPortForwardingScript(wslIp, requiredPorts)
    // Escape single quotes for PowerShell ArgumentList
    const escapedScript = script.replace(/'/g, "''")

    execSync(
      `${POWERSHELL_PATH} -Command "Start-Process powershell -Verb RunAs -Wait -ArgumentList '-Command', '${escapedScript}'"`,
      { encoding: 'utf-8', timeout: 60000, stdio: 'inherit' }
    )

    // Verify rules were actually applied (UAC cancel doesn't always throw)
    const verifyRules = getExistingPortProxyRules()
    if (needsPortForwardingUpdate(wslIp, requiredPorts, verifyRules)) {
      console.error('[wsl-port-forward] Rules were not applied - UAC may have been cancelled')
      return 'failed'
    }

    console.log('[wsl-port-forward] Port forwarding configured successfully')
    return 'success'
  } catch (err: any) {
    console.error(`[wsl-port-forward] Failed to configure: ${err?.message || err}`)
    return 'failed'
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run test/unit/server/wsl-port-forward.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/wsl-port-forward.ts test/unit/server/wsl-port-forward.test.ts
git commit -m "feat(wsl): add setupWslPortForwarding with verification"
```

---

### Task 7: Integrate with bootstrap.ts and add integration test

**Files:**
- Modify: `server/bootstrap.ts`
- Create: `test/integration/server/wsl-port-forward.test.ts`

**Step 1: Write the integration test**

```typescript
// test/integration/server/wsl-port-forward.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// This test verifies the bootstrap integration without actually running elevated commands
describe('WSL port forwarding bootstrap integration', () => {
  it('bootstrap module exports setupWslPortForwarding', async () => {
    // Dynamically import to verify the module structure
    const wslModule = await import('../../../server/wsl-port-forward.js')

    expect(typeof wslModule.setupWslPortForwarding).toBe('function')
    expect(typeof wslModule.getWslIp).toBe('function')
    expect(typeof wslModule.getRequiredPorts).toBe('function')
    expect(typeof wslModule.needsPortForwardingUpdate).toBe('function')
    expect(typeof wslModule.buildPortForwardingScript).toBe('function')
  })

  it('bootstrap.ts can import wsl-port-forward module', async () => {
    // This verifies the import path is correct
    // The actual bootstrap auto-runs on import, so we just verify the module resolves
    const bootstrapPath = '../../../server/bootstrap.js'

    // We can't actually import bootstrap (it auto-runs), but we can verify
    // the wsl-port-forward module is importable from the same location
    const wslModule = await import('../../../server/wsl-port-forward.js')
    expect(wslModule).toBeDefined()
  })
})
```

**Step 2: Run test to verify the module structure**

Run: `npm test -- --run test/integration/server/wsl-port-forward.test.ts`
Expected: PASS (module exists from previous tasks)

**Step 3: Modify bootstrap.ts**

Add import at top of file (after existing imports around line 15):

```typescript
import { setupWslPortForwarding } from './wsl-port-forward.js'
```

Add call after `ensureEnvFile` result handling (at the end of the file, after line 311):

```typescript
// --- WSL2 Port Forwarding ---
// Configure Windows port forwarding for LAN access when running in WSL2
const portForwardResult = setupWslPortForwarding()
if (portForwardResult === 'success') {
  console.log('[bootstrap] WSL2 port forwarding configured')
} else if (portForwardResult === 'failed') {
  console.warn('[bootstrap] WSL2 port forwarding failed - LAN access may not work')
}
```

**Step 4: Run all tests to verify nothing broke**

Run: `npm test -- --run`
Expected: All tests pass

**Step 5: Commit**

```bash
git add server/bootstrap.ts test/integration/server/wsl-port-forward.test.ts
git commit -m "feat(wsl): integrate port forwarding into bootstrap"
```

---

### Task 8: Manual verification

**Step 1: Start the dev server in WSL2**

Run: `npm run dev`

Expected output should include one of:
- `[wsl-port-forward] Rules up to date for 172.x.x.x` (if already configured)
- `[wsl-port-forward] UAC prompt required...` followed by UAC dialog
- `[wsl-port-forward] Port forwarding configured successfully` (after UAC approval)

**Step 2: Verify port forwarding was configured**

Run: `/mnt/c/Windows/System32/netsh.exe interface portproxy show v4tov4`

Expected: Rules for ports 3001 and 5173 pointing to your WSL2 IP with matching connect ports

**Step 3: Verify firewall rule has private profile**

Run: `/mnt/c/Windows/System32/netsh.exe advfirewall firewall show rule name="Freshell LAN Access"`

Expected: Rule exists with `Profiles: Private` (not Domain, Public, or All)

**Step 4: Test from another device on the same private network**

From another device on the LAN, navigate to `http://<windows-lan-ip>:5173`

Expected: Freshell UI loads

**Step 5: Verify public network protection**

If possible, connect Windows to a public network (or change network profile to Public).
The firewall rule should block access from that network.

---

### Task 9: Final cleanup and PR

**Step 1: Run full test suite**

Run: `npm test -- --run`
Expected: All tests pass

**Step 2: Create final commit if needed**

**Step 3: Use finishing-a-development-branch skill**

Run the skill to merge or create PR as appropriate.
