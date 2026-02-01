import { useCallback, useRef } from 'react'
import readySound from '@/assets/your-code-is-ready.mp3'

const DEBOUNCE_MS = 2000

/**
 * Hook that provides a debounced notification sound player.
 * Multiple rapid calls will only play once within the debounce window.
 */
export function useNotificationSound() {
  const lastPlayedRef = useRef<number>(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const play = useCallback(() => {
    const now = Date.now()
    if (now - lastPlayedRef.current < DEBOUNCE_MS) {
      return // Still within debounce window
    }

    lastPlayedRef.current = now

    // Reuse or create audio element
    if (!audioRef.current) {
      audioRef.current = new Audio(readySound)
      audioRef.current.volume = 0.5
    }

    // Reset and play
    audioRef.current.currentTime = 0
    audioRef.current.play().catch(() => {
      // Audio play can fail if user hasn't interacted with page yet
      // This is fine - we just skip the sound
    })
  }, [])

  return { play }
}
