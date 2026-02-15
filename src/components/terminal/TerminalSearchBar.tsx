import { useEffect, useRef } from 'react'

type TerminalSearchBarProps = {
  query: string
  onQueryChange: (value: string) => void
  onFindNext: () => void
  onFindPrevious: () => void
  onClose: () => void
}

export function TerminalSearchBar({
  query,
  onQueryChange,
  onFindNext,
  onFindPrevious,
  onClose,
}: TerminalSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="absolute right-3 top-3 z-20 flex items-center gap-2 rounded-md border border-border bg-background/95 p-2 shadow-md">
      <input
        ref={inputRef}
        aria-label="Terminal search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            if (event.shiftKey) {
              onFindPrevious()
            } else {
              onFindNext()
            }
            return
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          }
        }}
        className="h-8 w-52 rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-border"
      />
      <button
        type="button"
        aria-label="Previous match"
        className="h-8 min-h-11 min-w-11 md:min-h-0 md:min-w-0 flex items-center justify-center rounded-md px-2 text-xs"
        onClick={onFindPrevious}
      >
        Prev
      </button>
      <button
        type="button"
        aria-label="Next match"
        className="h-8 min-h-11 min-w-11 md:min-h-0 md:min-w-0 flex items-center justify-center rounded-md px-2 text-xs"
        onClick={onFindNext}
      >
        Next
      </button>
      <button
        type="button"
        aria-label="Close search"
        className="h-8 min-h-11 min-w-11 md:min-h-0 md:min-w-0 flex items-center justify-center rounded-md px-2 text-xs"
        onClick={onClose}
      >
        Close
      </button>
    </div>
  )
}
