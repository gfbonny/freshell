import { LazyMarkdown } from '@/components/markdown/LazyMarkdown'

interface MarkdownPreviewProps {
  content: string
}

export default function MarkdownPreview({ content }: MarkdownPreviewProps) {
  return (
    <div className="markdown-preview h-full overflow-auto bg-background p-6">
      <div className="max-w-4xl mx-auto prose prose-sm dark:prose-invert">
        <LazyMarkdown content={content} />
      </div>
    </div>
  )
}
