import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownPreviewProps {
  content: string
  language: string
}

export default function MarkdownPreview({ content }: MarkdownPreviewProps) {
  return (
    <div className="markdown-preview h-full overflow-auto bg-white dark:bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  )
}
