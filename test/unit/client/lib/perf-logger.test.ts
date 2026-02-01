import { describe, it, expect } from 'vitest'
import { resolveClientPerfConfig, getClientPerfConfig, setClientPerfEnabled } from '@/lib/perf-logger'

describe('client perf logger config', () => {
  it('defaults to disabled', () => {
    const cfg = resolveClientPerfConfig(undefined)
    expect(cfg.enabled).toBe(false)
  })

  it('enables when flag is set', () => {
    const cfg = resolveClientPerfConfig('true')
    expect(cfg.enabled).toBe(true)
  })

  it('can toggle at runtime', () => {
    const cfg = getClientPerfConfig()
    setClientPerfEnabled(true, 'test')
    expect(cfg.enabled).toBe(true)
    setClientPerfEnabled(false, 'test')
    expect(cfg.enabled).toBe(false)
  })
})
