#!/usr/bin/env tsx

/**
 * Pre-build guard: prevents building over a live production dist/.
 *
 * Checks if a Freshell production server is running on the configured port.
 * If so, blocks the build and suggests safe alternatives.
 */

export interface ProdCheckResult {
  status: 'running' | 'not-running'
  version?: string
}

export async function checkProdRunning(_port: number): Promise<ProdCheckResult> {
  throw new Error('Not implemented')
}

export async function main(): Promise<void> {
  throw new Error('Not implemented')
}

// Only run when executed directly (not imported by tests)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main()
}
