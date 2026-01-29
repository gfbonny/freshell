import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MessageBubble } from '../../../../../src/components/claude/MessageBubble'
import type { MessageEvent } from '../../../../../src/lib/claude-types'

afterEach(() => cleanup())

describe('MessageBubble', () => {
  it('renders text content', () => {
    const event: MessageEvent = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello, world!' }],
      },
      session_id: 'abc',
      uuid: '123',
    }

    render(<MessageBubble event={event} />)
    expect(screen.getByText('Hello, world!')).toBeInTheDocument()
  })

  it('renders multiple text blocks', () => {
    const event: MessageEvent = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'First paragraph' },
          { type: 'text', text: 'Second paragraph' },
        ],
      },
      session_id: 'abc',
      uuid: '123',
    }

    render(<MessageBubble event={event} />)
    expect(screen.getByText('First paragraph')).toBeInTheDocument()
    expect(screen.getByText('Second paragraph')).toBeInTheDocument()
  })

  it('renders tool_use blocks', () => {
    const event: MessageEvent = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'Bash',
            input: { command: 'ls -la' },
          },
        ],
      },
      session_id: 'abc',
      uuid: '123',
    }

    render(<MessageBubble event={event} />)
    expect(screen.getByText('Bash')).toBeInTheDocument()
    expect(screen.getByText(/ls -la/)).toBeInTheDocument()
  })

  it('applies assistant styling for assistant messages', () => {
    const event: MessageEvent = {
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
      session_id: 'abc',
      uuid: '123',
    }

    const { container } = render(<MessageBubble event={event} />)
    expect(container.firstChild).toHaveClass('bg-muted')
  })

  it('applies user styling for user messages', () => {
    const event: MessageEvent = {
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      session_id: 'abc',
      uuid: '123',
    }

    const { container } = render(<MessageBubble event={event} />)
    expect(container.firstChild).toHaveClass('bg-primary')
  })
})
