import { cn } from '@/lib/utils'
import type { MessageEvent, ContentBlock } from '@/lib/claude-types'
import { isTextContent, isToolUseContent, isToolResultContent } from '@/lib/claude-types'
import { ToolCallBlock } from './ToolCallBlock'
import { ToolResultBlock } from './ToolResultBlock'

interface MessageBubbleProps {
  event: MessageEvent
  className?: string
}

export function MessageBubble({ event, className }: MessageBubbleProps) {
  const isAssistant = event.type === 'assistant'

  const renderContent = (block: ContentBlock, index: number) => {
    if (isTextContent(block)) {
      return (
        <div key={index} className="whitespace-pre-wrap break-words">
          {block.text}
        </div>
      )
    }

    if (isToolUseContent(block)) {
      return <ToolCallBlock key={index} tool={block} />
    }

    if (isToolResultContent(block)) {
      return (
        <ToolResultBlock
          key={index}
          result={block}
          stdout={event.tool_use_result?.stdout}
          stderr={event.tool_use_result?.stderr}
        />
      )
    }

    return null
  }

  return (
    <div
      className={cn(
        'rounded-lg px-4 py-3 max-w-[85%]',
        isAssistant ? 'bg-muted self-start' : 'bg-primary text-primary-foreground self-end',
        className
      )}
    >
      {event.message.content.map(renderContent)}
    </div>
  )
}
