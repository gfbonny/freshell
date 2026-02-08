export type TerminalShortcutEvent = Pick<KeyboardEvent,
  'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'type' | 'repeat'>

export function isTerminalPasteShortcut(event: TerminalShortcutEvent): boolean {
  if (event.type !== 'keydown') return false

  const keyV = event.key === 'v' || event.key === 'V' || event.code === 'KeyV'
  const ctrlV = keyV && event.ctrlKey && !event.altKey
  const metaV = keyV && event.metaKey
  const shiftInsert = event.shiftKey && (event.code === 'Insert' || event.key === 'Insert')

  return ctrlV || metaV || shiftInsert
}
