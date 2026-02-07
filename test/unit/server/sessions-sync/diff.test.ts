import { describe, it, expect } from 'vitest'
import type { ProjectGroup } from '../../../../server/coding-cli/types.js'
import { diffProjects } from '../../../../server/sessions-sync/diff.js'

function pg(projectPath: string, sessions: ProjectGroup['sessions'], color?: string): ProjectGroup {
  return { projectPath, sessions, ...(color ? { color } : {}) }
}

describe('diffProjects', () => {
  it('upserts newly added projects', () => {
    const prev: ProjectGroup[] = []
    const next: ProjectGroup[] = [
      pg('/p1', [{ provider: 'claude', sessionId: 's1', projectPath: '/p1', updatedAt: 1 }]),
    ]

    const diff = diffProjects(prev, next)
    expect(diff.removeProjectPaths).toEqual([])
    expect(diff.upsertProjects).toEqual(next)
  })

  it('removes deleted projects', () => {
    const prev: ProjectGroup[] = [
      pg('/p1', [{ provider: 'claude', sessionId: 's1', projectPath: '/p1', updatedAt: 1 }]),
      pg('/p2', [{ provider: 'claude', sessionId: 's2', projectPath: '/p2', updatedAt: 2 }]),
    ]
    const next: ProjectGroup[] = [
      pg('/p2', [{ provider: 'claude', sessionId: 's2', projectPath: '/p2', updatedAt: 2 }]),
    ]

    const diff = diffProjects(prev, next)
    expect(diff.removeProjectPaths).toEqual(['/p1'])
    expect(diff.upsertProjects).toEqual([])
  })

  it('upserts projects when a session field changes', () => {
    const prev: ProjectGroup[] = [
      pg('/p1', [{ provider: 'claude', sessionId: 's1', projectPath: '/p1', updatedAt: 1, title: 'Old' }]),
    ]
    const next: ProjectGroup[] = [
      pg('/p1', [{ provider: 'claude', sessionId: 's1', projectPath: '/p1', updatedAt: 1, title: 'New' }]),
    ]

    const diff = diffProjects(prev, next)
    expect(diff.removeProjectPaths).toEqual([])
    expect(diff.upsertProjects).toEqual(next)
  })

  it('does not upsert unchanged projects', () => {
    const prev: ProjectGroup[] = [
      pg('/p1', [{ provider: 'claude', sessionId: 's1', projectPath: '/p1', updatedAt: 1 }], '#aaa'),
    ]
    const next: ProjectGroup[] = [
      pg('/p1', [{ provider: 'claude', sessionId: 's1', projectPath: '/p1', updatedAt: 1 }], '#aaa'),
    ]

    const diff = diffProjects(prev, next)
    expect(diff.removeProjectPaths).toEqual([])
    expect(diff.upsertProjects).toEqual([])
  })
})

