import { lazy, Suspense, type ReactNode } from 'react'

const MarkdownRenderer = lazy(() =>
  import('./MarkdownRenderer').then((module) => ({ default: module.MarkdownRenderer }))
)

type LazyMarkdownProps = {
  content: string
  fallback?: ReactNode
}

export function LazyMarkdown({ content, fallback = null }: LazyMarkdownProps) {
  return (
    <Suspense fallback={fallback}>
      <MarkdownRenderer content={content} />
    </Suspense>
  )
}
