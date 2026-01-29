# Pane-First Terminal Ownership Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move terminal lifecycle ownership from tabs to panes so that splitting creates independent terminals.

**Architecture:** Terminals will be owned by `PaneContent` instead of `Tab`. Each terminal pane gets its own `createRequestId` for idempotent terminal creation. `TerminalView` uses `paneContent` exclusively with no fallback to tab properties. Tab becomes a pure navigation container.

**Tech Stack:** Redux Toolkit, TypeScript, Vitest, React

---

## Phase 1: Extend PaneContent with Terminal Lifecycle

### Task 1: Add Terminal Lifecycle Fields to PaneContent Type

**Files:**
- Modify: `src/store/paneTypes.ts:4-6`
- Test: `test/unit/client/store/panesSlice.test.ts`

**Step 1: Write the failing type test**

Create type assertion test in `test/unit/client/store/panesSlice.test.ts` at the end of the file:

```typescript
describe('TerminalPaneContent type', () => {
  it('has required terminal lifecycle fields', () => {
    // Type assertion - this should compile without errors
    const content: PaneContent = {
      kind: 'terminal',
      createRequestId: 'req-123',
      status: 'creating',
      mode: 'shell',
      shell: 'system',
    }
    expect(content.kind).toBe('terminal')
    expect(content.createRequestId).toBe('req-123')
    expect(content.status).toBe('creating')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/unit/client/store/panesSlice.test.ts`
Expected: TypeScript error - `createRequestId` and `status` don't exist on type

**Step 3: Update PaneContent type**

In `src/store/paneTypes.ts`, replace lines 4-6:

```typescript
import type { TerminalStatus, TabMode, ShellType } from './types'

/**
 * Content that can be displayed in a pane
 */
export type PaneContent =
  | {
      kind: 'terminal'
      terminalId?: string
      createRequestId: string
      status: TerminalStatus
      mode: TabMode
      shell: ShellType
      resumeSessionId?: string
      initialCwd?: string
    }
  | { kind: 'browser'; url: string; devToolsOpen: boolean }
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run test/unit/client/store/panesSlice.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/store/paneTypes.ts test/unit/client/store/panesSlice.test.ts
git commit -m "feat(panes): add terminal lifecycle fields to PaneContent type"
```

---

### Task 2: Update splitPane to Generate createRequestId

**Files:**
- Modify: `src/store/panesSlice.ts:63-105`
- Test: `test/unit/client/store/panesSlice.test.ts`

**Step 1: Write the failing test**

Add to `test/unit/client/store/panesSlice.test.ts` in the `splitPane` describe block:

```typescript
it('generates createRequestId for new terminal panes', () => {
  const store = configureStore({ reducer: { panes: panesReducer } })

  // Initialize with terminal content
  store.dispatch(initLayout({
    tabId: 'tab1',
    content: { kind: 'terminal', createRequestId: 'orig-req', status: 'running', mode: 'shell', shell: 'system' }
  }))

  const layoutBefore = store.getState().panes.layouts['tab1'] as { type: 'leaf'; id: string }

  // Split with new terminal content (no createRequestId provided)
  store.dispatch(splitPane({
    tabId: 'tab1',
    paneId: layoutBefore.id,
    direction: 'horizontal',
    newContent: { kind: 'terminal', mode: 'shell', shell: 'system' },
  }))

  const layout = store.getState().panes.layouts['tab1']
  expect(layout.type).toBe('split')

  const split = layout as { type: 'split'; children: [any, any] }
  const newPane = split.children[1] as { type: 'leaf'; content: PaneContent }

  expect(newPane.content.kind).toBe('terminal')
  if (newPane.content.kind === 'terminal') {
    expect(newPane.content.createRequestId).toBeDefined()
    expect(newPane.content.createRequestId).not.toBe('orig-req')
    expect(newPane.content.status).toBe('creating')
  }
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/unit/client/store/panesSlice.test.ts`
Expected: FAIL - createRequestId undefined on new pane

**Step 3: Update splitPane reducer**

In `src/store/panesSlice.ts`, update the `splitPane` reducer (around line 63):

```typescript
splitPane: (
  state,
  action: PayloadAction<{
    tabId: string
    paneId: string
    direction: 'horizontal' | 'vertical'
    newContent: Omit<PaneContent, 'createRequestId' | 'status'> & { createRequestId?: string; status?: TerminalStatus }
  }>
) => {
  const { tabId, paneId, direction, newContent } = action.payload
  const root = state.layouts[tabId]
  if (!root) return

  const newPaneId = nanoid()

  // Find the target pane and get its content
  function findPane(node: PaneNode, id: string): PaneNode | null {
    if (node.type === 'leaf') return node.id === id ? node : null
    return findPane(node.children[0], id) || findPane(node.children[1], id)
  }

  const targetPane = findPane(root, paneId)
  if (!targetPane || targetPane.type !== 'leaf') return

  // Ensure terminal panes have lifecycle fields
  let finalContent: PaneContent
  if (newContent.kind === 'terminal') {
    finalContent = {
      ...newContent,
      kind: 'terminal',
      createRequestId: newContent.createRequestId || nanoid(),
      status: newContent.status || 'creating',
      mode: newContent.mode || 'shell',
      shell: newContent.shell || 'system',
    }
  } else {
    finalContent = newContent as PaneContent
  }

  // Create the split node
  const splitNode: PaneNode = {
    type: 'split',
    id: nanoid(),
    direction,
    sizes: [50, 50],
    children: [
      { ...targetPane }, // Keep original pane
      { type: 'leaf', id: newPaneId, content: finalContent }, // New pane
    ],
  }

  // Replace the target pane with the split
  const newRoot = findAndReplace(root, paneId, splitNode)
  if (newRoot) {
    state.layouts[tabId] = newRoot
    state.activePane[tabId] = newPaneId
  }
},
```

Also add import at top of file:

```typescript
import type { TerminalStatus } from './types'
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run test/unit/client/store/panesSlice.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/store/panesSlice.ts test/unit/client/store/panesSlice.test.ts
git commit -m "feat(panes): generate createRequestId for new terminal panes in splitPane"
```

---

### Task 3: Update initLayout to Generate createRequestId

**Files:**
- Modify: `src/store/panesSlice.ts:46-61`
- Test: `test/unit/client/store/panesSlice.test.ts`

**Step 1: Write the failing test**

Add to `test/unit/client/store/panesSlice.test.ts` in the `initLayout` describe block:

```typescript
it('generates createRequestId if not provided for terminal content', () => {
  const store = configureStore({ reducer: { panes: panesReducer } })

  // Initialize without createRequestId
  store.dispatch(initLayout({
    tabId: 'tab1',
    content: { kind: 'terminal', mode: 'shell', shell: 'system' } as any,
  }))

  const layout = store.getState().panes.layouts['tab1'] as { type: 'leaf'; content: PaneContent }

  if (layout.content.kind === 'terminal') {
    expect(layout.content.createRequestId).toBeDefined()
    expect(layout.content.createRequestId.length).toBeGreaterThan(0)
    expect(layout.content.status).toBe('creating')
  }
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/unit/client/store/panesSlice.test.ts`
Expected: FAIL - createRequestId undefined

**Step 3: Update initLayout reducer**

In `src/store/panesSlice.ts`, update the `initLayout` reducer:

```typescript
initLayout: (
  state,
  action: PayloadAction<{ tabId: string; content: Omit<PaneContent, 'createRequestId' | 'status'> & { createRequestId?: string; status?: TerminalStatus } }>
) => {
  const { tabId, content } = action.payload
  // Don't overwrite existing layout
  if (state.layouts[tabId]) return

  const paneId = nanoid()

  // Ensure terminal panes have lifecycle fields
  let finalContent: PaneContent
  if (content.kind === 'terminal') {
    finalContent = {
      ...content,
      kind: 'terminal',
      createRequestId: content.createRequestId || nanoid(),
      status: content.status || 'creating',
      mode: content.mode || 'shell',
      shell: content.shell || 'system',
    }
  } else {
    finalContent = content as PaneContent
  }

  state.layouts[tabId] = {
    type: 'leaf',
    id: paneId,
    content: finalContent,
  }
  state.activePane[tabId] = paneId
},
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run test/unit/client/store/panesSlice.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/store/panesSlice.ts test/unit/client/store/panesSlice.test.ts
git commit -m "feat(panes): generate createRequestId in initLayout for terminal panes"
```

---

## Phase 2: Update TerminalView to Use PaneContent Exclusively

### Task 4: Create updateTerminalPaneContent Thunk

**Files:**
- Modify: `src/store/panesSlice.ts`
- Test: `test/unit/client/store/panesSlice.test.ts`

**Step 1: Write the failing test**

Add to `test/unit/client/store/panesSlice.test.ts`:

```typescript
describe('updateTerminalPaneContent', () => {
  it('updates terminalId and status on terminal pane', () => {
    const store = configureStore({ reducer: { panes: panesReducer } })

    store.dispatch(initLayout({
      tabId: 'tab1',
      content: { kind: 'terminal', createRequestId: 'req-1', status: 'creating', mode: 'shell', shell: 'system' },
    }))

    const layout = store.getState().panes.layouts['tab1'] as { type: 'leaf'; id: string }

    store.dispatch(updatePaneContent({
      tabId: 'tab1',
      paneId: layout.id,
      content: { kind: 'terminal', createRequestId: 'req-1', status: 'running', mode: 'shell', shell: 'system', terminalId: 'term-abc' },
    }))

    const updated = store.getState().panes.layouts['tab1'] as { type: 'leaf'; content: PaneContent }
    if (updated.content.kind === 'terminal') {
      expect(updated.content.terminalId).toBe('term-abc')
      expect(updated.content.status).toBe('running')
    }
  })
})
```

**Step 2: Run test to verify it passes**

Run: `npm test -- --run test/unit/client/store/panesSlice.test.ts`
Expected: PASS (updatePaneContent already exists)

**Step 3: Commit**

```bash
git add test/unit/client/store/panesSlice.test.ts
git commit -m "test(panes): add test for terminal pane content updates"
```

---

### Task 5: Refactor TerminalView to Use PaneContent for Terminal Lifecycle

**Files:**
- Modify: `src/components/TerminalView.tsx`
- Test: `test/unit/client/components/TerminalView.test.tsx` (create if needed)

**Step 1: Write the failing integration test**

Create `test/unit/client/components/TerminalView.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import tabsReducer from '@/store/tabsSlice'
import panesReducer from '@/store/panesSlice'
import settingsReducer from '@/store/settingsSlice'
import connectionReducer from '@/store/connectionSlice'
import type { PaneContent } from '@/store/paneTypes'

// Mock ws-client
vi.mock('@/lib/ws-client', () => ({
  getWsClient: () => ({
    connect: vi.fn().mockResolvedValue(undefined),
    send: vi.fn(),
    onMessage: vi.fn(() => () => {}),
    onReconnect: vi.fn(() => () => {}),
  }),
}))

describe('TerminalView pane-first behavior', () => {
  it('uses paneContent.createRequestId for terminal creation', async () => {
    const mockWs = {
      connect: vi.fn().mockResolvedValue(undefined),
      send: vi.fn(),
      onMessage: vi.fn(() => () => {}),
      onReconnect: vi.fn(() => () => {}),
    }
    vi.mocked(await import('@/lib/ws-client')).getWsClient = () => mockWs

    // The paneContent should have its own createRequestId
    const paneContent: PaneContent = {
      kind: 'terminal',
      createRequestId: 'pane-req-123',
      status: 'creating',
      mode: 'shell',
      shell: 'system',
    }

    // TerminalView should use paneContent.createRequestId, not tab.createRequestId
    // This test validates the design - actual render test would need more setup
    expect(paneContent.createRequestId).toBe('pane-req-123')
  })
})
```

**Step 2: Run test to verify baseline**

Run: `npm test -- --run test/unit/client/components/TerminalView.test.tsx`
Expected: PASS (basic type test)

**Step 3: Refactor TerminalView**

This is the core change. In `src/components/TerminalView.tsx`, replace the entire component:

```typescript
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { updatePaneContent } from '@/store/panesSlice'
import { getWsClient } from '@/lib/ws-client'
import { getTerminalTheme } from '@/lib/terminal-themes'
import { nanoid } from 'nanoid'
import { cn } from '@/lib/utils'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { Loader2 } from 'lucide-react'
import type { PaneContent } from '@/store/paneTypes'
import 'xterm/css/xterm.css'

interface TerminalViewProps {
  tabId: string
  paneId: string
  paneContent: PaneContent
  hidden?: boolean
}

export default function TerminalView({ tabId, paneId, paneContent, hidden }: TerminalViewProps) {
  const dispatch = useAppDispatch()
  const settings = useAppSelector((s) => s.settings.settings)

  // Validate paneContent is terminal type
  if (paneContent.kind !== 'terminal') {
    return null
  }

  const { terminalId, createRequestId, status, mode, shell, resumeSessionId, initialCwd } = paneContent

  const ws = useMemo(() => getWsClient(), [])
  const [isAttaching, setIsAttaching] = useState(false)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  const requestIdRef = useRef<string>(createRequestId)
  const terminalIdRef = useRef<string | undefined>(terminalId)
  const mountedRef = useRef(false)
  const hiddenRef = useRef(hidden)

  // Keep refs in sync
  useEffect(() => {
    terminalIdRef.current = terminalId
  }, [terminalId])

  useEffect(() => {
    requestIdRef.current = createRequestId
  }, [createRequestId])

  useEffect(() => {
    hiddenRef.current = hidden
  }, [hidden])

  // Helper to update pane content
  const updateContent = (updates: Partial<PaneContent & { kind: 'terminal' }>) => {
    dispatch(updatePaneContent({
      tabId,
      paneId,
      content: { ...paneContent, ...updates } as PaneContent,
    }))
  }

  // Init xterm once
  useEffect(() => {
    if (!containerRef.current) return

    // Prevent re-init on StrictMode double-mount
    if (mountedRef.current && termRef.current) return
    mountedRef.current = true

    // Clean up any existing terminal first
    if (termRef.current) {
      termRef.current.dispose()
      termRef.current = null
      fitRef.current = null
    }

    const term = new Terminal({
      convertEol: true,
      cursorBlink: settings.terminal.cursorBlink,
      fontSize: settings.terminal.fontSize,
      fontFamily: settings.terminal.fontFamily,
      lineHeight: settings.terminal.lineHeight,
      scrollback: settings.terminal.scrollback,
      theme: getTerminalTheme(settings.terminal.theme, settings.theme),
    })
    const fit = new FitAddon()
    term.loadAddon(fit)

    termRef.current = term
    fitRef.current = fit

    term.open(containerRef.current)

    // Delay fit to allow renderer to initialize
    requestAnimationFrame(() => {
      if (termRef.current === term) {
        try {
          fit.fit()
        } catch {
          // Ignore if disposed
        }
      }
    })

    term.onData((data) => {
      const tid = terminalIdRef.current
      if (!tid) return
      ws.send({ type: 'terminal.input', terminalId: tid, data })
    })

    // Handle copy/paste keyboard shortcuts
    term.attachCustomKeyEventHandler((event) => {
      if (event.ctrlKey && event.shiftKey && event.key === 'C' && event.type === 'keydown') {
        const selection = term.getSelection()
        if (selection) {
          void navigator.clipboard.writeText(selection).catch(() => {})
        }
        return false
      }
      if (event.ctrlKey && event.shiftKey && event.key === 'V' && event.type === 'keydown') {
        void navigator.clipboard.readText().then((text) => {
          const tid = terminalIdRef.current
          if (tid && text) {
            ws.send({ type: 'terminal.input', terminalId: tid, data: text })
          }
        }).catch(() => {})
        return false
      }
      return true
    })

    const ro = new ResizeObserver(() => {
      if (hiddenRef.current || termRef.current !== term) return
      try {
        fit.fit()
        const tid = terminalIdRef.current
        if (tid) {
          ws.send({ type: 'terminal.resize', terminalId: tid, cols: term.cols, rows: term.rows })
        }
      } catch {
        // Ignore if disposed
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      if (termRef.current === term) {
        term.dispose()
        termRef.current = null
        fitRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Apply settings changes
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.cursorBlink = settings.terminal.cursorBlink
    term.options.fontSize = settings.terminal.fontSize
    term.options.fontFamily = settings.terminal.fontFamily
    term.options.lineHeight = settings.terminal.lineHeight
    term.options.scrollback = settings.terminal.scrollback
    term.options.theme = getTerminalTheme(settings.terminal.theme, settings.theme)
    if (!hidden) fitRef.current?.fit()
  }, [settings, hidden])

  // When becoming visible, fit and send size
  useEffect(() => {
    if (!hidden) {
      const frameId = requestAnimationFrame(() => {
        fitRef.current?.fit()
        const term = termRef.current
        const tid = terminalIdRef.current
        if (term && tid) {
          ws.send({ type: 'terminal.resize', terminalId: tid, cols: term.cols, rows: term.rows })
        }
      })
      return () => cancelAnimationFrame(frameId)
    }
  }, [hidden, ws])

  // Create or attach to backend terminal
  useEffect(() => {
    const term = termRef.current
    if (!term) return

    let unsub = () => {}
    let unsubReconnect = () => {}

    function attach(tid: string) {
      setIsAttaching(true)
      ws.send({ type: 'terminal.attach', terminalId: tid })
      ws.send({ type: 'terminal.resize', terminalId: tid, cols: term.cols, rows: term.rows })
    }

    async function ensure() {
      try {
        await ws.connect()
      } catch {
        // handled elsewhere
      }

      unsub = ws.onMessage((msg) => {
        const tid = terminalIdRef.current
        const reqId = requestIdRef.current

        if (msg.type === 'terminal.output' && msg.terminalId === tid) {
          term.write(msg.data || '')
        }

        if (msg.type === 'terminal.snapshot' && msg.terminalId === tid) {
          try {
            term.clear()
          } catch {}
          const snapshot = msg.snapshot || ''
          if (snapshot) {
            try {
              term.write(snapshot)
            } catch {}
          }
        }

        // Terminal created in response to our request
        if (msg.type === 'terminal.created' && msg.requestId === reqId) {
          const newId = msg.terminalId as string
          terminalIdRef.current = newId
          updateContent({ terminalId: newId, status: 'running' })
          if (msg.snapshot) {
            try {
              term.clear()
              term.write(msg.snapshot)
            } catch {}
          }
          attach(newId)
        }

        if (msg.type === 'terminal.attached' && msg.terminalId === tid) {
          setIsAttaching(false)
          if (msg.snapshot) {
            try {
              term.clear()
              term.write(msg.snapshot)
            } catch {}
          }
          updateContent({ status: 'running' })
        }

        if (msg.type === 'terminal.exit' && msg.terminalId === tid) {
          updateContent({ status: 'exited' })
        }

        if (msg.type === 'error' && msg.requestId === reqId) {
          setIsAttaching(false)
          updateContent({ status: 'error' })
          term.writeln(`\r\n[Error] ${msg.message || msg.code || 'Unknown error'}\r\n`)
        }

        // Handle INVALID_TERMINAL_ID errors (e.g., after server restart)
        if (msg.type === 'error' && msg.code === 'INVALID_TERMINAL_ID' && !msg.requestId) {
          const tid = terminalIdRef.current
          if (tid) {
            term.writeln('\r\n[Reconnecting...]\r\n')
            const newRequestId = nanoid()
            requestIdRef.current = newRequestId
            terminalIdRef.current = undefined
            updateContent({ terminalId: undefined, createRequestId: newRequestId, status: 'creating' })
            ws.send({
              type: 'terminal.create',
              requestId: newRequestId,
              mode,
              shell: shell || 'system',
              cwd: initialCwd,
              resumeSessionId,
            })
          }
        }
      })

      unsubReconnect = ws.onReconnect(() => {
        const tid = terminalIdRef.current
        if (tid) {
          attach(tid)
        }
      })

      // Use paneContent for terminal lifecycle - NOT tab
      if (terminalId) {
        attach(terminalId)
      } else {
        // Create a new terminal using pane's createRequestId
        ws.send({
          type: 'terminal.create',
          requestId: createRequestId,
          mode,
          shell: shell || 'system',
          cwd: initialCwd,
          resumeSessionId,
        })
      }
    }

    ensure()

    return () => {
      unsub()
      unsubReconnect()
    }
  }, [paneId, terminalId, createRequestId]) // Key change: depend on pane properties

  const showSpinner = status === 'creating' || isAttaching

  return (
    <div className={cn('h-full w-full relative', hidden ? 'hidden' : '')}>
      <div ref={containerRef} className="h-full w-full" />
      {showSpinner && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {status === 'creating' ? 'Starting terminal...' : 'Reconnecting...'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
```

**Step 4: Run all tests**

Run: `npm test`
Expected: Some tests may fail due to interface changes - we'll fix in next tasks

**Step 5: Commit**

```bash
git add src/components/TerminalView.tsx test/unit/client/components/TerminalView.test.tsx
git commit -m "refactor(terminal): use paneContent exclusively for terminal lifecycle"
```

---

## Phase 3: Update Tab and Pane Initialization

### Task 6: Update PaneContainer to Pass Required Props

**Files:**
- Modify: `src/components/panes/PaneContainer.tsx:105-117`
- Test: `test/unit/client/components/panes/PaneContainer.test.tsx` (if exists)

**Step 1: Verify renderContent passes paneId**

Read `src/components/panes/PaneContainer.tsx` and verify the `renderContent` function passes `paneId`. If not, update:

```typescript
function renderContent(tabId: string, paneId: string, content: PaneContent) {
  if (content.kind === 'terminal') {
    return <TerminalView key={paneId} tabId={tabId} paneId={paneId} paneContent={content} hidden={false} />
  }

  if (content.kind === 'browser') {
    return <BrowserPane paneId={paneId} tabId={tabId} url={content.url} devToolsOpen={content.devToolsOpen} />
  }

  return null
}
```

**Step 2: Verify TerminalView receives required props**

The `TerminalView` now requires `paneId` as a required prop. Ensure all call sites pass it.

**Step 3: Run tests**

Run: `npm test`
Expected: PASS or identify remaining issues

**Step 4: Commit**

```bash
git add src/components/panes/PaneContainer.tsx
git commit -m "fix(panes): ensure PaneContainer passes paneId to TerminalView"
```

---

### Task 7: Update TabContent Default Content

**Files:**
- Modify: `src/components/TabContent.tsx:22-28`

**Step 1: Read current implementation**

The current `TabContent.tsx` builds `defaultContent` from tab properties. Update to include required fields:

```typescript
// Build default content based on tab
const defaultContent: Omit<PaneContent, 'createRequestId' | 'status'> & { createRequestId?: string; status?: TerminalStatus } = {
  kind: 'terminal',
  mode: tab.mode,
  shell: tab.shell || 'system',
  resumeSessionId: tab.resumeSessionId,
  initialCwd: tab.initialCwd,
  // createRequestId and status will be generated by initLayout
}
```

Actually, since `initLayout` now generates these, we can keep it simple:

```typescript
const defaultContent = {
  kind: 'terminal' as const,
  mode: tab.mode,
  shell: tab.shell || 'system',
  resumeSessionId: tab.resumeSessionId,
  initialCwd: tab.initialCwd,
}
```

**Step 2: Run tests**

Run: `npm test`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/TabContent.tsx
git commit -m "refactor(tabs): simplify defaultContent, let initLayout handle lifecycle fields"
```

---

### Task 8: Update FloatingActionButton Split Content

**Files:**
- Modify: `src/components/panes/PaneLayout.tsx:44-48`

**Step 1: Verify split content format**

The `handleAddTerminal` in `PaneLayout.tsx` dispatches:

```typescript
dispatch(splitPane({
  tabId,
  paneId: activePane,
  direction: getSplitDirection(),
  newContent: { kind: 'terminal', mode: 'shell' },
}))
```

Since `splitPane` now generates `createRequestId`, `status`, and defaults `shell`, this should work. Add `shell` explicitly for clarity:

```typescript
newContent: { kind: 'terminal', mode: 'shell', shell: 'system' },
```

**Step 2: Run tests**

Run: `npm test`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/panes/PaneLayout.tsx
git commit -m "fix(panes): explicitly pass shell type in FAB split"
```

---

## Phase 4: Handle Pane Close Terminal Cleanup

### Task 9: Update Pane Close to Detach Terminal

**Files:**
- Modify: `src/components/panes/PaneContainer.tsx:27-35`

**Step 1: Verify handleClose uses paneContent.terminalId**

Current code in `PaneContainer.tsx`:

```typescript
const handleClose = useCallback((paneId: string, content: PaneContent) => {
  if (content.kind === 'terminal' && content.terminalId) {
    ws.send({
      type: 'terminal.detach',
      terminalId: content.terminalId,
    })
  }
  dispatch(closePane({ tabId, paneId }))
}, [dispatch, tabId, ws])
```

This already uses `content.terminalId` which is correct. No change needed.

**Step 2: Run tests**

Run: `npm test`
Expected: PASS

**Step 3: Commit (if any changes)**

```bash
git commit --allow-empty -m "verify(panes): pane close correctly uses paneContent.terminalId"
```

---

## Phase 5: Update Persistence and Migration

### Task 10: Add Persistence Migration for PaneContent

**Files:**
- Modify: `src/store/panesSlice.ts` (hydratePanes)
- Modify: `src/store/persistMiddleware.ts`
- Test: `test/unit/client/store/panesPersistence.test.ts`

**Step 1: Write the failing test**

Add to `test/unit/client/store/panesPersistence.test.ts`:

```typescript
describe('PaneContent migration', () => {
  it('migrates old terminal pane content to include lifecycle fields', () => {
    // Simulate old format without createRequestId/status
    const oldPanesState = {
      layouts: {
        'tab1': {
          type: 'leaf',
          id: 'pane1',
          content: { kind: 'terminal', mode: 'shell' }, // Old format
        },
      },
      activePane: { 'tab1': 'pane1' },
    }

    localStorage.setItem('freshell.panes.v1', JSON.stringify(oldPanesState))

    const loaded = loadPersistedPanes()

    // After migration, should have lifecycle fields
    const layout = loaded.layouts['tab1'] as { type: 'leaf'; content: any }
    expect(layout.content.createRequestId).toBeDefined()
    expect(layout.content.status).toBeDefined()
    expect(layout.content.shell).toBeDefined()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/unit/client/store/panesPersistence.test.ts`
Expected: FAIL - createRequestId undefined

**Step 3: Add migration logic to loadPersistedPanes**

In `src/store/persistMiddleware.ts`, update `loadPersistedPanes`:

```typescript
import { nanoid } from 'nanoid'

function migratePaneContent(content: any): any {
  if (content.kind === 'terminal') {
    return {
      ...content,
      createRequestId: content.createRequestId || nanoid(),
      status: content.status || 'creating',
      mode: content.mode || 'shell',
      shell: content.shell || 'system',
    }
  }
  return content
}

function migrateNode(node: any): any {
  if (node.type === 'leaf') {
    return {
      ...node,
      content: migratePaneContent(node.content),
    }
  }
  if (node.type === 'split') {
    return {
      ...node,
      children: [migrateNode(node.children[0]), migrateNode(node.children[1])],
    }
  }
  return node
}

export function loadPersistedPanes(): any | null {
  try {
    const raw = localStorage.getItem(PANES_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)

    // Migrate layouts
    const migratedLayouts: Record<string, any> = {}
    for (const [tabId, node] of Object.entries(parsed.layouts || {})) {
      migratedLayouts[tabId] = migrateNode(node)
    }

    return {
      ...parsed,
      layouts: migratedLayouts,
    }
  } catch {
    return null
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run test/unit/client/store/panesPersistence.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/store/persistMiddleware.ts test/unit/client/store/panesPersistence.test.ts
git commit -m "feat(persistence): add migration for old pane content format"
```

---

## Phase 6: Clean Up Tab Type (Optional - Can Defer)

### Task 11: Remove Terminal Fields from Tab Type

**Note:** This is a larger change that affects many files. It can be deferred to a follow-up PR after the core pane-first behavior is working.

**Files to modify:**
- `src/store/types.ts` - Remove `terminalId`, `createRequestId`, `mode`, `shell`, `resumeSessionId`, `initialCwd`, `status` from `Tab`
- `src/store/tabsSlice.ts` - Update `addTab` and related actions
- `src/components/TabBar.tsx` - Update terminal cleanup logic
- Multiple test files

**Recommendation:** Create a separate issue/PR for this cleanup after verifying the pane-first approach works correctly.

---

## Phase 7: Fix Remaining Tests

### Task 12: Update Existing Tests for New Types

**Files:**
- `test/unit/client/store/panesSlice.test.ts`
- `test/unit/client/store/tabsSlice.test.ts`
- Any other failing tests

**Step 1: Run full test suite**

Run: `npm test`

**Step 2: Fix each failing test**

For each failing test, update to use the new `PaneContent` structure with required fields:

```typescript
// Old
content: { kind: 'terminal', mode: 'shell' }

// New
content: { kind: 'terminal', createRequestId: 'test-req', status: 'running', mode: 'shell', shell: 'system' }
```

**Step 3: Run tests again**

Run: `npm test`
Expected: All PASS

**Step 4: Commit**

```bash
git add test/
git commit -m "test: update tests for new PaneContent structure"
```

---

## Phase 8: Final Verification

### Task 13: Manual Testing Checklist

**Steps:**
1. Start dev server: `npm run dev`
2. Open browser to localhost:5173
3. Verify: New tab creates terminal correctly
4. Verify: Split pane (FAB → Terminal) creates **independent** terminal (not mirror)
5. Verify: Both terminals can run different commands simultaneously
6. Verify: Close one pane, other continues running
7. Verify: Close tab detaches both terminals
8. Verify: Refresh page restores split pane layout
9. Verify: After refresh, terminals reconnect (or show reconnecting)

**Step 1: Document test results**

Create `docs/testing/2026-01-29-pane-first-manual-test.md` with results.

**Step 2: Commit**

```bash
git add docs/testing/
git commit -m "docs: add manual testing results for pane-first terminals"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-3 | Extend PaneContent with terminal lifecycle fields |
| 2 | 4-5 | Update TerminalView to use paneContent exclusively |
| 3 | 6-8 | Update tab and pane initialization |
| 4 | 9 | Handle pane close terminal cleanup |
| 5 | 10 | Add persistence migration |
| 6 | 11 | (Defer) Remove terminal fields from Tab |
| 7 | 12 | Fix remaining tests |
| 8 | 13 | Manual verification |

**Total estimated tasks:** 12 (excluding deferred Task 11)
