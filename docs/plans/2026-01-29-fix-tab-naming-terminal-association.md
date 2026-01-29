# Tab Naming and Terminal Association - Complete Fix

## Executive Summary

Investigation of tab naming bugs revealed two concrete bugs and one misfeature (cwd-based auto-titling). The sidebar architecture is **already session-centric** - sessions from `~/.claude` are the source of truth, and terminal-to-session linking correctly uses explicit `resumeSessionId`. The main work is fixing the bugs, removing the problematic auto-title feature, and renaming "Sessions" to "Coding Agents".

---

## Current Architecture (Already Correct)

The codebase already implements session-centric design correctly:

1. **Sidebar shows sessions as primary entities** - Built from `~/.claude/projects/**/sessions/*.jsonl` files via `ClaudeSessionIndexer`

2. **Terminal-to-session linking uses `resumeSessionId`** - `Sidebar.tsx:97-102`:
   ```ts
   const runningSessionMap = new Map<string, string>()
   terminalsArray.forEach((t) => {
     if (t.mode === 'claude' && t.status === 'running' && t.resumeSessionId) {
       runningSessionMap.set(t.resumeSessionId, t.terminalId)
     }
   })
   ```

3. **Plain shells don't appear in sidebar** - Only Claude sessions show

4. **Click-to-resume passes `terminalId`** - `Sidebar.tsx:179-192` correctly passes `terminalId` when creating tabs for running sessions

**What's broken**: Two bugs and one misfeature that cause incorrect title updates.

---

## Part 1: Bugs to Fix

### Bug #1: CRITICAL - TabContent Doesn't Pass terminalId to Pane

**Problem**: When a tab is created with a `terminalId` (e.g., clicking a running session in Sidebar), the pane initialization creates a NEW terminal instead of attaching to the existing one.

**Root Cause**: `TabContent.tsx` builds `defaultContent` without reading `tab.terminalId`:

```ts
// TabContent.tsx - current (broken)
const defaultContent: PaneContentInput = {
  kind: 'terminal',
  mode: tab.mode,
  shell: tab.shell,
  resumeSessionId: tab.resumeSessionId,
  initialCwd: tab.initialCwd,
  // terminalId NOT passed - causes new terminal creation
}
```

**Why this matters**: When `PaneLayout.tsx` initializes a tab without an existing layout, it uses this `defaultContent`. Without `terminalId`, `TerminalView` creates a new terminal instead of attaching.

**Fix**: Add `terminalId: tab.terminalId` to the `defaultContent` object.

**Note**: The call sites that create tabs (`Sidebar.tsx`, `BackgroundSessions.tsx`, `OverviewView.tsx`) correctly pass `terminalId` to `addTab()`. The bug is only in `TabContent.tsx` not forwarding it to the pane.

---

### Bug #2: LOW - Exit Title Ignores titleSetByUser

**Problem**: User-renamed tabs get "(exit 0)" appended when the terminal exits.

**Location**: `TerminalView.tsx:251-257`:
```ts
if (msg.type === 'terminal.exit' && msg.terminalId === tid) {
  updateContent({ status: 'exited' })
  if (tab) {
    const code = typeof msg.exitCode === 'number' ? msg.exitCode : undefined
    // BUG: Unconditionally modifies title, even if user renamed it
    dispatch(updateTab({ id: tab.id, updates: {
      status: 'exited',
      title: tab.title + (code !== undefined ? ` (exit ${code})` : '')
    }}))
  }
}
```

**Fix**: Check `!tab.titleSetByUser` before modifying the title.

---

## Part 2: Misfeature to Remove

### CWD-Based Auto-Title Updates

**Problem**: `findClaudeTerminalsBySession()` in `terminal-registry.ts` uses fuzzy cwd matching to find terminals for auto-title updates. This causes wrong terminals to get title updates.

**Location**: `terminal-registry.ts:478-492`:
```ts
findClaudeTerminalsBySession(sessionId: string, cwd?: string): TerminalRecord[] {
  const results: TerminalRecord[] = []
  for (const term of this.terminals.values()) {
    if (term.mode !== 'claude') continue
    // Good: Exact match by resumeSessionId
    if (term.resumeSessionId === sessionId) {
      results.push(term)
      continue
    }
    // Bad: Fuzzy match by cwd - can match wrong terminals
    if (cwd && term.cwd && this.cwdMatches(term.cwd, cwd)) {
      results.push(term)
    }
  }
  return results
}
```

**Why it fails**:
1. User can `cd` after terminal starts
2. Multiple Claude terminals in same directory all match
3. On Windows, Claude mode leaves shell open after Claude exits
4. Fresh Claude starts have no `resumeSessionId`

**Fix**: Remove the cwd-based branch entirely. Only match by exact `resumeSessionId`. Fresh Claude terminals won't get auto-titled until user resumes them - this is acceptable since we can't usefully title them until the first user turn anyway.

---

## Part 3: UI Polish

### Rename "Sessions" to "Coding Agents"

The sidebar section currently labeled "Sessions" should be "Coding Agents" to better reflect its purpose: showing Claude (and future Codex) sessions, not generic sessions.

**Location**: `Sidebar.tsx:222` - Change `"Sessions"` to `"Coding Agents"`

### Remove "New Terminal" Buttons from Sidebar

The sidebar is for Coding Agents (Claude/Codex sessions), not general terminal creation. Users create terminals via "New Tab" or the FAB. The "New Terminal" buttons in the sidebar are out of place.

**Elements to remove**:
1. Header plus button (`Sidebar.tsx:223-232`) - Small plus icon next to "Sessions" header
2. Footer button and wrapper div (`Sidebar.tsx:336-347`) - Full-width "New Terminal" button at bottom

**Files to update**:
- `src/components/Sidebar.tsx` - Remove both button elements
- No tests reference these buttons (verified)

---

## Implementation Plan

### Phase 1: Fix Critical Bug (terminalId passthrough)

**File**: `src/components/TabContent.tsx`

1. Write failing test: Create tab with `terminalId`, verify pane content receives it
2. Add `terminalId: tab.terminalId` to `defaultContent` object
3. Verify test passes
4. Refactor if needed

### Phase 2: Fix Exit Title Bug

**File**: `src/components/TerminalView.tsx`

1. Write failing test: Rename tab, exit terminal, verify title unchanged
2. Add `!tab.titleSetByUser` check before title modification
3. Verify test passes
4. Refactor if needed

### Phase 3: Remove CWD-Based Auto-Title

**Files**: `server/terminal-registry.ts`, `test/unit/server/terminal-registry.test.ts`

1. Remove cwd matching branch (lines 487-490) from `findClaudeTerminalsBySession()`
2. Keep only exact `resumeSessionId` matching
3. Remove cwd matching tests in `terminal-registry.test.ts` (lines 1165-1240: `findClaudeTerminalsBySession() cwd match` section)
4. Update any remaining tests that relied on cwd matching behavior
5. Verify tests pass

### Phase 4: Sidebar UI Polish

**File**: `src/components/Sidebar.tsx`

1. Rename section header from "Sessions" to "Coding Agents"
2. Remove header plus button (lines 223-232)
3. Remove footer "New Terminal" button and wrapper div (lines 336-347)
4. No test updates needed (no tests reference these buttons)
5. Verify tests pass

---

## Edge Cases to Test

### Terminal Attachment
1. **Click running session in sidebar** → Attaches to existing terminal (not new)
2. **Tab with existing pane layout rehydrated from localStorage** → Attaches correctly
3. **Multiple panes in one tab** → Each pane maintains its own terminal independently

### Title Handling
4. **User renames tab, terminal exits** → Title preserved (no exit code appended)
5. **Two Claude terminals in same directory** → No cross-contamination of titles
6. **Fresh Claude start (no --resume)** → Tab shows "Claude", no auto-title until session file exists

### Session Lifecycle
7. **Session resumed via sidebar click** → `claude --resume <id>` launches, correct attachment
8. **Plain shell terminal** → Never appears in Coding Agents section
9. **WebSocket reconnection with stale terminalId** → Handles gracefully (INVALID_TERMINAL_ID)

### Persistence
10. **Browser refresh** → Tabs/panes restored, terminals reattach if still running
11. **Server restart** → Old terminalIds invalid, new terminals created

---

## Design Decisions

1. **Fresh Claude terminals**: Don't auto-title. User sees "Claude" tab until they resume later via sidebar. Can't usefully title them until first user turn creates session file anyway.

2. **Plain shells**: Never appear in Coding Agents. Ephemeral, not tracked as sessions.

3. **Codex (future)**: Same pattern as Claude - appears in Coding Agents when session file is created.

4. **`terminalId` on Tab type**: Keep it. It serves a different purpose than pane's `terminalId` - it's for quickly finding existing tabs when clicking sidebar items. Removing it would complicate the code without clear benefit.

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/TabContent.tsx` | Pass `terminalId` to `defaultContent` |
| `src/components/TerminalView.tsx` | Check `titleSetByUser` before exit title |
| `server/terminal-registry.ts` | Remove cwd matching from `findClaudeTerminalsBySession()` |
| `src/components/Sidebar.tsx` | Rename "Sessions" → "Coding Agents", remove "New Terminal" buttons |
| `test/unit/server/terminal-registry.test.ts` | Remove cwd matching tests (lines 1165-1240) |
| `test/unit/client/components/TabContent.test.tsx` | Add test for `terminalId` passthrough |
| `test/unit/client/components/TerminalView.test.tsx` | Add test for `titleSetByUser` exit behavior |

---

## Success Criteria

After implementation:

- [ ] Clicking running session in sidebar attaches to existing terminal
- [ ] User-renamed tabs keep their title on exit
- [ ] Multiple Claude terminals in same directory don't get each other's titles
- [ ] Sidebar shows "Coding Agents" instead of "Sessions"
- [ ] No "New Terminal" buttons in sidebar (users use New Tab or FAB instead)
- [ ] All existing tests pass
- [ ] New tests cover all edge cases listed above
