/**
 * Repair a single session file.
 * Run with: npx tsx scripts/repair-one.ts <session-id or path>
 */

import { createSessionScanner } from '../server/session-scanner/scanner.js'
import path from 'path'
import os from 'os'

async function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error('Usage: npx tsx scripts/repair-one.ts <session-id or path>')
    process.exit(1)
  }

  const scanner = createSessionScanner()

  // If it's a UUID, construct the path
  let filePath: string
  if (arg.includes('/') || arg.includes('\\')) {
    filePath = arg
  } else {
    // Look in all project directories
    const claudeDir = path.join(os.homedir(), '.claude', 'projects')
    const { glob } = await import('glob')
    const matches = await glob(`**/${arg}.jsonl`, { cwd: claudeDir, absolute: true })
    if (matches.length === 0) {
      console.error(`Session ${arg} not found`)
      process.exit(1)
    }
    filePath = matches[0]
  }

  console.log('Scanning:', filePath)
  const scanResult = await scanner.scan(filePath)
  console.log('Scan result:', scanResult)

  if (scanResult.status !== 'corrupted') {
    console.log('Session is not corrupted, nothing to repair')
    process.exit(0)
  }

  console.log('')
  console.log('Repairing...')
  const repairResult = await scanner.repair(filePath)
  console.log('Repair result:', repairResult)

  if (repairResult.status === 'repaired') {
    console.log('')
    console.log('Session repaired successfully!')
    console.log('')
    console.log('To resume this session, run:')
    console.log(`  claude --resume ${path.basename(filePath, '.jsonl')}`)
  }
}

main().catch(console.error)
