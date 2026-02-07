import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function readSource(relFromThisTest: string): string {
  const url = new URL(relFromThisTest, import.meta.url)
  return fs.readFileSync(fileURLToPath(url), 'utf8')
}

describe('Client entrypoint', () => {
  it('does not use React.StrictMode (xterm double-mount breaks)', () => {
    const src = readSource('../../../src/main.tsx')
    expect(src).not.toMatch(/React\\.StrictMode/)
  })

  it('initializes client perf logging at bootstrap', () => {
    const src = readSource('../../../src/main.tsx')
    expect(src).toMatch(/initClientPerfLogging/)
    expect(src).toMatch(/initClientPerfLogging\(\)/)
  })
})
