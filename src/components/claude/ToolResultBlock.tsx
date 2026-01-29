import { cn } from '@/lib/utils'
import type { ToolResultContent } from '@/lib/claude-types'

interface ToolResultBlockProps {
  result: ToolResultContent
  stdout?: string
  stderr?: string
  className?: string
}

export function ToolResultBlock({ result, stdout, stderr, className }: ToolResultBlockProps) {
  const content = stdout || result.content
  const hasError = result.is_error || !!stderr

  return (
    <div
      className={cn(
        'rounded-md border p-3 my-2',
        hasError ? 'border-destructive/50 bg-destructive/10' : 'bg-background/50',
        className
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
        <span className={cn('text-xs px-1.5 py-0.5 rounded', hasError ? 'bg-destructive/20' : 'bg-muted')}>
          {hasError ? 'Error' : 'Result'}
        </span>
      </div>
      {content && (
        <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-words bg-muted/50 p-2 rounded max-h-64 overflow-y-auto">
          {content}
        </pre>
      )}
      {stderr && (
        <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-words bg-destructive/10 p-2 rounded mt-2 text-destructive">
          {stderr}
        </pre>
      )}
    </div>
  )
}
