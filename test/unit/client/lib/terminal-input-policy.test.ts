import { describe, expect, it } from 'vitest'
import { isTerminalPasteShortcut } from '@/lib/terminal-input-policy'

function e(partial: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: '',
    code: '',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    repeat: false,
    type: 'keydown',
    ...partial,
  } as KeyboardEvent
}

describe('isTerminalPasteShortcut', () => {
  it('matches Ctrl+V', () => {
    expect(isTerminalPasteShortcut(e({ ctrlKey: true, key: 'v', code: 'KeyV' }))).toBe(true)
  })

  it('matches Ctrl+Shift+V', () => {
    expect(isTerminalPasteShortcut(e({ ctrlKey: true, shiftKey: true, key: 'V', code: 'KeyV' }))).toBe(true)
  })

  it('matches Meta+V (macOS)', () => {
    expect(isTerminalPasteShortcut(e({ metaKey: true, key: 'v', code: 'KeyV' }))).toBe(true)
  })

  it('matches Meta+Alt+V variants used on macOS', () => {
    expect(isTerminalPasteShortcut(e({ metaKey: true, altKey: true, key: 'v', code: 'KeyV' }))).toBe(true)
    expect(isTerminalPasteShortcut(e({ metaKey: true, altKey: true, shiftKey: true, key: 'V', code: 'KeyV' }))).toBe(true)
  })

  it('matches Shift+Insert', () => {
    expect(isTerminalPasteShortcut(e({ shiftKey: true, key: 'Insert', code: 'Insert' }))).toBe(true)
  })

  it('matches Shift+Insert when only key is reliable', () => {
    expect(isTerminalPasteShortcut(e({ shiftKey: true, key: 'Insert', code: 'Numpad0' }))).toBe(true)
  })

  it('does not match Ctrl+Alt+V (AltGr composition)', () => {
    expect(isTerminalPasteShortcut(e({ ctrlKey: true, altKey: true, key: 'v', code: 'KeyV' }))).toBe(false)
  })

  it('ignores non-keydown', () => {
    expect(isTerminalPasteShortcut(e({ ctrlKey: true, key: 'v', code: 'KeyV', type: 'keyup' }))).toBe(false)
  })

  it('matches repeated keydown shortcuts to keep xterm translation blocked', () => {
    expect(isTerminalPasteShortcut(e({ ctrlKey: true, key: 'v', code: 'KeyV', repeat: true }))).toBe(true)
    expect(isTerminalPasteShortcut(e({ metaKey: true, key: 'v', code: 'KeyV', repeat: true }))).toBe(true)
  })
})
