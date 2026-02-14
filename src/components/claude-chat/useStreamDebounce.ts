import { useEffect, useRef, useState } from 'react'

const DEBOUNCE_MS = 50
const FLUSH_THRESHOLD = 200

/**
 * Debounces streaming text updates to limit markdown re-parsing frequency.
 * Flushes every DEBOUNCE_MS or when the buffer delta exceeds FLUSH_THRESHOLD chars.
 * Returns the debounced text string for rendering.
 */
export function useStreamDebounce(text: string, active: boolean): string {
  const [debouncedText, setDebouncedText] = useState(text)
  const lastFlushedLenRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevActiveRef = useRef(active)

  useEffect(() => {
    // When streaming is inactive, always show final text and reset
    if (!active) {
      setDebouncedText(text)
      lastFlushedLenRef.current = text.length
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      prevActiveRef.current = active
      return
    }

    // Reset on new stream start to prevent stale text from previous stream.
    // Without this, React batching could leave debouncedText holding old
    // content for a render frame when streamingActive transitions true.
    if (!prevActiveRef.current && active) {
      setDebouncedText(text) // text is '' at stream start
      lastFlushedLenRef.current = text.length
      prevActiveRef.current = active
      return
    }
    prevActiveRef.current = active

    const delta = text.length - lastFlushedLenRef.current

    // Flush immediately if buffer is large enough
    if (delta >= FLUSH_THRESHOLD) {
      setDebouncedText(text)
      lastFlushedLenRef.current = text.length
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      return
    }

    // Otherwise debounce
    if (!timerRef.current) {
      timerRef.current = setTimeout(() => {
        setDebouncedText(text)
        lastFlushedLenRef.current = text.length
        timerRef.current = null
      }, DEBOUNCE_MS)
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [text, active])

  return debouncedText
}
