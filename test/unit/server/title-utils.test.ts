import { describe, it, expect } from 'vitest'
import { extractTitleFromMessage, extractTitleFromJsonlObject } from '../../../server/title-utils'

describe('title-utils', () => {
  describe('extractTitleFromMessage', () => {
    it('returns content unchanged if shorter than maxLen', () => {
      const result = extractTitleFromMessage('Hello world', 50)
      expect(result).toBe('Hello world')
    })

    it('truncates content to maxLen if longer', () => {
      const result = extractTitleFromMessage('A'.repeat(100), 50)
      expect(result).toBe('A'.repeat(50))
      expect(result.length).toBe(50)
    })

    it('uses default maxLen of 50', () => {
      const result = extractTitleFromMessage('A'.repeat(100))
      expect(result.length).toBe(50)
    })

    it('collapses whitespace', () => {
      const result = extractTitleFromMessage('  Multiple   spaces   here  ')
      expect(result).toBe('Multiple spaces here')
    })

    it('trims leading and trailing whitespace', () => {
      const result = extractTitleFromMessage('  trimmed  ')
      expect(result).toBe('trimmed')
    })

    it('handles empty string', () => {
      const result = extractTitleFromMessage('')
      expect(result).toBe('')
    })

    it('handles string with only whitespace', () => {
      const result = extractTitleFromMessage('   ')
      expect(result).toBe('')
    })

    it('respects custom maxLen', () => {
      const result = extractTitleFromMessage('A'.repeat(300), 200)
      expect(result.length).toBe(200)
    })
  })

  describe('extractTitleFromJsonlObject', () => {
    it('extracts title from explicit title field', () => {
      const result = extractTitleFromJsonlObject({ title: 'My Title' })
      expect(result).toBe('My Title')
    })

    it('extracts title from sessionTitle field', () => {
      const result = extractTitleFromJsonlObject({ sessionTitle: 'Session Title' })
      expect(result).toBe('Session Title')
    })

    it('extracts title from user message content', () => {
      const result = extractTitleFromJsonlObject({ role: 'user', content: 'User prompt here' })
      expect(result).toBe('User prompt here')
    })

    it('extracts title from nested message.role user', () => {
      const result = extractTitleFromJsonlObject({
        message: { role: 'user', content: 'Nested user content' },
      })
      expect(result).toBe('Nested user content')
    })

    it('returns undefined for assistant messages', () => {
      const result = extractTitleFromJsonlObject({ role: 'assistant', content: 'Response' })
      expect(result).toBeUndefined()
    })

    it('returns undefined for empty object', () => {
      const result = extractTitleFromJsonlObject({})
      expect(result).toBeUndefined()
    })

    it('returns undefined for null', () => {
      const result = extractTitleFromJsonlObject(null)
      expect(result).toBeUndefined()
    })

    it('returns undefined for undefined', () => {
      const result = extractTitleFromJsonlObject(undefined)
      expect(result).toBeUndefined()
    })

    it('prefers explicit title over user content', () => {
      const result = extractTitleFromJsonlObject({
        title: 'Explicit Title',
        role: 'user',
        content: 'User content',
      })
      expect(result).toBe('Explicit Title')
    })

    it('truncates long titles', () => {
      const result = extractTitleFromJsonlObject({ title: 'A'.repeat(100) }, 50)
      expect(result?.length).toBe(50)
    })

    it('ignores empty title strings', () => {
      const result = extractTitleFromJsonlObject({
        title: '   ',
        role: 'user',
        content: 'Fallback content',
      })
      expect(result).toBe('Fallback content')
    })
  })
})
