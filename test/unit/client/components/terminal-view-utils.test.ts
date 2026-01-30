import { describe, it, expect } from 'vitest'
import type { TerminalPaneContent } from '@/store/paneTypes'
import { getResumeSessionIdFromRef } from '@/components/terminal-view-utils'

describe('terminal-view-utils', () => {
  it('reads the latest resumeSessionId from the ref', () => {
    const ref: { current: TerminalPaneContent | null } = {
      current: {
        kind: 'terminal',
        createRequestId: 'req-1',
        status: 'running',
        mode: 'claude',
        shell: 'system',
        resumeSessionId: 'old-session',
        initialCwd: '/home/user/project',
      },
    }

    expect(getResumeSessionIdFromRef(ref)).toBe('old-session')

    ref.current = {
      ...ref.current,
      resumeSessionId: 'new-session',
    }

    expect(getResumeSessionIdFromRef(ref)).toBe('new-session')
  })
})
