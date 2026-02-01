import { describe, it, expect, vi } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { ClaudeSessionIndexer, parseSessionContent } from '../../../server/claude-indexer'
import { configStore } from '../../../server/config-store'

describe('ClaudeSessionIndexer createdAt', () => {
  it('derives createdAt from the earliest JSONL timestamp', () => {
    const content = [
      JSON.stringify({
        type: 'system',
        timestamp: '2025-01-01T00:00:00.000Z',
        cwd: '/tmp',
      }),
      JSON.stringify({
        type: 'user',
        timestamp: '2025-01-01T00:00:05.000Z',
        cwd: '/tmp',
      }),
    ].join('\n')

    const meta = parseSessionContent(content)
    expect(meta.createdAt).toBe(Date.parse('2025-01-01T00:00:00.000Z'))
  })

  it('uses JSONL-createdAt when indexing sessions', async () => {
    const originalClaudeHome = process.env.CLAUDE_HOME
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-created-at-'))
    const claudeHome = path.join(tempDir, '.claude')
    const projectDir = path.join(claudeHome, 'projects', 'project-a')
    const sessionFile = path.join(projectDir, 'session-1.jsonl')
    await fs.mkdir(projectDir, { recursive: true })

    process.env.CLAUDE_HOME = claudeHome

    vi.spyOn(configStore, 'snapshot').mockResolvedValue({
      version: 1,
      settings: {},
      sessionOverrides: {},
      terminalOverrides: {},
      projectColors: {},
    } as any)
    vi.spyOn(configStore, 'getProjectColors').mockResolvedValue({})

    await fs.writeFile(
      sessionFile,
      [
        '{"cwd":"/tmp","timestamp":"2025-01-02T00:00:00.000Z"}',
        '{"cwd":"/tmp","timestamp":"2025-01-02T00:00:05.000Z"}',
      ].join('\n')
    )

    const indexer = new ClaudeSessionIndexer()
    await indexer.refresh()

    const session = indexer.getProjects()[0].sessions[0]
    expect(session.createdAt).toBe(Date.parse('2025-01-02T00:00:00.000Z'))

    if (originalClaudeHome === undefined) {
      delete process.env.CLAUDE_HOME
    } else {
      process.env.CLAUDE_HOME = originalClaudeHome
    }
    vi.restoreAllMocks()
    await fs.rm(tempDir, { recursive: true, force: true })
  })
})
