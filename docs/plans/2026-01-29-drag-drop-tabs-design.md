# Drag-and-Drop Tab Reordering Design

## Overview

Add drag-and-drop reordering to the top tab bar, allowing users to rearrange terminal tabs by dragging them to new positions.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Drag outside drop zone | Snap back | Simplest, matches standard tab UIs |
| Visual feedback | Ghost preview | Polished feel, matches Chrome/VS Code |
| Drag handle | Entire tab | Most intuitive, no extra UI clutter |
| Keyboard support | Ctrl+Shift+Arrow | Accessibility requirement |
| Touch support | Long-press (250ms) | Mobile/tablet compatibility |
| Library | @dnd-kit | Modern, accessible, tree-shakeable |
| Animation timing | 150ms | Snappy, responsive feel |
| Auto-scroll | Yes, 15% threshold | Essential for many tabs |

## Dependencies

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

## Architecture

### Redux Changes (tabsSlice.ts)

New `reorderTabs` action:

```typescript
reorderTabs: (state, action: PayloadAction<{ fromIndex: number; toIndex: number }>) => {
  const [removed] = state.tabs.splice(action.payload.fromIndex, 1)
  state.tabs.splice(action.payload.toIndex, 0, removed)
}
```

### Component Structure

```
TabBar.tsx
├── DndContext (from @dnd-kit/core)
│   ├── SortableContext (from @dnd-kit/sortable)
│   │   └── SortableTab (new component, wraps each tab)
│   └── DragOverlay (renders ghost preview)
```

### New Components

**TabItem** - Presentational component extracted from current tab rendering:
- Props: `tab`, `isActive`, `isDragging`, `isRenaming`, `renameValue`, callbacks
- Renders status indicator, title/input, close button
- `isDragging` applies 0.5 opacity to source tab during drag

**SortableTab** - Container wrapping TabItem with dnd-kit behavior:
- Uses `useSortable({ id: tab.id })` hook
- Applies transform/transition styles from hook
- Passes drag listeners to root element

## Drag Behavior Configuration

### Sensors

```typescript
const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: { distance: 5 }
  }),
  useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates
  }),
  useSensor(TouchSensor, {
    activationConstraint: { delay: 250, tolerance: 5 }
  })
)
```

### Collision Detection

`closestCenter` - optimal for horizontal lists of similar-sized items.

### Auto-scroll

```typescript
autoScroll={{
  threshold: { x: 0.15, y: 0 },
  acceleration: 10
}}
```

## Keyboard Accessibility

### Shortcuts

- **Ctrl+Shift+Left** - Move active tab one position left
- **Ctrl+Shift+Right** - Move active tab one position right

### Screen Reader Announcements

Via dnd-kit `announcements` prop:
- "Picked up tab [title]"
- "Tab [title] moved to position [n] of [total]"
- "Tab [title] dropped at position [n]"

## Styling

### Ghost Preview (DragOverlay)

```typescript
{
  opacity: 0.9,
  transform: 'scale(1.02)',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  cursor: 'grabbing'
}
```

### Transition Animation

```typescript
transition: 'transform 150ms ease'
```

### Source Tab During Drag

Opacity 0.5 to indicate original position.

## State Persistence

No changes required - existing `persistMiddleware` serializes `tabs` array order to localStorage.

## Integration Notes

**closeTab Thunk**: The `closeTab` action is now an async thunk that dispatches both `removeTab` and `removeLayout` (for pane cleanup). The TabBar already uses this correctly - no changes needed for close behavior.

## Testing Strategy

### Unit Tests (tabsSlice.test.ts)

- `reorderTabs` moves tab from index 0 to 2
- `reorderTabs` moves tab from index 2 to 0
- `reorderTabs` with same from/to index is no-op
- `reorderTabs` preserves activeTabId

### Component Tests (TabBar.test.tsx)

- Renders tabs in correct order
- Drag and drop reorders tabs (mock dnd-kit events)
- Ctrl+Shift+Left moves tab left
- Ctrl+Shift+Right moves tab right
- Keyboard at boundary does nothing

### E2E Tests (tabs-reorder.e2e.ts)

- Create 3 tabs, drag tab 1 to position 3, verify order
- Create 3 tabs, use keyboard to reorder, verify order
- Reorder persists after page refresh

## Implementation Tasks

1. Add dependencies: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
2. Add `reorderTabs` reducer to `tabsSlice.ts`
3. Write unit tests for `reorderTabs` action
4. Extract `TabItem` presentational component from `TabBar.tsx`
5. Create `SortableTab` wrapper component
6. Integrate dnd-kit in `TabBar` with sensors, context, overlay
7. Add keyboard shortcuts for Ctrl+Shift+Arrow reordering
8. Write component tests for drag/keyboard behavior
9. Write E2E tests for full reorder flow
10. Refactor - clean up, ensure no duplication
