import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import type { ChatContentBlock } from '@/store/claudeChatTypes'
import ToolBlock from './ToolBlock'

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: ChatContentBlock[]
  timestamp?: string
  model?: string
  showThinking?: boolean
  showTools?: boolean
  showTimecodes?: boolean
}

function MessageBubble({ role, content, timestamp, model, showThinking = true, showTools = true, showTimecodes = false }: MessageBubbleProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 max-w-[85%]',
        role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
      )}
      role="article"
      aria-label={`${role} message`}
    >
      <div
        className={cn(
          'rounded-lg px-3 py-2 text-sm',
          role === 'user'
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted'
        )}
      >
        {content.map((block, i) => {
          if (block.type === 'text' && block.text) {
            if (role === 'user') {
              return <p key={i} className="whitespace-pre-wrap">{block.text}</p>
            }
            return (
              <div key={i} className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.text}</ReactMarkdown>
              </div>
            )
          }

          if (block.type === 'thinking' && block.thinking) {
            if (!showThinking) return null
            return (
              <details key={i} className="text-xs text-muted-foreground mt-1">
                <summary className="cursor-pointer select-none">
                  Thinking ({block.thinking.length.toLocaleString()} chars)
                </summary>
                <pre className="mt-1 whitespace-pre-wrap text-xs opacity-70">{block.thinking}</pre>
              </details>
            )
          }

          if (block.type === 'tool_use' && block.name) {
            if (!showTools) return null
            return (
              <ToolBlock
                key={block.id || i}
                name={block.name}
                input={block.input}
                status="running"
              />
            )
          }

          if (block.type === 'tool_result') {
            if (!showTools) return null
            const resultContent = typeof block.content === 'string' ? block.content : JSON.stringify(block.content)
            return (
              <ToolBlock
                key={block.tool_use_id || i}
                name="Result"
                output={resultContent}
                isError={block.is_error}
                status="complete"
              />
            )
          }

          return null
        })}
      </div>

      {((showTimecodes && timestamp) || model) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          {showTimecodes && timestamp && <time>{new Date(timestamp).toLocaleTimeString()}</time>}
          {model && <span className="opacity-60">{model}</span>}
        </div>
      )}
    </div>
  )
}

export default memo(MessageBubble)
