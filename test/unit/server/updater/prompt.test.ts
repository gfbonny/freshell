// test/unit/server/updater/prompt.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as readline from 'readline'
import { formatUpdateBanner, promptForUpdate } from '../../../../server/updater/prompt.js'

// Mock readline module
vi.mock('readline')

describe('formatUpdateBanner', () => {
  it('contains "new Freshell" in the output', () => {
    const banner = formatUpdateBanner('1.0.0', '2.0.0')
    expect(banner).toContain('new Freshell')
  })

  it('contains the current version string', () => {
    const banner = formatUpdateBanner('1.2.3', '2.0.0')
    expect(banner).toContain('1.2.3')
  })

  it('contains the latest version string', () => {
    const banner = formatUpdateBanner('1.0.0', '2.5.0')
    expect(banner).toContain('2.5.0')
  })

  it('contains both version strings in a single banner', () => {
    const banner = formatUpdateBanner('0.1.0', '0.2.0')
    expect(banner).toContain('0.1.0')
    expect(banner).toContain('0.2.0')
  })

  it('includes an arrow between versions', () => {
    const banner = formatUpdateBanner('1.0.0', '2.0.0')
    // The arrow should indicate upgrade direction
    expect(banner).toMatch(/1\.0\.0.*→.*2\.0\.0/)
  })

  it('handles longer version strings gracefully', () => {
    const banner = formatUpdateBanner('10.20.30', '100.200.300')
    expect(banner).toContain('10.20.30')
    expect(banner).toContain('100.200.300')
    expect(banner).toContain('new Freshell')
  })

  it('produces a multiline banner with box drawing characters', () => {
    const banner = formatUpdateBanner('1.0.0', '2.0.0')
    // Should have top-left and bottom-left corner characters
    expect(banner).toContain('╭')
    expect(banner).toContain('╰')
  })
})

describe('promptForUpdate', () => {
  let mockRl: {
    question: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
  }
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockRl = {
      question: vi.fn(),
      close: vi.fn()
    }
    vi.mocked(readline.createInterface).mockReturnValue(mockRl as unknown as readline.Interface)
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true for empty input (default yes)', async () => {
    mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
      callback('')
    })

    const result = await promptForUpdate('1.0.0', '2.0.0')
    expect(result).toBe(true)
    expect(mockRl.close).toHaveBeenCalled()
  })

  it('returns true for "Y" input', async () => {
    mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
      callback('Y')
    })

    const result = await promptForUpdate('1.0.0', '2.0.0')
    expect(result).toBe(true)
  })

  it('returns true for "y" input', async () => {
    mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
      callback('y')
    })

    const result = await promptForUpdate('1.0.0', '2.0.0')
    expect(result).toBe(true)
  })

  it('returns true for "yes" input', async () => {
    mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
      callback('yes')
    })

    const result = await promptForUpdate('1.0.0', '2.0.0')
    expect(result).toBe(true)
  })

  it('returns true for "YES" input', async () => {
    mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
      callback('YES')
    })

    const result = await promptForUpdate('1.0.0', '2.0.0')
    expect(result).toBe(true)
  })

  it('returns false for "n" input', async () => {
    mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
      callback('n')
    })

    const result = await promptForUpdate('1.0.0', '2.0.0')
    expect(result).toBe(false)
  })

  it('returns false for "N" input', async () => {
    mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
      callback('N')
    })

    const result = await promptForUpdate('1.0.0', '2.0.0')
    expect(result).toBe(false)
  })

  it('returns false for "no" input', async () => {
    mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
      callback('no')
    })

    const result = await promptForUpdate('1.0.0', '2.0.0')
    expect(result).toBe(false)
  })

  it('returns false for "NO" input', async () => {
    mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
      callback('NO')
    })

    const result = await promptForUpdate('1.0.0', '2.0.0')
    expect(result).toBe(false)
  })

  it('displays the update banner before prompting', async () => {
    mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
      callback('y')
    })

    await promptForUpdate('1.0.0', '2.0.0')

    expect(consoleLogSpy).toHaveBeenCalled()
    const loggedContent = consoleLogSpy.mock.calls[0][0]
    expect(loggedContent).toContain('new Freshell')
    expect(loggedContent).toContain('1.0.0')
    expect(loggedContent).toContain('2.0.0')
  })

  it('handles input with leading/trailing whitespace', async () => {
    mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
      callback('  y  ')
    })

    const result = await promptForUpdate('1.0.0', '2.0.0')
    expect(result).toBe(true)
  })

  it('returns false for unexpected input', async () => {
    mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
      callback('maybe')
    })

    const result = await promptForUpdate('1.0.0', '2.0.0')
    expect(result).toBe(false)
  })
})
