# Drag-and-Drop Tab Reordering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable users to reorder tabs by dragging them to new positions, with keyboard accessibility and touch support.

**Architecture:** Add @dnd-kit library for drag-and-drop. Extract TabItem presentational component from TabBar. Add reorderTabs reducer to tabsSlice. Wrap tabs in SortableContext with DragOverlay for ghost preview.

**Tech Stack:** @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, React, Redux Toolkit, Vitest, Testing Library

---

## Task 1: Add Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install @dnd-kit packages**

Run:
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

**Step 2: Verify installation**

Run: `npm ls @dnd-kit/core`
Expected: Shows installed version (e.g., `@dnd-kit/core@6.x.x`)

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @dnd-kit dependencies for tab reordering"
```

---

## Task 2: Add reorderTabs Reducer - Red Phase

**Files:**
- Test: `test/unit/client/store/tabsSlice.test.ts`

**Step 1: Write failing tests for reorderTabs**

Add to `test/unit/client/store/tabsSlice.test.ts` after the `hydrateTabs` describe block:

```typescript
describe('reorderTabs', () => {
  it('moves tab from index 0 to index 2', () => {
    // Setup: create 3 tabs
    let state = tabsReducer(initialState, addTab({ title: 'Tab A' }))
    const tabAId = state.tabs[0].id
    state = tabsReducer(state, addTab({ title: 'Tab B' }))
    const tabBId = state.tabs[1].id
    state = tabsReducer(state, addTab({ title: 'Tab C' }))
    const tabCId = state.tabs[2].id

    // Move Tab A from index 0 to index 2
    state = tabsReducer(state, reorderTabs({ fromIndex: 0, toIndex: 2 }))

    // Order should now be: B, C, A
    expect(state.tabs[0].id).toBe(tabBId)
    expect(state.tabs[1].id).toBe(tabCId)
    expect(state.tabs[2].id).toBe(tabAId)
  })

  it('moves tab from index 2 to index 0', () => {
    let state = tabsReducer(initialState, addTab({ title: 'Tab A' }))
    const tabAId = state.tabs[0].id
    state = tabsReducer(state, addTab({ title: 'Tab B' }))
    const tabBId = state.tabs[1].id
    state = tabsReducer(state, addTab({ title: 'Tab C' }))
    const tabCId = state.tabs[2].id

    // Move Tab C from index 2 to index 0
    state = tabsReducer(state, reorderTabs({ fromIndex: 2, toIndex: 0 }))

    // Order should now be: C, A, B
    expect(state.tabs[0].id).toBe(tabCId)
    expect(state.tabs[1].id).toBe(tabAId)
    expect(state.tabs[2].id).toBe(tabBId)
  })

  it('is a no-op when fromIndex equals toIndex', () => {
    let state = tabsReducer(initialState, addTab({ title: 'Tab A' }))
    const tabAId = state.tabs[0].id
    state = tabsReducer(state, addTab({ title: 'Tab B' }))
    const tabBId = state.tabs[1].id

    state = tabsReducer(state, reorderTabs({ fromIndex: 1, toIndex: 1 }))

    expect(state.tabs[0].id).toBe(tabAId)
    expect(state.tabs[1].id).toBe(tabBId)
  })

  it('preserves activeTabId when reordering', () => {
    let state = tabsReducer(initialState, addTab({ title: 'Tab A' }))
    state = tabsReducer(state, addTab({ title: 'Tab B' }))
    const tabBId = state.tabs[1].id
    state = tabsReducer(state, addTab({ title: 'Tab C' }))

    // Tab C is active (last added)
    const activeId = state.activeTabId

    state = tabsReducer(state, reorderTabs({ fromIndex: 0, toIndex: 2 }))

    // activeTabId should be unchanged
    expect(state.activeTabId).toBe(activeId)
  })
})
```

Also update the import at the top of the file to include `reorderTabs`:

```typescript
import tabsReducer, {
  addTab,
  setActiveTab,
  updateTab,
  removeTab,
  hydrateTabs,
  reorderTabs,
  TabsState,
} from '../../../../src/store/tabsSlice'
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- test/unit/client/store/tabsSlice.test.ts`
Expected: FAIL - `reorderTabs` is not exported

---

## Task 3: Add reorderTabs Reducer - Green Phase

**Files:**
- Modify: `src/store/tabsSlice.ts`

**Step 1: Add reorderTabs reducer**

In `src/store/tabsSlice.ts`, add the reducer inside the `reducers` object (after `hydrateTabs`):

```typescript
    reorderTabs: (
      state,
      action: PayloadAction<{ fromIndex: number; toIndex: number }>
    ) => {
      const { fromIndex, toIndex } = action.payload
      if (fromIndex === toIndex) return
      const [removed] = state.tabs.splice(fromIndex, 1)
      state.tabs.splice(toIndex, 0, removed)
    },
```

**Step 2: Export the action**

Update the export line:

```typescript
export const { addTab, setActiveTab, updateTab, removeTab, hydrateTabs, reorderTabs } = tabsSlice.actions
```

**Step 3: Run tests to verify they pass**

Run: `npm test -- test/unit/client/store/tabsSlice.test.ts`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/store/tabsSlice.ts test/unit/client/store/tabsSlice.test.ts
git commit -m "feat(tabs): add reorderTabs reducer for drag-and-drop support"
```

---

## Task 4: Extract TabItem Component - Red Phase

**Files:**
- Test: `test/unit/client/components/TabItem.test.tsx` (new)

**Step 1: Create test file for TabItem**

Create `test/unit/client/components/TabItem.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TabItem from '@/components/TabItem'
import type { Tab } from '@/store/types'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  X: ({ className }: { className?: string }) => (
    <svg data-testid="x-icon" className={className} />
  ),
  Circle: ({ className }: { className?: string }) => (
    <svg data-testid="circle-icon" className={className} />
  ),
}))

function createTab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: 'tab-1',
    createRequestId: 'req-1',
    title: 'Test Tab',
    status: 'running',
    mode: 'shell',
    shell: 'system',
    createdAt: Date.now(),
    ...overrides,
  }
}

describe('TabItem', () => {
  const defaultProps = {
    tab: createTab(),
    isActive: false,
    isDragging: false,
    isRenaming: false,
    renameValue: '',
    onRenameChange: vi.fn(),
    onRenameBlur: vi.fn(),
    onRenameKeyDown: vi.fn(),
    onClose: vi.fn(),
    onClick: vi.fn(),
    onDoubleClick: vi.fn(),
  }

  it('renders tab title', () => {
    render(<TabItem {...defaultProps} />)
    expect(screen.getByText('Test Tab')).toBeInTheDocument()
  })

  it('applies active styles when isActive is true', () => {
    render(<TabItem {...defaultProps} isActive={true} />)
    const container = screen.getByText('Test Tab').closest('div')
    expect(container?.className).toContain('bg-muted')
  })

  it('applies dragging opacity when isDragging is true', () => {
    render(<TabItem {...defaultProps} isDragging={true} />)
    const container = screen.getByText('Test Tab').closest('div')
    expect(container?.className).toContain('opacity-50')
  })

  it('shows input when isRenaming is true', () => {
    render(
      <TabItem
        {...defaultProps}
        isRenaming={true}
        renameValue="Editing"
      />
    )
    expect(screen.getByDisplayValue('Editing')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<TabItem {...defaultProps} onClick={onClick} />)

    fireEvent.click(screen.getByText('Test Tab').closest('div')!)
    expect(onClick).toHaveBeenCalled()
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    render(<TabItem {...defaultProps} onClose={onClose} />)

    const closeButton = screen.getByTitle('Close (Shift+Click to kill)')
    fireEvent.click(closeButton)
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onDoubleClick when double-clicked', () => {
    const onDoubleClick = vi.fn()
    render(<TabItem {...defaultProps} onDoubleClick={onDoubleClick} />)

    fireEvent.doubleClick(screen.getByText('Test Tab').closest('div')!)
    expect(onDoubleClick).toHaveBeenCalled()
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- test/unit/client/components/TabItem.test.tsx`
Expected: FAIL - module not found

---

## Task 5: Extract TabItem Component - Green Phase

**Files:**
- Create: `src/components/TabItem.tsx`

**Step 1: Create TabItem component**

Create `src/components/TabItem.tsx`:

```typescript
import { X, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Tab } from '@/store/types'
import type { MouseEvent, KeyboardEvent } from 'react'

function StatusIndicator({ status }: { status: string }) {
  if (status === 'running') {
    return (
      <div className="relative">
        <Circle className="h-2 w-2 fill-success text-success" />
      </div>
    )
  }
  if (status === 'exited') {
    return <Circle className="h-2 w-2 text-muted-foreground/40" />
  }
  if (status === 'error') {
    return <Circle className="h-2 w-2 fill-destructive text-destructive" />
  }
  return <Circle className="h-2 w-2 text-muted-foreground/20 animate-pulse" />
}

export interface TabItemProps {
  tab: Tab
  isActive: boolean
  isDragging: boolean
  isRenaming: boolean
  renameValue: string
  onRenameChange: (value: string) => void
  onRenameBlur: () => void
  onRenameKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
  onClose: (e: MouseEvent<HTMLButtonElement>) => void
  onClick: () => void
  onDoubleClick: () => void
}

export default function TabItem({
  tab,
  isActive,
  isDragging,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameBlur,
  onRenameKeyDown,
  onClose,
  onClick,
  onDoubleClick,
}: TabItemProps) {
  return (
    <div
      className={cn(
        'group flex items-center gap-2 h-7 px-3 rounded-md text-sm cursor-pointer transition-all',
        isActive
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
        isDragging && 'opacity-50'
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <StatusIndicator status={tab.status} />

      {isRenaming ? (
        <input
          className="bg-transparent outline-none w-32 text-sm"
          value={renameValue}
          autoFocus
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onRenameBlur}
          onKeyDown={onRenameKeyDown}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className={cn(
            'whitespace-nowrap truncate text-sm',
            isActive ? 'max-w-[10rem]' : 'max-w-[5rem]'
          )}
          title={tab.title}
        >
          {tab.title}
        </span>
      )}

      <button
        className={cn(
          'ml-0.5 p-0.5 rounded transition-opacity',
          isActive
            ? 'opacity-60 hover:opacity-100'
            : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'
        )}
        title="Close (Shift+Click to kill)"
        onClick={(e) => {
          e.stopPropagation()
          onClose(e)
        }}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
```

**Step 2: Run tests to verify they pass**

Run: `npm test -- test/unit/client/components/TabItem.test.tsx`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/components/TabItem.tsx test/unit/client/components/TabItem.test.tsx
git commit -m "refactor(tabs): extract TabItem presentational component"
```

---

## Task 6: Refactor TabBar to Use TabItem

**Files:**
- Modify: `src/components/TabBar.tsx`

**Step 1: Update TabBar to use TabItem**

Replace the contents of `src/components/TabBar.tsx`:

```typescript
import { Plus } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { addTab, closeTab, setActiveTab, updateTab } from '@/store/tabsSlice'
import { getWsClient } from '@/lib/ws-client'
import { useMemo, useState } from 'react'
import TabItem from './TabItem'

export default function TabBar() {
  const dispatch = useAppDispatch()
  const { tabs, activeTabId } = useAppSelector((s) => s.tabs)

  const ws = useMemo(() => getWsClient(), [])

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  if (tabs.length === 0) return null

  return (
    <div className="h-10 flex items-center gap-1 px-2 border-b border-border/30 bg-background">
      <div className="flex items-center gap-0.5 overflow-x-auto flex-1 py-1">
        {tabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            isDragging={false}
            isRenaming={renamingId === tab.id}
            renameValue={renameValue}
            onRenameChange={setRenameValue}
            onRenameBlur={() => {
              dispatch(
                updateTab({
                  id: tab.id,
                  updates: { title: renameValue || tab.title, titleSetByUser: true },
                })
              )
              setRenamingId(null)
            }}
            onRenameKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            onClose={(e) => {
              if (tab.terminalId) {
                ws.send({
                  type: e.shiftKey ? 'terminal.kill' : 'terminal.detach',
                  terminalId: tab.terminalId,
                })
              }
              dispatch(closeTab(tab.id))
            }}
            onClick={() => dispatch(setActiveTab(tab.id))}
            onDoubleClick={() => {
              setRenamingId(tab.id)
              setRenameValue(tab.title)
            }}
          />
        ))}
      </div>

      <button
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        title="New shell tab"
        onClick={() => dispatch(addTab({ mode: 'shell' }))}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
```

**Step 2: Run existing TabBar tests to verify no regression**

Run: `npm test -- test/unit/client/components/TabBar.test.tsx`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/components/TabBar.tsx
git commit -m "refactor(tabs): use TabItem component in TabBar"
```

---

## Task 7: Add Drag-and-Drop to TabBar - Red Phase

**Files:**
- Modify: `test/unit/client/components/TabBar.test.tsx`

**Step 1: Add drag-and-drop tests**

Add to `test/unit/client/components/TabBar.test.tsx` before the closing `})`:

```typescript
  describe('drag and drop reordering', () => {
    it('renders tabs in a sortable container', () => {
      const tab1 = createTab({ id: 'tab-1', title: 'Tab 1' })
      const tab2 = createTab({ id: 'tab-2', title: 'Tab 2' })

      const store = createStore({
        tabs: [tab1, tab2],
        activeTabId: 'tab-1',
      })

      renderWithStore(<TabBar />, store)

      // Both tabs should be rendered (sortable context doesn't change this)
      expect(screen.getByText('Tab 1')).toBeInTheDocument()
      expect(screen.getByText('Tab 2')).toBeInTheDocument()
    })
  })
```

**Step 2: Run tests to verify they pass (baseline)**

Run: `npm test -- test/unit/client/components/TabBar.test.tsx`
Expected: PASS (this is a baseline test before dnd-kit integration)

---

## Task 8: Add Drag-and-Drop to TabBar - Green Phase

**Files:**
- Modify: `src/components/TabBar.tsx`

**Step 1: Update TabBar with dnd-kit integration**

Replace `src/components/TabBar.tsx` with:

```typescript
import { Plus } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { addTab, closeTab, setActiveTab, updateTab, reorderTabs } from '@/store/tabsSlice'
import { getWsClient } from '@/lib/ws-client'
import { useCallback, useMemo, useState } from 'react'
import TabItem from './TabItem'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Tab } from '@/store/types'

interface SortableTabProps {
  tab: Tab
  isActive: boolean
  isDragging: boolean
  isRenaming: boolean
  renameValue: string
  onRenameChange: (value: string) => void
  onRenameBlur: () => void
  onRenameKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onClose: (e: React.MouseEvent<HTMLButtonElement>) => void
  onClick: () => void
  onDoubleClick: () => void
}

function SortableTab({
  tab,
  isActive,
  isDragging,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameBlur,
  onRenameKeyDown,
  onClose,
  onClick,
  onDoubleClick,
}: SortableTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: tab.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 150ms ease',
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TabItem
        tab={tab}
        isActive={isActive}
        isDragging={isDragging}
        isRenaming={isRenaming}
        renameValue={renameValue}
        onRenameChange={onRenameChange}
        onRenameBlur={onRenameBlur}
        onRenameKeyDown={onRenameKeyDown}
        onClose={onClose}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      />
    </div>
  )
}

export default function TabBar() {
  const dispatch = useAppDispatch()
  const { tabs, activeTabId } = useAppSelector((s) => s.tabs)

  const ws = useMemo(() => getWsClient(), [])

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    })
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      setActiveId(null)

      if (over && active.id !== over.id) {
        const oldIndex = tabs.findIndex((t) => t.id === active.id)
        const newIndex = tabs.findIndex((t) => t.id === over.id)
        dispatch(reorderTabs({ fromIndex: oldIndex, toIndex: newIndex }))
      }
    },
    [tabs, dispatch]
  )

  const activeTab = activeId ? tabs.find((t) => t.id === activeId) : null

  if (tabs.length === 0) return null

  return (
    <div className="h-10 flex items-center gap-1 px-2 border-b border-border/30 bg-background">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={tabs.map((t) => t.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex items-center gap-0.5 overflow-x-auto flex-1 py-1">
            {tabs.map((tab) => (
              <SortableTab
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTabId}
                isDragging={activeId === tab.id}
                isRenaming={renamingId === tab.id}
                renameValue={renameValue}
                onRenameChange={setRenameValue}
                onRenameBlur={() => {
                  dispatch(
                    updateTab({
                      id: tab.id,
                      updates: { title: renameValue || tab.title, titleSetByUser: true },
                    })
                  )
                  setRenamingId(null)
                }}
                onRenameKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    ;(e.target as HTMLInputElement).blur()
                  }
                }}
                onClose={(e) => {
                  if (tab.terminalId) {
                    ws.send({
                      type: e.shiftKey ? 'terminal.kill' : 'terminal.detach',
                      terminalId: tab.terminalId,
                    })
                  }
                  dispatch(closeTab(tab.id))
                }}
                onClick={() => dispatch(setActiveTab(tab.id))}
                onDoubleClick={() => {
                  setRenamingId(tab.id)
                  setRenameValue(tab.title)
                }}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeTab ? (
            <div
              style={{
                opacity: 0.9,
                transform: 'scale(1.02)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                cursor: 'grabbing',
              }}
            >
              <TabItem
                tab={activeTab}
                isActive={activeTab.id === activeTabId}
                isDragging={false}
                isRenaming={false}
                renameValue=""
                onRenameChange={() => {}}
                onRenameBlur={() => {}}
                onRenameKeyDown={() => {}}
                onClose={() => {}}
                onClick={() => {}}
                onDoubleClick={() => {}}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <button
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        title="New shell tab"
        onClick={() => dispatch(addTab({ mode: 'shell' }))}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
```

**Step 2: Run all TabBar tests**

Run: `npm test -- test/unit/client/components/TabBar.test.tsx`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/components/TabBar.tsx
git commit -m "feat(tabs): add drag-and-drop reordering with @dnd-kit"
```

---

## Task 9: Add Keyboard Shortcuts - Red Phase

**Files:**
- Modify: `test/unit/client/components/TabBar.test.tsx`

**Step 1: Add keyboard shortcut tests**

Add to the `describe('drag and drop reordering')` block:

```typescript
    it('Ctrl+Shift+ArrowRight moves active tab right', () => {
      const tab1 = createTab({ id: 'tab-1', title: 'Tab 1' })
      const tab2 = createTab({ id: 'tab-2', title: 'Tab 2' })
      const tab3 = createTab({ id: 'tab-3', title: 'Tab 3' })

      const store = createStore({
        tabs: [tab1, tab2, tab3],
        activeTabId: 'tab-1',
      })

      renderWithStore(<TabBar />, store)

      // Press Ctrl+Shift+ArrowRight
      fireEvent.keyDown(window, {
        key: 'ArrowRight',
        ctrlKey: true,
        shiftKey: true,
      })

      // Tab 1 should have moved from index 0 to index 1
      const state = store.getState().tabs
      expect(state.tabs[0].id).toBe('tab-2')
      expect(state.tabs[1].id).toBe('tab-1')
      expect(state.tabs[2].id).toBe('tab-3')
    })

    it('Ctrl+Shift+ArrowLeft moves active tab left', () => {
      const tab1 = createTab({ id: 'tab-1', title: 'Tab 1' })
      const tab2 = createTab({ id: 'tab-2', title: 'Tab 2' })
      const tab3 = createTab({ id: 'tab-3', title: 'Tab 3' })

      const store = createStore({
        tabs: [tab1, tab2, tab3],
        activeTabId: 'tab-2',
      })

      renderWithStore(<TabBar />, store)

      // Press Ctrl+Shift+ArrowLeft
      fireEvent.keyDown(window, {
        key: 'ArrowLeft',
        ctrlKey: true,
        shiftKey: true,
      })

      // Tab 2 should have moved from index 1 to index 0
      const state = store.getState().tabs
      expect(state.tabs[0].id).toBe('tab-2')
      expect(state.tabs[1].id).toBe('tab-1')
      expect(state.tabs[2].id).toBe('tab-3')
    })

    it('Ctrl+Shift+ArrowLeft at first position does nothing', () => {
      const tab1 = createTab({ id: 'tab-1', title: 'Tab 1' })
      const tab2 = createTab({ id: 'tab-2', title: 'Tab 2' })

      const store = createStore({
        tabs: [tab1, tab2],
        activeTabId: 'tab-1',
      })

      renderWithStore(<TabBar />, store)

      fireEvent.keyDown(window, {
        key: 'ArrowLeft',
        ctrlKey: true,
        shiftKey: true,
      })

      // Order unchanged
      const state = store.getState().tabs
      expect(state.tabs[0].id).toBe('tab-1')
      expect(state.tabs[1].id).toBe('tab-2')
    })

    it('Ctrl+Shift+ArrowRight at last position does nothing', () => {
      const tab1 = createTab({ id: 'tab-1', title: 'Tab 1' })
      const tab2 = createTab({ id: 'tab-2', title: 'Tab 2' })

      const store = createStore({
        tabs: [tab1, tab2],
        activeTabId: 'tab-2',
      })

      renderWithStore(<TabBar />, store)

      fireEvent.keyDown(window, {
        key: 'ArrowRight',
        ctrlKey: true,
        shiftKey: true,
      })

      // Order unchanged
      const state = store.getState().tabs
      expect(state.tabs[0].id).toBe('tab-1')
      expect(state.tabs[1].id).toBe('tab-2')
    })
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- test/unit/client/components/TabBar.test.tsx`
Expected: FAIL - keyboard shortcuts not implemented

---

## Task 10: Add Keyboard Shortcuts - Green Phase

**Files:**
- Modify: `src/components/TabBar.tsx`

**Step 1: Add useEffect for keyboard shortcuts**

Add this import at the top:

```typescript
import { useCallback, useEffect, useMemo, useState } from 'react'
```

Add this `useEffect` inside the `TabBar` component, after the `handleDragEnd` callback:

```typescript
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && activeTabId) {
        const currentIndex = tabs.findIndex((t) => t.id === activeTabId)
        if (e.key === 'ArrowLeft' && currentIndex > 0) {
          dispatch(reorderTabs({ fromIndex: currentIndex, toIndex: currentIndex - 1 }))
          e.preventDefault()
        } else if (e.key === 'ArrowRight' && currentIndex < tabs.length - 1) {
          dispatch(reorderTabs({ fromIndex: currentIndex, toIndex: currentIndex + 1 }))
          e.preventDefault()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTabId, tabs, dispatch])
```

**Step 2: Run tests to verify they pass**

Run: `npm test -- test/unit/client/components/TabBar.test.tsx`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/components/TabBar.tsx test/unit/client/components/TabBar.test.tsx
git commit -m "feat(tabs): add Ctrl+Shift+Arrow keyboard shortcuts for tab reordering"
```

---

## Task 11: Run Full Test Suite

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests PASS

**Step 2: If any failures, fix them before proceeding**

---

## Task 12: Manual Testing Checklist

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Manual tests**

- [ ] Create 3+ tabs
- [ ] Drag a tab from position 1 to position 3 - verify order changes
- [ ] Drag a tab from position 3 to position 1 - verify order changes
- [ ] Drag and release in same position - verify no change
- [ ] Drag outside tab bar and release - verify snap back
- [ ] Press Ctrl+Shift+Right on first tab - verify moves right
- [ ] Press Ctrl+Shift+Left on last tab - verify no change
- [ ] Refresh page - verify tab order persists
- [ ] Test on touch device (or emulator) - long-press to drag

**Step 3: Commit any fixes needed**

---

## Task 13: Final Refactor

**Files:**
- Review: `src/components/TabBar.tsx`
- Review: `src/components/TabItem.tsx`

**Step 1: Review for code quality**

- Remove any unused imports
- Ensure consistent formatting
- Check for any duplicate code
- Verify all props are properly typed

**Step 2: Run tests one final time**

Run: `npm test`
Expected: All tests PASS

**Step 3: Final commit**

```bash
git add -A
git commit -m "refactor(tabs): clean up drag-and-drop implementation"
```

---

## Summary

This plan implements drag-and-drop tab reordering with:

1. **reorderTabs reducer** - Pure Redux state management
2. **TabItem component** - Extracted presentational component
3. **@dnd-kit integration** - Modern, accessible drag-and-drop
4. **Keyboard shortcuts** - Ctrl+Shift+Arrow for accessibility
5. **Touch support** - Long-press to drag on mobile
6. **Persistence** - Automatic via existing middleware

Total: ~13 tasks following Red-Green-Refactor TDD pattern.
