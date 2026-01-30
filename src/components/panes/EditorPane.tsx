import { useState, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { FileText } from 'lucide-react'
import { useAppDispatch } from '@/store/hooks'
import { updatePaneContent } from '@/store/panesSlice'

interface EditorPaneProps {
  paneId: string
  tabId: string
  filePath: string | null
  language: string | null
  readOnly: boolean
  content: string
  viewMode: 'source' | 'preview'
}

export default function EditorPane({
  paneId,
  tabId,
  filePath,
  language,
  readOnly,
  content,
  viewMode,
}: EditorPaneProps) {
  const dispatch = useAppDispatch()
  const [inputPath, setInputPath] = useState(filePath || '')

  const handleContentChange = useCallback(
    (value: string | undefined) => {
      if (value === undefined) return
      dispatch(
        updatePaneContent({
          tabId,
          paneId,
          content: {
            kind: 'editor',
            filePath,
            language,
            readOnly,
            content: value,
            viewMode,
          },
        })
      )
    },
    [dispatch, tabId, paneId, filePath, language, readOnly, viewMode]
  )

  // Empty state
  if (!filePath && !content) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
        <FileText className="h-12 w-12 opacity-50" />
        <button
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          onClick={() => {
            // TODO: Focus path input
          }}
        >
          Open File
        </button>
        <span className="text-sm">or start typing to create a scratch pad</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Toolbar will go here */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={language || undefined}
          value={content}
          onChange={handleContentChange}
          options={{
            readOnly,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
          }}
          theme="vs-dark"
        />
      </div>
    </div>
  )
}
