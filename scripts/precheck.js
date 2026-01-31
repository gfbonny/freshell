#!/usr/bin/env node

/**
 * Pre-flight check before starting dev server.
 * Detects if another freshell instance is already running on the configured ports.
 *
 * This prevents confusing scenarios where:
 * - A ghost process from a crashed dev server is still holding the port
 * - Another freshell is running in a different terminal or worktree
 * - A freshell instance is running in WSL (which appears as Windows IP Helper service)
 *
 * Detection approach:
 * - Server: Check /api/health for {"app": "freshell"} response
 * - Vite: Check index page for "freshell" or "@vite/client" markers
 *
 * Timeouts and connection resets are treated as "free" since they usually indicate
 * Windows networking services (like IP Helper for WSL) that won't block Vite from binding.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')

/**
 * Check if node_modules is missing required dependencies from package.json.
 * Returns list of missing packages.
 */
function checkMissingDependencies() {
  const missing = []
  try {
    const pkgPath = resolve(rootDir, 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    }

    for (const dep of Object.keys(allDeps)) {
      const depPath = resolve(rootDir, 'node_modules', dep)
      if (!existsSync(depPath)) {
        missing.push(dep)
      }
    }
  } catch {
    // If we can't read package.json, skip this check
  }
  return missing
}

// Load .env file manually (dotenv not available at this stage)
function loadEnv() {
  try {
    const envPath = resolve(__dirname, '..', '.env')
    const content = readFileSync(envPath, 'utf-8')
    const env = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const match = trimmed.match(/^([^=]+)=(.*)$/)
      if (match) {
        env[match[1]] = match[2]
      }
    }
    return env
  } catch {
    return {}
  }
}

const env = loadEnv()
const VITE_PORT = parseInt(env.VITE_PORT || '5173', 10)
const SERVER_PORT = parseInt(env.PORT || '3001', 10)

/**
 * Check if freshell server is running on a port via /api/health endpoint.
 */
async function checkServerPort(port) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)

    const res = await fetch(`http://localhost:${port}/api/health`, {
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (res.ok) {
      const data = await res.json()
      if (data.app === 'freshell') {
        return { status: 'freshell', data }
      }
      return { status: 'other' }
    }
    return { status: 'other' }
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.cause?.code === 'ECONNREFUSED') {
      return { status: 'free' }
    }
    // Timeout or reset: likely nothing useful (e.g., WSL networking via IP Helper)
    if (err.name === 'AbortError') {
      return { status: 'free' }
    }
    if (err.code === 'ECONNRESET' || err.cause?.code === 'ECONNRESET') {
      return { status: 'free' }
    }
    return { status: 'other' }
  }
}

/**
 * Check if freshell Vite dev server is running by looking for markers in the index page.
 */
async function checkVitePort() {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)

    const res = await fetch(`http://localhost:${VITE_PORT}/`, {
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const text = await res.text()
    if (text.includes('freshell') || text.includes('@vite/client')) {
      return { status: 'freshell' }
    }
    return { status: 'other' }
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.cause?.code === 'ECONNREFUSED') {
      return { status: 'free' }
    }
    // Timeout or reset: likely nothing useful (e.g., WSL networking via IP Helper)
    if (err.name === 'AbortError') {
      return { status: 'free' }
    }
    if (err.code === 'ECONNRESET' || err.cause?.code === 'ECONNRESET') {
      return { status: 'free' }
    }
    return { status: 'other' }
  }
}

async function main() {
  // Check for missing dependencies first
  const missingDeps = checkMissingDependencies()
  if (missingDeps.length > 0) {
    console.error('\n\x1b[31m✖ Missing dependencies detected:\x1b[0m\n')
    missingDeps.slice(0, 10).forEach(dep => console.error(`  • ${dep}`))
    if (missingDeps.length > 10) {
      console.error(`  • ... and ${missingDeps.length - 10} more`)
    }
    console.error('\n\x1b[33mTo fix:\x1b[0m')
    console.error('  npm install\n')
    process.exit(1)
  }

  const [serverCheck, viteCheck] = await Promise.all([
    checkServerPort(SERVER_PORT),
    checkVitePort(),
  ])

  const issues = []

  if (serverCheck.status === 'freshell') {
    issues.push(`Port ${SERVER_PORT}: Another freshell server is already running`)
  } else if (serverCheck.status === 'other') {
    issues.push(`Port ${SERVER_PORT}: Something else is using this port`)
  }

  if (viteCheck.status === 'freshell') {
    issues.push(`Port ${VITE_PORT}: Another freshell dev server is already running`)
  } else if (viteCheck.status === 'other') {
    issues.push(`Port ${VITE_PORT}: Something else is using this port`)
  }

  if (issues.length > 0) {
    console.error('\n\x1b[31m✖ Cannot start freshell:\x1b[0m\n')
    issues.forEach(issue => console.error(`  • ${issue}`))
    console.error('\n\x1b[33mTo fix:\x1b[0m')
    console.error('  1. Close the other freshell instance, or')
    console.error('  2. Find and kill the process:')
    console.error('     Windows:  netstat -ano | findstr :5173')
    console.error('               taskkill /F /PID <pid>')
    console.error('     WSL:      wsl --list --running')
    console.error('               wsl --terminate <distro>')
    console.error('     Unix:     lsof -i :5173 && kill <pid>\n')
    process.exit(1)
  }

  // All clear
  process.exit(0)
}

main()
