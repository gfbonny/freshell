import { describe, it, expect } from 'vitest'
import { createLogger, withLogContext } from '../../../server/logger'

function createCaptureLogger() {
  const entries: Record<string, unknown>[] = []
  const stream = {
    write(chunk: string) {
      const line = chunk.toString().trim()
      if (!line) return
      entries.push(JSON.parse(line))
    },
  }

  const log = createLogger(stream)

  return { log, entries }
}

describe('log context', () => {
  it('includes request context fields in log output', () => {
    const { log, entries } = createCaptureLogger()

    withLogContext(
      {
        requestId: 'req-123',
        requestPath: '/api/test',
        requestMethod: 'GET',
      },
      () => {
        log.info({ event: 'test_log' }, 'hello')
      },
    )

    expect(entries).toHaveLength(1)
    expect(entries[0].requestId).toBe('req-123')
    expect(entries[0].requestPath).toBe('/api/test')
    expect(entries[0].requestMethod).toBe('GET')
  })

  it('does not leak fields between log calls when no log context is set', () => {
    const { log, entries } = createCaptureLogger()

    log.info({ a: 1 }, 'first')
    log.info({ b: 2 }, 'second')

    expect(entries).toHaveLength(2)
    expect(entries[0].a).toBe(1)
    expect(entries[0].b).toBeUndefined()
    expect(entries[1].a).toBeUndefined()
    expect(entries[1].b).toBe(2)
  })

  it('does not leak fields between log calls within the same log context', () => {
    const { log, entries } = createCaptureLogger()

    withLogContext(
      {
        requestId: 'req-123',
        requestPath: '/api/test',
        requestMethod: 'GET',
      },
      () => {
        log.info({ event: 'one', extra: 1 }, 'one')
        log.info({ event: 'two' }, 'two')
      },
    )

    expect(entries).toHaveLength(2)
    expect(entries[0].requestId).toBe('req-123')
    expect(entries[0].extra).toBe(1)
    expect(entries[1].requestId).toBe('req-123')
    expect(entries[1].extra).toBeUndefined()
  })
})
