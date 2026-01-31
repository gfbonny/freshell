/**
 * Repair all corrupted Claude session files.
 * Run with: npx tsx scripts/repair-all.ts
 */

import { createSessionScanner } from '../server/session-scanner/scanner.js'
import { glob } from 'glob'
import path from 'path'
import os from 'os'

async function main() {
  const scanner = createSessionScanner()
  const claudeDir = path.join(os.homedir(), '.claude', 'projects')

  console.log('Scanning Claude sessions in:', claudeDir)

  // Find all .jsonl files (excluding subagents)
  const files = await glob('**/*.jsonl', {
    cwd: claudeDir,
    absolute: true,
    ignore: ['**/subagents/**']
  })

  console.log(`Found ${files.length} session files`)
  console.log('')

  let repairedCount = 0
  let alreadyHealthyCount = 0
  let failedCount = 0

  for (const file of files) {
    const scanResult = await scanner.scan(file)

    if (scanResult.status === 'corrupted') {
      const sessionId = path.basename(file, '.jsonl')
      console.log(`Repairing ${sessionId.slice(0, 8)}... (${scanResult.orphanCount} orphans)`)

      const repairResult = await scanner.repair(file)

      if (repairResult.status === 'repaired') {
        console.log(`  ✓ Fixed ${repairResult.orphansFixed} orphans, chain depth: ${repairResult.newChainDepth}`)
        repairedCount++
      } else if (repairResult.status === 'failed') {
        console.log(`  ✗ Failed: ${repairResult.error}`)
        failedCount++
      }
    } else if (scanResult.status === 'healthy') {
      alreadyHealthyCount++
    }
  }

  console.log('')
  console.log('=== Summary ===')
  console.log(`Already healthy: ${alreadyHealthyCount}`)
  console.log(`Repaired: ${repairedCount}`)
  console.log(`Failed: ${failedCount}`)
}

main().catch(console.error)
