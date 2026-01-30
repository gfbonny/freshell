type AnySettings = Record<string, any>

export function migrateSettingsSortMode<T extends AnySettings | null | undefined>(settings: T): T {
  if (!settings || typeof settings !== 'object') {
    return settings
  }

  const sidebar = (settings as AnySettings).sidebar
  if (!sidebar || typeof sidebar !== 'object') {
    return settings
  }

  if (sidebar.sortMode !== 'hybrid') {
    return settings
  }

  return {
    ...settings,
    sidebar: {
      ...sidebar,
      sortMode: 'activity',
    },
  } as T
}
