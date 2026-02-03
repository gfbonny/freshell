import type { PaneContent } from '@/store/paneTypes'
import { getProviderLabel, isCodingCliMode } from '@/lib/coding-cli-utils'

/**
 * Derives a default title for a pane based on its content.
 * For terminals: based on mode and shell type.
 * For browsers: based on URL hostname.
 */
export function derivePaneTitle(content: PaneContent): string {
  if (content.kind === 'picker') {
    return 'New Tab'
  }

  if (content.kind === 'session') {
    if (content.title) return content.title
    if (content.provider) return getProviderLabel(content.provider)
    return 'Session'
  }

  if (content.kind === 'browser') {
    if (!content.url) return 'Browser'
    try {
      const url = new URL(content.url)
      return url.hostname || 'Browser'
    } catch {
      return 'Browser'
    }
  }

  if (content.kind === 'editor') {
    if (!content.filePath) return 'Editor'
    const normalized = content.filePath.replace(/\\/g, '/')
    const segments = normalized.split('/')
    return segments[segments.length - 1] || 'Editor'
  }

  // Terminal content
  if (isCodingCliMode(content.mode)) {
    return getProviderLabel(content.mode)
  }

  // Shell mode - use shell type if specified
  if (content.shell) {
    switch (content.shell) {
      case 'powershell':
        return 'PowerShell'
      case 'cmd':
        return 'Command Prompt'
      case 'wsl':
        return 'WSL'
      case 'system':
      default:
        return 'Shell'
    }
  }

  return 'Shell'
}
