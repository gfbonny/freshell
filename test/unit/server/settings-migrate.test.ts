import { describe, it, expect } from 'vitest'
import { migrateSettingsSortMode } from '../../../server/settings-migrate'

describe('migrateSettingsSortMode', () => {
  it('converts hybrid sortMode to activity', () => {
    const settings = { sidebar: { sortMode: 'hybrid' } }

    const migrated = migrateSettingsSortMode(settings)

    expect(migrated.sidebar.sortMode).toBe('activity')
    expect(settings.sidebar.sortMode).toBe('hybrid')
  })

  it('preserves valid sort modes', () => {
    const settings = { sidebar: { sortMode: 'recency' } }

    const migrated = migrateSettingsSortMode(settings)

    expect(migrated.sidebar.sortMode).toBe('recency')
  })

  it('preserves recency-pinned sort mode', () => {
    const settings = { sidebar: { sortMode: 'recency-pinned' } }

    const migrated = migrateSettingsSortMode(settings)

    expect(migrated.sidebar.sortMode).toBe('recency-pinned')
  })

  it('handles missing or invalid sidebar safely', () => {
    expect(migrateSettingsSortMode(undefined as any)).toBeUndefined()
    expect(migrateSettingsSortMode(null as any)).toBeNull()
    expect(migrateSettingsSortMode({})).toEqual({})
    expect(migrateSettingsSortMode({ sidebar: null })).toEqual({ sidebar: null })
  })
})
