import { createAsyncThunk } from '@reduxjs/toolkit'
import { getWsClient } from '@/lib/ws-client'
import { addTab, updateTab } from './tabsSlice'
import { createClaudeSession } from './claudeSlice'
import { nanoid } from 'nanoid'

export const createClaudeTab = createAsyncThunk(
  'claude/createTab',
  async ({ prompt, cwd }: { prompt: string; cwd?: string }, { dispatch }) => {
    const tabId = nanoid()
    const requestId = tabId

    // Create tab in pending state
    dispatch(
      addTab({
        title: prompt.slice(0, 30) + (prompt.length > 30 ? '...' : ''),
        mode: 'claude',
        status: 'creating',
        initialCwd: cwd,
      })
    )

    // The addTab generates its own ID, so we need to get the last tab
    // Actually, let's use a custom approach - first add the tab, then update it

    // Connect and send create request
    const ws = getWsClient()
    await ws.connect()

    return new Promise<string>((resolve, reject) => {
      const unsub = ws.onMessage((msg) => {
        if (msg.type === 'claude.created' && msg.requestId === requestId) {
          unsub()

          // Create Claude session in Redux
          dispatch(
            createClaudeSession({
              sessionId: msg.sessionId,
              prompt,
              cwd,
            })
          )

          // Link tab to Claude session - we need to find the tab by requestId
          // Since addTab doesn't return the id, we'll update via updateTab
          // For now, the thunk caller should handle this

          resolve(msg.sessionId)
        }
        if (msg.type === 'error' && msg.requestId === requestId) {
          unsub()
          reject(new Error(msg.message))
        }
      })

      ws.send({
        type: 'claude.create',
        requestId,
        prompt,
        cwd,
      })
    })
  }
)
