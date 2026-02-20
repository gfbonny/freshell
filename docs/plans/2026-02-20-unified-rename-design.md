# Unified Rename Design

## Problem

Pane rename, terminal override, and session override are three disconnected systems. Renaming a pane only updates Redux/localStorage. Renaming a session in history only writes a `sessionOverride`. The user must rename in multiple places to get consistent names. This was an oversight in the original implementation — the pieces exist but aren't connected.

## Design

When the server receives a rename for a terminal, it cascades to the session override if a coding CLI session is attached. When the server receives a rename for a session, it cascades to any terminal currently running that session. The client sends renames to the server (for coding CLI panes) instead of only updating Redux.

### Server changes

**`PATCH /api/terminals/:terminalId`** (terminals route):
- After writing the terminal override, look up `provider` and `sessionId` from `TerminalMetadataService`
- If present, also call `configStore.patchSessionOverride(compositeKey, { titleOverride })` and `codingCliIndexer.refresh()`
- New deps needed: `TerminalMetadataService`, `codingCliIndexer`

**`PATCH /api/sessions/:sessionId`** (sessions route):
- After writing the session override, scan `TerminalMetadataService.list()` for any terminal with matching `provider:sessionId`
- If found, also call `configStore.patchTerminalOverride(terminalId, { titleOverride })` and update live registry title
- Broadcast `terminal.list.updated` alongside existing session refresh
- New deps needed: `TerminalMetadataService`, `registry`, `wsHandler`

### Client changes

**`PaneContainer.tsx` `commitRename()`**:
- For coding CLI panes with a `terminalId` in `terminalMeta`: call `api.patch(/api/terminals/:terminalId, { titleOverride })` — the server handles the cascade
- For shell panes: behavior unchanged (Redux-only)

**React to `sessions.updated` broadcasts** (App.tsx):
- When a session title changes from the history view, find any pane with a matching terminal/session and update its pane title via `updatePaneTitle`

**Tab title sync**:
- For single-pane tabs, when pane title updates, also dispatch `updateTab({ title })` if the tab title wasn't independently set by the user

### Scope exclusions

- No CLI-side rename (`/rename` command injection) — deferred to future work
- Shell panes unchanged — no session to sync with
- No new WebSocket message types — uses existing REST routes and broadcast patterns

### Key decisions

- Server is the authority for bridging terminal ↔ session renames
- Bidirectional: pane rename → session override, history rename → pane title
- Single-pane tabs sync their tab title to the pane title
- Uses existing `TerminalMetadataService` to look up provider/sessionId for a terminal
