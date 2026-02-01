import { describe, it, expect } from 'vitest'
import { StartupState, createStartupState, STARTUP_TASKS } from '../../../server/startup-state.js'

describe('StartupState', () => {
  it('starts not ready when tasks are pending', () => {
    const state = new StartupState(['alpha', 'beta'] as const)

    expect(state.isReady()).toBe(false)
    expect(state.snapshot()).toEqual({
      ready: false,
      tasks: {
        alpha: false,
        beta: false,
      },
    })
  })

  it('becomes ready after all tasks are marked ready', () => {
    const state = new StartupState(['alpha', 'beta'] as const)

    state.markReady('alpha')
    expect(state.isReady()).toBe(false)

    state.markReady('beta')
    expect(state.isReady()).toBe(true)
    expect(state.snapshot().tasks).toEqual({
      alpha: true,
      beta: true,
    })
  })

  it('throws when marking an unknown task', () => {
    const state = new StartupState(['alpha'] as const)

    expect(() => state.markReady('beta' as any)).toThrow(/unknown task/i)
  })

  it('createStartupState includes required startup tasks', () => {
    const state = createStartupState()
    const tasks = Object.keys(state.snapshot().tasks).sort()

    expect(tasks).toEqual([...STARTUP_TASKS].sort())
  })
})
