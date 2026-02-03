import type { AppSettings } from '@/store/types'
import type { PaneContentInput } from '@/store/paneTypes'

export function buildDefaultPaneContent(settings: AppSettings): PaneContentInput {
  const defaultNewPane = settings.panes?.defaultNewPane ?? 'ask'

  if (defaultNewPane === 'ask') {
    return { kind: 'picker' }
  }

  if (defaultNewPane === 'browser') {
    return { kind: 'browser', url: '', devToolsOpen: false }
  }

  if (defaultNewPane === 'editor') {
    return {
      kind: 'editor',
      filePath: null,
      language: null,
      readOnly: false,
      content: '',
      viewMode: 'source',
    }
  }

  return {
    kind: 'terminal',
    mode: 'shell',
    shell: 'system',
    initialCwd: settings.defaultCwd,
  }
}
