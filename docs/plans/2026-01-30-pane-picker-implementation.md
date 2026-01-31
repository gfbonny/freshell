# Pane Picker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace immediate shell creation with a picker UI that lets users choose pane type (shell, browser, editor).

**Architecture:** Add `picker` as a new pane content kind. New tabs check a user setting (`panes.defaultNewPane`) to decide between showing the picker or auto-creating a specific pane type. FAB always creates a picker pane. The picker component handles keyboard navigation and single-key shortcuts.

**Tech Stack:** React, Redux Toolkit, TypeScript, Tailwind CSS, Lucide icons, Vitest + Testing Library

---

## Task 1: Add PickerPaneContent type

**Files:**
- Modify: `src/store/paneTypes.ts:54`
- Modify: `src/store/paneTypes.ts:75`

**Step 1: Add PickerPaneContent type definition**

In `src/store/paneTypes.ts`, after EditorPaneContent (around line 49), add:

```typescript
/**
 * Picker pane content - shows pane type selection UI.
 */
export type PickerPaneContent = {
  kind: 'picker'
}
```

**Step 2: Update PaneContent union type**

Change line 54 from:
```typescript
export type PaneContent = TerminalPaneContent | BrowserPaneContent | EditorPaneContent
```

To:
```typescript
export type PaneContent = TerminalPaneContent | BrowserPaneContent | EditorPaneContent | PickerPaneContent
```

**Step 3: Update PaneContentInput union type**

Change line 75 from:
```typescript
export type PaneContentInput = TerminalPaneInput | BrowserPaneContent | EditorPaneInput
```

To:
```typescript
export type PaneContentInput = TerminalPaneInput | BrowserPaneContent | EditorPaneInput | PickerPaneContent
```

**Step 4: Run type check**

Run: `cd .worktrees/pane-picker && npx tsc --noEmit 2>&1 | head -20`

Expected: No errors (or errors in files we haven't updated yet like derivePaneTitle.ts)

**Step 5: Commit**

```bash
cd .worktrees/pane-picker && git add src/store/paneTypes.ts && git commit -m "$(cat <<'EOF'
feat(panes): add PickerPaneContent type

New pane content kind for the pane type selection UI.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Update derivePaneTitle for picker

**Files:**
- Modify: `src/lib/derivePaneTitle.ts`
- Test: `test/unit/client/lib/derivePaneTitle.test.ts` (create if needed)

**Step 1: Check if test file exists**

Run: `ls .worktrees/pane-picker/test/unit/client/lib/ 2>/dev/null || echo "directory does not exist"`

If directory doesn't exist, create it.

**Step 2: Write the failing test**

Create/update `test/unit/client/lib/derivePaneTitle.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { derivePaneTitle } from '@/lib/derivePaneTitle'
import type { PaneContent } from '@/store/paneTypes'

describe('derivePaneTitle', () => {
  it('returns "New Tab" for picker content', () => {
    const content: PaneContent = { kind: 'picker' }
    expect(derivePaneTitle(content)).toBe('New Tab')
  })
})
```

**Step 3: Run test to verify it fails**

Run: `cd .worktrees/pane-picker && npx vitest run test/unit/client/lib/derivePaneTitle.test.ts 2>&1 | tail -20`

Expected: FAIL - either type error or "New Tab" not matched

**Step 4: Update derivePaneTitle**

In `src/lib/derivePaneTitle.ts`, add at the beginning of the function (after line 8):

```typescript
  if (content.kind === 'picker') {
    return 'New Tab'
  }
```

**Step 5: Run test to verify it passes**

Run: `cd .worktrees/pane-picker && npx vitest run test/unit/client/lib/derivePaneTitle.test.ts`

Expected: PASS

**Step 6: Commit**

```bash
cd .worktrees/pane-picker && git add src/lib/derivePaneTitle.ts test/unit/client/lib/ && git commit -m "$(cat <<'EOF'
feat(panes): derivePaneTitle returns 'New Tab' for picker

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add panes.defaultNewPane setting to types

**Files:**
- Modify: `src/store/types.ts:107`

**Step 1: Add DefaultNewPane type**

After line 73 (after SidebarSortMode), add:

```typescript
export type DefaultNewPane = 'ask' | 'shell' | 'browser' | 'editor'
```

**Step 2: Add panes section to AppSettings**

After the sidebar section in AppSettings (after line 106), add:

```typescript
  panes: {
    defaultNewPane: DefaultNewPane
  }
```

**Step 3: Run type check**

Run: `cd .worktrees/pane-picker && npx tsc --noEmit 2>&1 | head -30`

Expected: Errors about missing `panes` in default settings (we'll fix those next)

**Step 4: Commit**

```bash
cd .worktrees/pane-picker && git add src/store/types.ts && git commit -m "$(cat <<'EOF'
feat(settings): add panes.defaultNewPane type

New setting type for controlling new pane behavior.
Options: 'ask' (show picker), 'shell', 'browser', 'editor'.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add server-side default for panes setting

**Files:**
- Modify: `server/config-store.ts:26-41` (AppSettings type)
- Modify: `server/config-store.ts:63-78` (defaultSettings)
- Modify: `server/config-store.ts:109-116` (mergeSettings)

**Step 1: Update server AppSettings type**

In `server/config-store.ts`, update the AppSettings type (around line 26-41) to add after `safety`:

```typescript
  panes: {
    defaultNewPane: 'ask' | 'shell' | 'browser' | 'editor'
  }
```

**Step 2: Update defaultSettings**

In `server/config-store.ts`, update defaultSettings (around line 63-78) to add after `safety`:

```typescript
  panes: {
    defaultNewPane: 'ask',
  },
```

**Step 3: Update mergeSettings function**

In `server/config-store.ts`, update mergeSettings (around line 109-116) to add panes merge:

```typescript
function mergeSettings(base: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return {
    ...base,
    ...patch,
    terminal: { ...base.terminal, ...(patch.terminal || {}) },
    safety: { ...base.safety, ...(patch.safety || {}) },
    panes: { ...base.panes, ...(patch.panes || {}) },
  }
}
```

**Step 4: Run server type check**

Run: `cd .worktrees/pane-picker && npx tsc --noEmit -p server/tsconfig.json 2>&1 | head -20`

Expected: No errors

**Step 5: Commit**

```bash
cd .worktrees/pane-picker && git add server/config-store.ts && git commit -m "$(cat <<'EOF'
feat(server): add panes.defaultNewPane setting

Server-side default is 'ask' (show picker).

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add client-side default for panes setting

**Files:**
- Modify: `src/store/settingsSlice.ts`

**Step 1: Find defaultSettings in settingsSlice**

The client uses defaultSettings imported or defined locally. Find and update it.

Run: `grep -n "defaultSettings" .worktrees/pane-picker/src/store/settingsSlice.ts`

**Step 2: Update client defaultSettings**

Add `panes` section to the default settings object:

```typescript
  panes: {
    defaultNewPane: 'ask' as const,
  },
```

**Step 3: Run type check**

Run: `cd .worktrees/pane-picker && npx tsc --noEmit 2>&1 | head -20`

Expected: No errors

**Step 4: Commit**

```bash
cd .worktrees/pane-picker && git add src/store/settingsSlice.ts && git commit -m "$(cat <<'EOF'
feat(client): add panes.defaultNewPane default setting

Client-side default is 'ask' (show picker).

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Add Panes section to SettingsView

**Files:**
- Modify: `src/components/SettingsView.tsx`
- Test: `test/unit/client/components/SettingsView.test.tsx` (create if needed)

**Step 1: Write the failing test**

Create `test/unit/client/components/SettingsView.panes.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import SettingsView from '@/components/SettingsView'
import settingsReducer from '@/store/settingsSlice'

// Mock the API
vi.mock('@/lib/api', () => ({
  api: {
    patch: vi.fn().mockResolvedValue({}),
  },
}))

function createTestStore(defaultNewPane: 'ask' | 'shell' | 'browser' | 'editor' = 'ask') {
  return configureStore({
    reducer: {
      settings: settingsReducer,
    },
    preloadedState: {
      settings: {
        settings: {
          theme: 'system',
          uiScale: 1,
          terminal: {
            fontSize: 14,
            fontFamily: 'monospace',
            lineHeight: 1.2,
            cursorBlink: true,
            scrollback: 5000,
            theme: 'auto',
          },
          safety: {
            autoKillIdleMinutes: 180,
            warnBeforeKillMinutes: 5,
          },
          sidebar: {
            sortMode: 'activity',
            showProjectBadges: true,
            width: 288,
            collapsed: false,
          },
          panes: {
            defaultNewPane,
          },
        },
        loaded: true,
        lastSavedAt: Date.now(),
      },
    },
  })
}

describe('SettingsView Panes section', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders Panes section', () => {
    const store = createTestStore()
    render(
      <Provider store={store}>
        <SettingsView />
      </Provider>
    )

    expect(screen.getByText('Panes')).toBeInTheDocument()
  })

  it('renders Default new pane dropdown', () => {
    const store = createTestStore()
    render(
      <Provider store={store}>
        <SettingsView />
      </Provider>
    )

    expect(screen.getByText('Default new pane')).toBeInTheDocument()
  })

  it('shows current setting value in dropdown', () => {
    const store = createTestStore('shell')
    render(
      <Provider store={store}>
        <SettingsView />
      </Provider>
    )

    const dropdown = screen.getByRole('combobox', { name: /default new pane/i })
    expect(dropdown).toHaveValue('shell')
  })

  it('has all four options in dropdown', () => {
    const store = createTestStore()
    render(
      <Provider store={store}>
        <SettingsView />
      </Provider>
    )

    const dropdown = screen.getByRole('combobox', { name: /default new pane/i })
    const options = dropdown.querySelectorAll('option')

    expect(options).toHaveLength(4)
    expect(options[0]).toHaveValue('ask')
    expect(options[1]).toHaveValue('shell')
    expect(options[2]).toHaveValue('browser')
    expect(options[3]).toHaveValue('editor')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd .worktrees/pane-picker && npx vitest run test/unit/client/components/SettingsView.panes.test.tsx 2>&1 | tail -30`

Expected: FAIL - "Panes" not found

**Step 3: Add Panes section to SettingsView**

In `src/components/SettingsView.tsx`, after the Sidebar section (around line 394), add:

```typescript
          {/* Panes */}
          <SettingsSection title="Panes" description="New pane behavior">
            <SettingsRow label="Default new pane">
              <select
                aria-label="Default new pane"
                value={settings.panes?.defaultNewPane || 'ask'}
                onChange={(e) => {
                  const v = e.target.value as 'ask' | 'shell' | 'browser' | 'editor'
                  dispatch(updateSettingsLocal({ panes: { defaultNewPane: v } } as any))
                  scheduleSave({ panes: { defaultNewPane: v } })
                }}
                className="h-8 px-3 text-sm bg-muted border-0 rounded-md focus:outline-none focus:ring-1 focus:ring-border"
              >
                <option value="ask">Ask</option>
                <option value="shell">Shell</option>
                <option value="browser">Browser</option>
                <option value="editor">Editor</option>
              </select>
            </SettingsRow>
          </SettingsSection>
```

**Step 4: Run test to verify it passes**

Run: `cd .worktrees/pane-picker && npx vitest run test/unit/client/components/SettingsView.panes.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
cd .worktrees/pane-picker && git add src/components/SettingsView.tsx test/unit/client/components/SettingsView.panes.test.tsx && git commit -m "$(cat <<'EOF'
feat(settings): add Panes section with defaultNewPane dropdown

New setting controls what happens when creating new panes:
- Ask: show picker UI
- Shell/Browser/Editor: create that type directly

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Create PanePicker component

**Files:**
- Create: `src/components/panes/PanePicker.tsx`
- Create: `test/unit/client/components/panes/PanePicker.test.tsx`

**Step 1: Write the failing tests**

Create `test/unit/client/components/panes/PanePicker.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import PanePicker from '@/components/panes/PanePicker'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Terminal: ({ className }: { className?: string }) => (
    <svg data-testid="terminal-icon" className={className} />
  ),
  Globe: ({ className }: { className?: string }) => (
    <svg data-testid="globe-icon" className={className} />
  ),
  FileText: ({ className }: { className?: string }) => (
    <svg data-testid="file-text-icon" className={className} />
  ),
}))

describe('PanePicker', () => {
  let onSelect: ReturnType<typeof vi.fn>
  let onCancel: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onSelect = vi.fn()
    onCancel = vi.fn()
  })

  afterEach(() => {
    cleanup()
  })

  describe('rendering', () => {
    it('renders all three options', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)

      expect(screen.getByText('Shell')).toBeInTheDocument()
      expect(screen.getByText('Browser')).toBeInTheDocument()
      expect(screen.getByText('Editor')).toBeInTheDocument()
    })

    it('renders icons for each option', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)

      expect(screen.getByTestId('terminal-icon')).toBeInTheDocument()
      expect(screen.getByTestId('globe-icon')).toBeInTheDocument()
      expect(screen.getByTestId('file-text-icon')).toBeInTheDocument()
    })
  })

  describe('mouse interaction', () => {
    it('calls onSelect with "shell" when Shell is clicked', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)

      fireEvent.click(screen.getByText('Shell'))
      expect(onSelect).toHaveBeenCalledWith('shell')
    })

    it('calls onSelect with "browser" when Browser is clicked', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)

      fireEvent.click(screen.getByText('Browser'))
      expect(onSelect).toHaveBeenCalledWith('browser')
    })

    it('calls onSelect with "editor" when Editor is clicked', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)

      fireEvent.click(screen.getByText('Editor'))
      expect(onSelect).toHaveBeenCalledWith('editor')
    })
  })

  describe('keyboard shortcuts', () => {
    it('calls onSelect with "shell" on S key', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)

      fireEvent.keyDown(document, { key: 's' })
      expect(onSelect).toHaveBeenCalledWith('shell')
    })

    it('calls onSelect with "browser" on B key', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)

      fireEvent.keyDown(document, { key: 'b' })
      expect(onSelect).toHaveBeenCalledWith('browser')
    })

    it('calls onSelect with "editor" on E key', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)

      fireEvent.keyDown(document, { key: 'e' })
      expect(onSelect).toHaveBeenCalledWith('editor')
    })

    it('shortcuts are case-insensitive', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)

      fireEvent.keyDown(document, { key: 'S' })
      expect(onSelect).toHaveBeenCalledWith('shell')
    })
  })

  describe('arrow key navigation', () => {
    it('moves focus right with ArrowRight', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)

      const shellButton = screen.getByText('Shell').closest('button')!
      shellButton.focus()

      fireEvent.keyDown(shellButton, { key: 'ArrowRight' })

      const browserButton = screen.getByText('Browser').closest('button')!
      expect(browserButton).toHaveFocus()
    })

    it('moves focus left with ArrowLeft', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)

      const browserButton = screen.getByText('Browser').closest('button')!
      browserButton.focus()

      fireEvent.keyDown(browserButton, { key: 'ArrowLeft' })

      const shellButton = screen.getByText('Shell').closest('button')!
      expect(shellButton).toHaveFocus()
    })

    it('wraps from last to first on ArrowRight', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)

      const editorButton = screen.getByText('Editor').closest('button')!
      editorButton.focus()

      fireEvent.keyDown(editorButton, { key: 'ArrowRight' })

      const shellButton = screen.getByText('Shell').closest('button')!
      expect(shellButton).toHaveFocus()
    })

    it('wraps from first to last on ArrowLeft', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)

      const shellButton = screen.getByText('Shell').closest('button')!
      shellButton.focus()

      fireEvent.keyDown(shellButton, { key: 'ArrowLeft' })

      const editorButton = screen.getByText('Editor').closest('button')!
      expect(editorButton).toHaveFocus()
    })

    it('selects focused option on Enter', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)

      const browserButton = screen.getByText('Browser').closest('button')!
      browserButton.focus()

      fireEvent.keyDown(browserButton, { key: 'Enter' })
      expect(onSelect).toHaveBeenCalledWith('browser')
    })
  })

  describe('escape behavior', () => {
    it('calls onCancel on Escape when not only pane', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)

      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onCancel).toHaveBeenCalled()
    })

    it('does not call onCancel on Escape when only pane', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={true} />)

      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onCancel).not.toHaveBeenCalled()
    })
  })

  describe('shortcut hints', () => {
    it('shows shortcut hint on hover', async () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)

      const shellButton = screen.getByText('Shell').closest('button')!
      fireEvent.mouseEnter(shellButton)

      // Shortcut hint should appear (the letter S)
      expect(screen.getByText('S', { selector: '.shortcut-hint' })).toBeInTheDocument()
    })

    it('hides shortcut hint on mouse leave', async () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)

      const shellButton = screen.getByText('Shell').closest('button')!
      fireEvent.mouseEnter(shellButton)
      fireEvent.mouseLeave(shellButton)

      expect(screen.queryByText('S', { selector: '.shortcut-hint' })).not.toBeInTheDocument()
    })

    it('shows shortcut hint on focus', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)

      const shellButton = screen.getByText('Shell').closest('button')!
      fireEvent.focus(shellButton)

      expect(screen.getByText('S', { selector: '.shortcut-hint' })).toBeInTheDocument()
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd .worktrees/pane-picker && npx vitest run test/unit/client/components/panes/PanePicker.test.tsx 2>&1 | tail -20`

Expected: FAIL - module not found

**Step 3: Create PanePicker component**

Create `src/components/panes/PanePicker.tsx`:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal, Globe, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

type PaneType = 'shell' | 'browser' | 'editor'

interface PickerOption {
  type: PaneType
  label: string
  icon: typeof Terminal
  shortcut: string
}

const options: PickerOption[] = [
  { type: 'shell', label: 'Shell', icon: Terminal, shortcut: 'S' },
  { type: 'browser', label: 'Browser', icon: Globe, shortcut: 'B' },
  { type: 'editor', label: 'Editor', icon: FileText, shortcut: 'E' },
]

interface PanePickerProps {
  onSelect: (type: PaneType) => void
  onCancel: () => void
  isOnlyPane: boolean
}

export default function PanePicker({ onSelect, onCancel, isOnlyPane }: PanePickerProps) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()

      // Single-key shortcuts
      const option = options.find((o) => o.shortcut.toLowerCase() === key)
      if (option) {
        e.preventDefault()
        onSelect(option.type)
        return
      }

      // Escape to cancel (only if not only pane)
      if (e.key === 'Escape' && !isOnlyPane) {
        e.preventDefault()
        onCancel()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onSelect, onCancel, isOnlyPane])

  const handleArrowNav = useCallback((e: React.KeyboardEvent, currentIndex: number) => {
    let nextIndex: number | null = null

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        nextIndex = (currentIndex + 1) % options.length
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        nextIndex = (currentIndex - 1 + options.length) % options.length
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        onSelect(options[currentIndex].type)
        return
    }

    if (nextIndex !== null) {
      setFocusedIndex(nextIndex)
      buttonRefs.current[nextIndex]?.focus()
    }
  }, [onSelect])

  const showHint = (index: number) => focusedIndex === index || hoveredIndex === index

  return (
    <div className="h-full w-full flex items-center justify-center p-8">
      <div className="flex flex-wrap justify-center gap-8">
        {options.map((option, index) => (
          <button
            key={option.type}
            ref={(el) => { buttonRefs.current[index] = el }}
            onClick={() => onSelect(option.type)}
            onKeyDown={(e) => handleArrowNav(e, index)}
            onFocus={() => setFocusedIndex(index)}
            onBlur={() => setFocusedIndex(null)}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            className={cn(
              'flex flex-col items-center gap-3 p-6 rounded-lg',
              'transition-all duration-150',
              'hover:opacity-100 focus:opacity-100 focus:outline-none',
              'opacity-50 hover:scale-105'
            )}
          >
            <option.icon className="h-12 w-12" />
            <span className="text-sm font-medium">{option.label}</span>
            {showHint(index) && (
              <span className="shortcut-hint text-xs opacity-60 -mt-1">
                {option.shortcut}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `cd .worktrees/pane-picker && npx vitest run test/unit/client/components/panes/PanePicker.test.tsx`

Expected: PASS (or mostly pass - adjust tests/implementation as needed)

**Step 5: Export from panes index**

In `src/components/panes/index.ts`, add:

```typescript
export { default as PanePicker } from './PanePicker'
```

**Step 6: Commit**

```bash
cd .worktrees/pane-picker && git add src/components/panes/PanePicker.tsx src/components/panes/index.ts test/unit/client/components/panes/PanePicker.test.tsx && git commit -m "$(cat <<'EOF'
feat(panes): add PanePicker component

Centered icon picker for selecting pane type:
- Shell, Browser, Editor options
- Keyboard shortcuts (S, B, E)
- Arrow key navigation
- Escape to cancel (when not only pane)
- Shortcut hints on hover/focus

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Update PaneContainer to render PanePicker

**Files:**
- Modify: `src/components/panes/PaneContainer.tsx`
- Modify: `test/unit/client/components/panes/PaneContainer.test.tsx`

**Step 1: Write the failing test**

Add to `test/unit/client/components/panes/PaneContainer.test.tsx` (find appropriate describe block):

```typescript
describe('picker pane', () => {
  it('renders PanePicker for picker content', () => {
    // Set up test with picker content
    const store = createTestStore({
      layouts: {
        'tab-1': {
          type: 'leaf',
          id: 'pane-1',
          content: { kind: 'picker' },
        },
      },
      activePane: { 'tab-1': 'pane-1' },
      paneTitles: {},
    })

    render(
      <Provider store={store}>
        <PaneContainer tabId="tab-1" node={store.getState().panes.layouts['tab-1']} />
      </Provider>
    )

    expect(screen.getByText('Shell')).toBeInTheDocument()
    expect(screen.getByText('Browser')).toBeInTheDocument()
    expect(screen.getByText('Editor')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd .worktrees/pane-picker && npx vitest run test/unit/client/components/panes/PaneContainer.test.tsx -t "picker pane" 2>&1 | tail -20`

Expected: FAIL - renderContent returns null for picker

**Step 3: Update PaneContainer renderContent**

In `src/components/panes/PaneContainer.tsx`:

1. Add import at top:
```typescript
import PanePicker from './PanePicker'
```

2. Update renderContent function to add picker case before the final return null:

```typescript
  if (content.kind === 'picker') {
    return (
      <PanePicker
        onSelect={(type) => {
          // Will be implemented in next task
        }}
        onCancel={() => {
          // Will be implemented in next task
        }}
        isOnlyPane={false} // Will be passed properly in next task
      />
    )
  }
```

**Step 4: Run test to verify it passes**

Run: `cd .worktrees/pane-picker && npx vitest run test/unit/client/components/panes/PaneContainer.test.tsx -t "picker pane"`

Expected: PASS

**Step 5: Commit**

```bash
cd .worktrees/pane-picker && git add src/components/panes/PaneContainer.tsx test/unit/client/components/panes/PaneContainer.test.tsx && git commit -m "$(cat <<'EOF'
feat(panes): render PanePicker in PaneContainer

PaneContainer now renders PanePicker for picker content type.
Selection and cancel handlers are placeholders (next task).

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Wire up PanePicker selection and cancel

**Files:**
- Modify: `src/components/panes/PaneContainer.tsx`
- Modify: `test/unit/client/components/panes/PaneContainer.test.tsx`

**Step 1: Write the failing test**

Add to PaneContainer tests:

```typescript
describe('picker selection', () => {
  it('updates pane content when shell is selected', async () => {
    const store = createTestStore({
      layouts: {
        'tab-1': {
          type: 'leaf',
          id: 'pane-1',
          content: { kind: 'picker' },
        },
      },
      activePane: { 'tab-1': 'pane-1' },
      paneTitles: {},
    })

    render(
      <Provider store={store}>
        <PaneContainer tabId="tab-1" node={store.getState().panes.layouts['tab-1']} />
      </Provider>
    )

    fireEvent.click(screen.getByText('Shell'))

    // Wait for state update
    await waitFor(() => {
      const layout = store.getState().panes.layouts['tab-1']
      expect(layout.type).toBe('leaf')
      if (layout.type === 'leaf') {
        expect(layout.content.kind).toBe('terminal')
      }
    })
  })
})
```

**Step 2: Run test to verify it fails**

Expected: FAIL - content not updated

**Step 3: Update PaneContainer with proper handlers**

In `src/components/panes/PaneContainer.tsx`, update the renderContent function's picker case:

```typescript
  if (content.kind === 'picker') {
    return (
      <PickerWrapper
        tabId={tabId}
        paneId={paneId}
        isOnlyPane={isOnlyPane}
      />
    )
  }
```

Add a new PickerWrapper component in the same file (before renderContent):

```typescript
function PickerWrapper({
  tabId,
  paneId,
  isOnlyPane,
}: {
  tabId: string
  paneId: string
  isOnlyPane: boolean
}) {
  const dispatch = useAppDispatch()
  const ws = useMemo(() => getWsClient(), [])

  const handleSelect = useCallback((type: 'shell' | 'browser' | 'editor') => {
    let newContent: PaneContent

    switch (type) {
      case 'shell':
        newContent = {
          kind: 'terminal',
          mode: 'shell',
          shell: 'system',
          createRequestId: nanoid(),
          status: 'creating',
        }
        break
      case 'browser':
        newContent = {
          kind: 'browser',
          url: '',
          devToolsOpen: false,
        }
        break
      case 'editor':
        newContent = {
          kind: 'editor',
          filePath: null,
          language: null,
          readOnly: false,
          content: '',
          viewMode: 'source',
        }
        break
    }

    dispatch(updatePaneContent({ tabId, paneId, content: newContent }))
  }, [dispatch, tabId, paneId])

  const handleCancel = useCallback(() => {
    dispatch(closePane({ tabId, paneId }))
  }, [dispatch, tabId, paneId])

  return (
    <PanePicker
      onSelect={handleSelect}
      onCancel={handleCancel}
      isOnlyPane={isOnlyPane}
    />
  )
}
```

Add the import for nanoid at the top:
```typescript
import { nanoid } from 'nanoid'
```

**Step 4: Update renderContent signature**

The renderContent function needs access to isOnlyPane. Update its signature:

```typescript
function renderContent(
  tabId: string,
  paneId: string,
  content: PaneContent,
  isOnlyPane: boolean,
  hidden?: boolean
)
```

And update the call site in PaneContainer.

**Step 5: Run test to verify it passes**

Run: `cd .worktrees/pane-picker && npx vitest run test/unit/client/components/panes/PaneContainer.test.tsx -t "picker selection"`

Expected: PASS

**Step 6: Commit**

```bash
cd .worktrees/pane-picker && git add src/components/panes/PaneContainer.tsx test/unit/client/components/panes/PaneContainer.test.tsx && git commit -m "$(cat <<'EOF'
feat(panes): wire up PanePicker selection and cancel

Selecting a pane type updates pane content via Redux.
Cancel (Escape on non-only panes) closes the pane.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Update TabContent to respect defaultNewPane setting

**Files:**
- Modify: `src/components/TabContent.tsx`
- Create: `test/unit/client/components/TabContent.defaultPane.test.tsx`

**Step 1: Write the failing test**

Create `test/unit/client/components/TabContent.defaultPane.test.tsx`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import TabContent from '@/components/TabContent'
import tabsReducer from '@/store/tabsSlice'
import panesReducer from '@/store/panesSlice'
import settingsReducer from '@/store/settingsSlice'

// Mock PaneLayout to inspect what it receives
vi.mock('@/components/panes', () => ({
  PaneLayout: ({ defaultContent }: any) => (
    <div data-testid="pane-layout" data-content-kind={defaultContent.kind}>
      PaneLayout
    </div>
  ),
}))

function createTestStore(defaultNewPane: 'ask' | 'shell' | 'browser' | 'editor') {
  return configureStore({
    reducer: {
      tabs: tabsReducer,
      panes: panesReducer,
      settings: settingsReducer,
    },
    preloadedState: {
      tabs: {
        tabs: [
          {
            id: 'tab-1',
            createRequestId: 'req-1',
            title: 'Test Tab',
            status: 'running',
            mode: 'shell',
            createdAt: Date.now(),
          },
        ],
        activeTabId: 'tab-1',
      },
      panes: {
        layouts: {},
        activePane: {},
        paneTitles: {},
      },
      settings: {
        settings: {
          theme: 'system',
          uiScale: 1,
          terminal: { fontSize: 14, fontFamily: 'monospace', lineHeight: 1.2, cursorBlink: true, scrollback: 5000, theme: 'auto' },
          safety: { autoKillIdleMinutes: 180, warnBeforeKillMinutes: 5 },
          sidebar: { sortMode: 'activity', showProjectBadges: true, width: 288, collapsed: false },
          panes: { defaultNewPane },
        },
        loaded: true,
      },
    },
  })
}

describe('TabContent defaultNewPane setting', () => {
  afterEach(() => {
    cleanup()
  })

  it('passes picker content when setting is "ask"', () => {
    const store = createTestStore('ask')
    render(
      <Provider store={store}>
        <TabContent tabId="tab-1" />
      </Provider>
    )

    const paneLayout = screen.getByTestId('pane-layout')
    expect(paneLayout).toHaveAttribute('data-content-kind', 'picker')
  })

  it('passes terminal content when setting is "shell"', () => {
    const store = createTestStore('shell')
    render(
      <Provider store={store}>
        <TabContent tabId="tab-1" />
      </Provider>
    )

    const paneLayout = screen.getByTestId('pane-layout')
    expect(paneLayout).toHaveAttribute('data-content-kind', 'terminal')
  })

  it('passes browser content when setting is "browser"', () => {
    const store = createTestStore('browser')
    render(
      <Provider store={store}>
        <TabContent tabId="tab-1" />
      </Provider>
    )

    const paneLayout = screen.getByTestId('pane-layout')
    expect(paneLayout).toHaveAttribute('data-content-kind', 'browser')
  })

  it('passes editor content when setting is "editor"', () => {
    const store = createTestStore('editor')
    render(
      <Provider store={store}>
        <TabContent tabId="tab-1" />
      </Provider>
    )

    const paneLayout = screen.getByTestId('pane-layout')
    expect(paneLayout).toHaveAttribute('data-content-kind', 'editor')
  })
})
```

**Step 2: Run test to verify it fails**

Expected: FAIL - content kind is always 'terminal'

**Step 3: Update TabContent**

In `src/components/TabContent.tsx`, update the defaultContent logic:

```typescript
import { useAppSelector } from '@/store/hooks'
import type { PaneContentInput } from '@/store/paneTypes'

export default function TabContent({ tabId, hidden }: TabContentProps) {
  const tab = useAppSelector((s) => s.tabs.tabs.find((t) => t.id === tabId))
  const defaultNewPane = useAppSelector((s) => s.settings.settings.panes?.defaultNewPane || 'ask')

  if (!tab) return null

  // For claude mode with existing claudeSessionId and no terminal, use ClaudeSessionView
  if (tab.mode === 'claude' && tab.claudeSessionId && !tab.terminalId) {
    return <ClaudeSessionView sessionId={tab.claudeSessionId} hidden={hidden} />
  }

  // Build default content based on setting
  let defaultContent: PaneContentInput

  if (defaultNewPane === 'ask') {
    defaultContent = { kind: 'picker' }
  } else if (defaultNewPane === 'browser') {
    defaultContent = { kind: 'browser', url: '', devToolsOpen: false }
  } else if (defaultNewPane === 'editor') {
    defaultContent = {
      kind: 'editor',
      filePath: null,
      language: null,
      readOnly: false,
      content: '',
      viewMode: 'source',
    }
  } else {
    // 'shell' or default
    defaultContent = {
      kind: 'terminal',
      mode: tab.mode,
      shell: tab.shell,
      resumeSessionId: tab.resumeSessionId,
      initialCwd: tab.initialCwd,
      terminalId: tab.terminalId,
    }
  }

  return (
    <div className={hidden ? 'hidden' : 'h-full w-full'}>
      <PaneLayout tabId={tabId} defaultContent={defaultContent} hidden={hidden} />
    </div>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `cd .worktrees/pane-picker && npx vitest run test/unit/client/components/TabContent.defaultPane.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
cd .worktrees/pane-picker && git add src/components/TabContent.tsx test/unit/client/components/TabContent.defaultPane.test.tsx && git commit -m "$(cat <<'EOF'
feat(tabs): respect panes.defaultNewPane setting

New tabs now check the setting:
- 'ask': show picker
- 'shell': create terminal (current behavior)
- 'browser': create browser
- 'editor': create editor

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Simplify FloatingActionButton

**Files:**
- Modify: `src/components/panes/FloatingActionButton.tsx`
- Modify: `test/unit/client/components/panes/FloatingActionButton.test.tsx`

**Step 1: Update the test file for new behavior**

Replace most of `FloatingActionButton.test.tsx` with simpler tests:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import FloatingActionButton from '@/components/panes/FloatingActionButton'

vi.mock('lucide-react', () => ({
  Plus: ({ className }: { className?: string }) => (
    <svg data-testid="plus-icon" className={className} />
  ),
}))

describe('FloatingActionButton', () => {
  let onAdd: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onAdd = vi.fn()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the FAB button', () => {
    render(<FloatingActionButton onAdd={onAdd} />)
    expect(screen.getByTitle('Add pane')).toBeInTheDocument()
  })

  it('calls onAdd when clicked', () => {
    render(<FloatingActionButton onAdd={onAdd} />)
    fireEvent.click(screen.getByTitle('Add pane'))
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('has aria-label for accessibility', () => {
    render(<FloatingActionButton onAdd={onAdd} />)
    expect(screen.getByTitle('Add pane')).toHaveAttribute('aria-label', 'Add pane')
  })

  it('calls onAdd on Enter key', () => {
    render(<FloatingActionButton onAdd={onAdd} />)
    const button = screen.getByTitle('Add pane')
    fireEvent.keyDown(button, { key: 'Enter' })
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('calls onAdd on Space key', () => {
    render(<FloatingActionButton onAdd={onAdd} />)
    const button = screen.getByTitle('Add pane')
    fireEvent.keyDown(button, { key: ' ' })
    expect(onAdd).toHaveBeenCalledTimes(1)
  })
})
```

**Step 2: Run test to verify it fails**

Expected: FAIL - props mismatch (old component has multiple handlers)

**Step 3: Simplify FloatingActionButton**

Replace `src/components/panes/FloatingActionButton.tsx`:

```typescript
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FloatingActionButtonProps {
  onAdd: () => void
}

export default function FloatingActionButton({ onAdd }: FloatingActionButtonProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onAdd()
    }
  }

  return (
    <div className="absolute bottom-4 right-4 z-50">
      <button
        onClick={onAdd}
        onKeyDown={handleKeyDown}
        aria-label="Add pane"
        className={cn(
          'h-12 w-12 rounded-full bg-foreground text-background',
          'flex items-center justify-center',
          'shadow-lg hover:shadow-xl transition-all',
          'hover:scale-105 active:scale-95'
        )}
        title="Add pane"
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `cd .worktrees/pane-picker && npx vitest run test/unit/client/components/panes/FloatingActionButton.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
cd .worktrees/pane-picker && git add src/components/panes/FloatingActionButton.tsx test/unit/client/components/panes/FloatingActionButton.test.tsx && git commit -m "$(cat <<'EOF'
refactor(panes): simplify FloatingActionButton

Remove dropdown menu - FAB now just adds a picker pane.
Simpler props: onAdd instead of onAddTerminal/Browser/Editor.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Update PaneLayout to use simplified FAB

**Files:**
- Modify: `src/components/panes/PaneLayout.tsx`
- Update: `test/unit/client/components/panes/PaneLayout.test.tsx`

**Step 1: Update PaneLayout**

In `src/components/panes/PaneLayout.tsx`, simplify the FAB handlers:

```typescript
  const handleAddPane = useCallback(() => {
    dispatch(addPane({
      tabId,
      newContent: { kind: 'picker' },
    }))
  }, [dispatch, tabId])

  // ... in render:
  <FloatingActionButton onAdd={handleAddPane} />
```

Remove the handleAddTerminal, handleAddBrowser, handleAddEditor callbacks.

**Step 2: Update PaneLayout tests**

Update any tests that reference the old FAB props.

**Step 3: Run tests**

Run: `cd .worktrees/pane-picker && npx vitest run test/unit/client/components/panes/PaneLayout.test.tsx`

Expected: PASS

**Step 4: Commit**

```bash
cd .worktrees/pane-picker && git add src/components/panes/PaneLayout.tsx test/unit/client/components/panes/PaneLayout.test.tsx && git commit -m "$(cat <<'EOF'
feat(panes): FAB now creates picker pane

FAB always creates a picker pane instead of showing dropdown.
User selects pane type in the picker UI.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Add fade animation to PanePicker

**Files:**
- Modify: `src/components/panes/PanePicker.tsx`

**Step 1: Add fade state and animation**

Update PanePicker to fade out on selection:

```typescript
export default function PanePicker({ onSelect, onCancel, isOnlyPane }: PanePickerProps) {
  const [fading, setFading] = useState(false)
  const pendingSelection = useRef<PaneType | null>(null)

  const handleSelect = useCallback((type: PaneType) => {
    if (fading) return
    pendingSelection.current = type
    setFading(true)
  }, [fading])

  // After fade animation completes, trigger actual selection
  const handleAnimationEnd = useCallback(() => {
    if (pendingSelection.current) {
      onSelect(pendingSelection.current)
    }
  }, [onSelect])

  // ... update the container div:
  return (
    <div
      className={cn(
        'h-full w-full flex items-center justify-center p-8',
        'transition-opacity duration-150 ease-out',
        fading && 'opacity-0'
      )}
      onTransitionEnd={handleAnimationEnd}
    >
      {/* ... options */}
    </div>
  )
}
```

**Step 2: Run all pane tests**

Run: `cd .worktrees/pane-picker && npx vitest run test/unit/client/components/panes/`

Expected: PASS

**Step 3: Commit**

```bash
cd .worktrees/pane-picker && git add src/components/panes/PanePicker.tsx && git commit -m "$(cat <<'EOF'
feat(panes): add fade animation to PanePicker

150ms fade-out on selection before content swap.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Run full test suite and fix any issues

**Step 1: Run full test suite**

Run: `cd .worktrees/pane-picker && npm test 2>&1 | tail -50`

**Step 2: Fix any failing tests**

Address any test failures discovered.

**Step 3: Commit fixes if needed**

```bash
cd .worktrees/pane-picker && git add -A && git commit -m "$(cat <<'EOF'
fix: address test failures from pane picker changes

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Manual testing checklist

Test these scenarios manually:

1. **New tab with default='ask':**
   - Open new tab
   - Should see picker with Shell/Browser/Editor
   - Click Shell → terminal loads
   - Click Browser → browser loads
   - Click Editor → editor loads

2. **New tab with default='shell':**
   - Change setting to Shell
   - Open new tab
   - Should immediately open terminal (no picker)

3. **FAB behavior:**
   - With existing pane, click FAB
   - Should add new pane with picker
   - Select an option → that pane type loads

4. **Keyboard shortcuts:**
   - With picker open, press S → shell
   - With picker open, press B → browser
   - With picker open, press E → editor

5. **Escape behavior:**
   - With picker as only pane, press Escape → nothing happens
   - With picker as second pane (via FAB), press Escape → picker pane closes

6. **Arrow navigation:**
   - Tab to an option, use arrow keys to navigate
   - Press Enter to select

7. **Persistence:**
   - Open picker, refresh page → picker still showing

---

## Summary

**Files created:**
- `src/components/panes/PanePicker.tsx`
- `test/unit/client/components/panes/PanePicker.test.tsx`
- `test/unit/client/components/SettingsView.panes.test.tsx`
- `test/unit/client/components/TabContent.defaultPane.test.tsx`
- `test/unit/client/lib/derivePaneTitle.test.ts` (if didn't exist)

**Files modified:**
- `src/store/paneTypes.ts` - Add PickerPaneContent
- `src/store/types.ts` - Add DefaultNewPane type, panes setting
- `src/lib/derivePaneTitle.ts` - Handle picker
- `server/config-store.ts` - Add panes default
- `src/store/settingsSlice.ts` - Add panes default
- `src/components/SettingsView.tsx` - Add Panes section
- `src/components/panes/PaneContainer.tsx` - Render PanePicker
- `src/components/TabContent.tsx` - Respect defaultNewPane
- `src/components/panes/FloatingActionButton.tsx` - Simplify to single button
- `src/components/panes/PaneLayout.tsx` - Use simplified FAB
- `src/components/panes/index.ts` - Export PanePicker
- `test/unit/client/components/panes/FloatingActionButton.test.tsx` - Update for new behavior
