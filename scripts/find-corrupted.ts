/**
 * Quick script to find corrupted Claude session files.
 * Run with: npx tsx scripts/find-corrupted.ts
 */

import { createSessionScanner } from '../server/session-scanner/scanner.js'
import { glob } from 'glob'
import path from 'path'
import os from 'os'

async function main() {
  const scanner = createSessionScanner()
  const claudeDir = path.join(os.homedir(), '.claude', 'projects')

  console.log('Scanning Claude sessions in:', claudeDir)

  // Find all .jsonl files
  const files = await glob('**/*.jsonl', {
    cwd: claudeDir,
    absolute: true,
    ignore: ['**/subagents/**'] // Skip subagent files for now
  })

  console.log(`Found ${files.length} session files`)
  console.log('')

  const corrupted: Array<{ path: string; orphans: number; messages: number; size: number }> = []

  for (const file of files) {
    const result = await scanner.scan(file)
    if (result.status === 'corrupted') {
      corrupted.push({
        path: file,
        orphans: result.orphanCount,
        messages: result.messageCount,
        size: result.fileSize,
      })
    }
  }

  console.log(`Found ${corrupted.length} corrupted sessions:`)
  console.log('')

  // Sort by size (prefer smaller files for testing)
  corrupted.sort((a, b) => a.size - b.size)

  for (const c of corrupted.slice(0, 20)) {
    console.log(`${c.path}`)
    console.log(`  Size: ${c.size} bytes, Messages: ${c.messages}, Orphans: ${c.orphans}`)
    console.log('')
  }
}

main().catch(console.error)
