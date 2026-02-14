import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import MessageBubble from '../../../../../src/components/claude-chat/MessageBubble'
import type { ChatContentBlock } from '@/store/claudeChatTypes'

describe('MessageBubble', () => {
  afterEach(() => {
    cleanup()
  })
  it('renders user text message', () => {
    render(
      <MessageBubble
        role="user"
        content={[{ type: 'text', text: 'Hello world' }]}
      />
    )
    expect(screen.getByText('Hello world')).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'user message' })).toBeInTheDocument()
  })

  it('renders assistant text message with markdown', () => {
    render(
      <MessageBubble
        role="assistant"
        content={[{ type: 'text', text: '**Bold text**' }]}
      />
    )
    expect(screen.getByText('Bold text')).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'assistant message' })).toBeInTheDocument()
  })

  it('renders thinking block as collapsible', () => {
    render(
      <MessageBubble
        role="assistant"
        content={[{ type: 'thinking', thinking: 'Let me think...' }]}
      />
    )
    expect(screen.getByText(/Thinking/)).toBeInTheDocument()
  })

  it('renders tool use block', () => {
    render(
      <MessageBubble
        role="assistant"
        content={[{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls -la' } }]}
      />
    )
    expect(screen.getByText('Bash')).toBeInTheDocument()
  })

  it('renders timestamp and model', () => {
    const timestamp = new Date().toISOString()
    render(
      <MessageBubble
        role="assistant"
        content={[{ type: 'text', text: 'Hi' }]}
        timestamp={timestamp}
        model="claude-sonnet-4-5"
      />
    )
    expect(screen.getByText('claude-sonnet-4-5')).toBeInTheDocument()
  })
})

describe('MessageBubble display toggles', () => {
  afterEach(cleanup)

  const textBlock: ChatContentBlock = { type: 'text', text: 'Hello world' }
  const thinkingBlock: ChatContentBlock = { type: 'thinking', thinking: 'Let me think about this...' }
  const toolUseBlock: ChatContentBlock = { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }
  const toolResultBlock: ChatContentBlock = { type: 'tool_result', tool_use_id: 't1', content: 'file.txt' }

  it('hides thinking blocks when showThinking is false', () => {
    render(
      <MessageBubble
        role="assistant"
        content={[textBlock, thinkingBlock]}
        showThinking={false}
      />
    )
    expect(screen.queryByText(/Let me think/)).not.toBeInTheDocument()
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('shows thinking blocks when showThinking is true', () => {
    render(
      <MessageBubble
        role="assistant"
        content={[thinkingBlock]}
        showThinking={true}
      />
    )
    expect(screen.getByText(/Let me think/)).toBeInTheDocument()
  })

  it('hides tool_use blocks when showTools is false', () => {
    render(
      <MessageBubble
        role="assistant"
        content={[textBlock, toolUseBlock]}
        showTools={false}
      />
    )
    expect(screen.queryByText('Bash')).not.toBeInTheDocument()
  })

  it('hides tool_result blocks when showTools is false', () => {
    render(
      <MessageBubble
        role="assistant"
        content={[textBlock, toolResultBlock]}
        showTools={false}
      />
    )
    expect(screen.queryByText('Result')).not.toBeInTheDocument()
  })

  it('shows timestamp when showTimecodes is true', () => {
    render(
      <MessageBubble
        role="assistant"
        content={[textBlock]}
        timestamp="2026-02-13T10:00:00Z"
        showTimecodes={true}
      />
    )
    expect(screen.getByRole('article').querySelector('time')).toBeInTheDocument()
  })

  it('hides timestamp when showTimecodes is false', () => {
    render(
      <MessageBubble
        role="assistant"
        content={[textBlock]}
        timestamp="2026-02-13T10:00:00Z"
        showTimecodes={false}
      />
    )
    expect(screen.getByRole('article').querySelector('time')).not.toBeInTheDocument()
  })

  it('defaults to showing thinking and tools, hiding timecodes', () => {
    render(
      <MessageBubble
        role="assistant"
        content={[textBlock, thinkingBlock, toolUseBlock]}
        timestamp="2026-02-13T10:00:00Z"
      />
    )
    expect(screen.getByText(/Let me think/)).toBeInTheDocument()
    expect(screen.getByText('Bash')).toBeInTheDocument()
    expect(screen.getByRole('article').querySelector('time')).not.toBeInTheDocument()
  })
})
