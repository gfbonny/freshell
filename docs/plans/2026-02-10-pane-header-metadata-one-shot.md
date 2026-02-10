# Pane Header Metadata (cwd/worktree/tokens) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show live `cwd`, worktree/repo context, and token usage in pane headers for Codex and Claude terminal panes, with robust server->client metadata synchronization.

**Architecture:** Introduce a dedicated terminal metadata channel in the server (`terminal.meta.*`), sourced from terminal registry + coding-cli session indexing. Keep metadata in a non-persisted client Redux slice keyed by `terminalId`, then render compact chips in `PaneHeader` for coding CLI terminal panes. Parse provider token usage from authoritative session event formats (Codex `token_count.info.*`, Claude assistant usage) and broadcast updates when metadata changes.

**Tech Stack:** TypeScript, Node/Express/WebSocket (`ws`), Redux Toolkit, React, Vitest, Testing Library.

---

## Scope and constraints

- Single branch / single PR delivery.
- TDD throughout: red -> green -> refactor for each task.
- Keep persisted pane layout schema untouched (metadata is runtime-only).
- Backward-compatible protocol changes (new WS message types, no breaking changes).

---

### Task 1: Add Git root helpers for checkout root vs canonical repo root

**Files:**
- Modify: `server/coding-cli/utils.ts`
- Modify: `test/unit/server/coding-cli/resolve-git-root.test.ts`

**Step 1: Write failing tests for checkout-root behavior**

Add tests that prove:
- `resolveGitCheckoutRoot(worktreeDir/deep/path)` returns the worktree checkout root.
- `resolveGitRepoRoot(worktreeDir/deep/path)` still returns canonical parent repo root.
- Submodule checkout root remains submodule root.

```ts
it('returns worktree checkout root for nested path', async () => {
  expect(await resolveGitCheckoutRoot(path.join(worktreeDir, 'src', 'deep'))).toBe(worktreeDir)
})
```

**Step 2: Run targeted tests to confirm failure**

Run: `npm test -- test/unit/server/coding-cli/resolve-git-root.test.ts`
Expected: FAIL with `resolveGitCheckoutRoot is not defined` or missing export.

**Step 3: Implement `resolveGitCheckoutRoot()` and shared traversal helpers**

In `server/coding-cli/utils.ts`:
- Add `resolveGitCheckoutRoot(cwd: string): Promise<string>`.
- Reuse normalization/walk logic.
- Return directory containing `.git` (file or directory) as checkout root.
- Keep `resolveGitRepoRoot()` behavior unchanged.

```ts
export async function resolveGitCheckoutRoot(cwd: string): Promise<string> {
  // normalize input
  // walk up for .git
  // return directory where .git is found
  // fallback to normalized cwd
}
```

**Step 4: Re-run targeted tests**

Run: `npm test -- test/unit/server/coding-cli/resolve-git-root.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add server/coding-cli/utils.ts test/unit/server/coding-cli/resolve-git-root.test.ts
git commit -m "feat(coding-cli): add checkout-root resolver alongside canonical repo-root resolution"
```

---

### Task 2: Fix and harden provider token parsing (Codex + Claude)

**Files:**
- Modify: `server/coding-cli/types.ts`
- Modify: `server/coding-cli/providers/codex.ts`
- Modify: `server/coding-cli/providers/claude.ts`
- Modify: `test/unit/server/coding-cli/codex-provider.test.ts`
- Modify: `test/unit/server/coding-cli/claude-provider.test.ts`

**Step 1: Add failing tests for Codex `token_count.info` format**

Add a test that feeds:
- `event_msg.payload.type = "token_count"`
- nested `payload.info.total_token_usage` and `payload.info.last_token_usage`

Expect normalized `token.usage` event with totals from `total_token_usage`.

```ts
expect(events[0]).toMatchObject({
  type: 'token.usage',
  tokens: { inputTokens: 120, outputTokens: 30, cachedTokens: 40 },
})
```

**Step 2: Add failing tests for Claude usage aggregation from session file**

Add parse-session tests that:
- include multiple assistant records with `message.usage`.
- include duplicated assistant `message.id` (should not double-count).
- expect aggregated totals in parsed metadata.

```ts
expect(meta.tokenUsage).toEqual({
  inputTokens: 20,
  outputTokens: 9,
  cachedTokens: 12,
  totalTokens: 29,
})
```

**Step 3: Run focused provider tests to confirm failures**

Run:
- `npm test -- test/unit/server/coding-cli/codex-provider.test.ts`
- `npm test -- test/unit/server/coding-cli/claude-provider.test.ts`

Expected: FAIL in new token assertions.

**Step 4: Implement provider parsing updates**

In `server/coding-cli/types.ts`:
- extend parsed metadata/session types with optional token summary:

```ts
export interface TokenSummary {
  inputTokens: number
  outputTokens: number
  cachedTokens?: number
  totalTokens: number
}
```

In `server/coding-cli/providers/codex.ts`:
- parse `token_count` from `payload.info.total_token_usage`.
- support fallback shape for legacy logs only if nested shape absent.
- in `parseCodexSessionContent`, keep latest token totals encountered.

In `server/coding-cli/providers/claude.ts`:
- aggregate assistant usage across file parse.
- dedupe by assistant message ID.
- map cache read + cache creation into `cachedTokens`.

**Step 5: Re-run focused tests**

Run:
- `npm test -- test/unit/server/coding-cli/codex-provider.test.ts`
- `npm test -- test/unit/server/coding-cli/claude-provider.test.ts`

Expected: PASS.

**Step 6: Commit**

```bash
git add server/coding-cli/types.ts server/coding-cli/providers/codex.ts server/coding-cli/providers/claude.ts test/unit/server/coding-cli/codex-provider.test.ts test/unit/server/coding-cli/claude-provider.test.ts
git commit -m "fix(coding-cli): parse current codex token_count schema and aggregate claude usage totals"
```

---

### Task 3: Carry token metadata through session indexing

**Files:**
- Modify: `server/coding-cli/session-indexer.ts`
- Modify: `test/unit/server/coding-cli/session-indexer.test.ts`

**Step 1: Add failing indexer test for token propagation**

Add a test that injects provider parse metadata with token summary and verifies indexed session includes `tokenUsage`.

```ts
expect(projects[0].sessions[0].tokenUsage?.totalTokens).toBe(420)
```

**Step 2: Run focused indexer test**

Run: `npm test -- test/unit/server/coding-cli/session-indexer.test.ts`
Expected: FAIL on missing `tokenUsage`.

**Step 3: Implement propagation in `session-indexer.ts`**

When creating `baseSession`, include:

```ts
tokenUsage: meta.tokenUsage,
```

Ensure this survives override application and grouping.

**Step 4: Re-run focused test**

Run: `npm test -- test/unit/server/coding-cli/session-indexer.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add server/coding-cli/session-indexer.ts test/unit/server/coding-cli/session-indexer.test.ts
git commit -m "feat(indexer): propagate token usage summaries into indexed coding CLI sessions"
```

---

### Task 4: Introduce server terminal metadata service + WS contract

**Files:**
- Create: `server/terminal-metadata-service.ts`
- Modify: `server/ws-handler.ts`
- Modify: `server/index.ts`
- Modify: `test/server/ws-protocol.test.ts`
- Create: `test/unit/server/terminal-metadata-service.test.ts`

**Step 1: Add failing tests for metadata service behavior**

In new `test/unit/server/terminal-metadata-service.test.ts`, cover:
- seed metadata from terminal (`cwd`).
- async enrichment sets `worktreeRoot` + `repoRoot`.
- token updates by provider/session.
- idempotent updates do not emit duplicate patches.

```ts
expect(service.get(terminalId)?.worktreeRoot).toBe('/repo/.worktrees/feature-x')
expect(service.get(terminalId)?.repoRoot).toBe('/repo')
```

**Step 2: Add failing WS protocol test for new meta messages**

In `test/server/ws-protocol.test.ts`:
- send `{ type: 'terminal.meta.list', requestId: 'meta-1' }`.
- expect `terminal.meta.list.response`.

```ts
expect(response.type).toBe('terminal.meta.list.response')
expect(Array.isArray(response.items)).toBe(true)
```

**Step 3: Run tests to confirm failures**

Run:
- `npm test -- test/unit/server/terminal-metadata-service.test.ts`
- `npm test -- test/server/ws-protocol.test.ts`

Expected: FAIL (missing service + message types).

**Step 4: Implement service and WS schema/handlers**

In `server/terminal-metadata-service.ts`, implement:

```ts
export type TerminalMeta = {
  cwd?: string
  worktreeRoot?: string
  repoRoot?: string
  provider?: 'claude' | 'codex' | 'opencode' | 'gemini' | 'kimi'
  sessionId?: string
  tokenUsage?: {
    inputTokens: number
    outputTokens: number
    cachedTokens?: number
    totalTokens: number
    updatedAt: number
  }
}
```

Add methods:
- `seedFromTerminal(record)`
- `associateSession(terminalId, provider, sessionId)`
- `updateTokenUsage(terminalId, usage)`
- `list()`

In `server/ws-handler.ts`:
- add client message schema for `terminal.meta.list`.
- add response `terminal.meta.list.response`.
- add broadcast message `terminal.meta.updated`.

In `server/index.ts`:
- instantiate service.
- on terminal create/association/title loops, push metadata updates.
- on coding-cli index update, map session tokenUsage to associated terminals and broadcast.

**Step 5: Re-run tests**

Run:
- `npm test -- test/unit/server/terminal-metadata-service.test.ts`
- `npm test -- test/server/ws-protocol.test.ts`

Expected: PASS.

**Step 6: Commit**

```bash
git add server/terminal-metadata-service.ts server/ws-handler.ts server/index.ts test/unit/server/terminal-metadata-service.test.ts test/server/ws-protocol.test.ts
git commit -m "feat(ws): add terminal metadata service and terminal.meta list/update protocol"
```

---

### Task 5: Publish metadata updates from session association flows

**Files:**
- Modify: `server/index.ts`
- Modify: `test/server/session-association.test.ts`

**Step 1: Add failing session-association test assertions**

When a terminal gets associated via:
- Claude new session association
- non-Claude coding-cli indexer association

Expect additional broadcast:
- `terminal.meta.updated` with provider/session linkage.

```ts
expect(broadcasts).toContainEqual(expect.objectContaining({
  type: 'terminal.meta.updated',
  terminalId: term.terminalId,
  meta: expect.objectContaining({ sessionId: session.sessionId, provider: 'codex' }),
}))
```

**Step 2: Run focused association tests**

Run: `npm test -- test/server/session-association.test.ts`
Expected: FAIL.

**Step 3: Implement broadcast wiring**

In each association success branch in `server/index.ts`, after `terminal.session.associated`, send `terminal.meta.updated` using metadata service snapshot.

**Step 4: Re-run tests**

Run: `npm test -- test/server/session-association.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add server/index.ts test/server/session-association.test.ts
git commit -m "feat(sessions): broadcast terminal metadata updates on session association events"
```

---

### Task 6: Add runtime terminal metadata state on the client

**Files:**
- Create: `src/store/terminalMetaSlice.ts`
- Modify: `src/store/store.ts`
- Create: `test/unit/client/store/terminalMetaSlice.test.ts`
- Modify: `src/App.tsx`

**Step 1: Write failing slice tests**

Cover:
- upsert from list response.
- patch update from single terminal.
- remove on terminal exit.
- reset behavior for stale entries.

```ts
expect(state.byTerminalId['term-1']?.tokenUsage?.totalTokens).toBe(1200)
```

**Step 2: Run slice test to confirm failure**

Run: `npm test -- test/unit/client/store/terminalMetaSlice.test.ts`
Expected: FAIL (missing slice).

**Step 3: Implement slice + store registration**

In `src/store/terminalMetaSlice.ts`:

```ts
type TerminalMetaState = {
  byTerminalId: Record<string, TerminalMetaRecord>
}
```

Reducers:
- `upsertTerminalMeta`
- `setTerminalMetaSnapshot`
- `removeTerminalMeta`

Register reducer in `src/store/store.ts` (runtime only; no persist middleware changes needed).

**Step 4: Wire WS handling in `src/App.tsx`**

Handle messages:
- `terminal.meta.list.response` -> `setTerminalMetaSnapshot`.
- `terminal.meta.updated` -> `upsertTerminalMeta`.
- `terminal.exit` -> `removeTerminalMeta`.

On `ready`, request metadata snapshot:

```ts
ws.send({ type: 'terminal.meta.list', requestId: `meta-${Date.now()}` })
```

**Step 5: Re-run tests**

Run:
- `npm test -- test/unit/client/store/terminalMetaSlice.test.ts`
- `npm test -- test/e2e/turn-complete-notification-flow.test.tsx`

Expected: PASS, no regression in existing WS-driven flow.

**Step 6: Commit**

```bash
git add src/store/terminalMetaSlice.ts src/store/store.ts src/App.tsx test/unit/client/store/terminalMetaSlice.test.ts
git commit -m "feat(client): add runtime terminal metadata slice and websocket ingestion"
```

---

### Task 7: Render metadata chips in pane headers (Codex + Claude)

**Files:**
- Modify: `src/components/panes/PaneContainer.tsx`
- Modify: `src/components/panes/Pane.tsx`
- Modify: `src/components/panes/PaneHeader.tsx`
- Create: `src/lib/format-terminal-meta.ts`
- Modify: `test/unit/client/components/panes/PaneHeader.test.tsx`
- Modify: `test/unit/client/components/panes/Pane.test.tsx`

**Step 1: Add failing component tests**

`PaneHeader.test.tsx`:
- renders `cwd` chip.
- renders worktree chip.
- renders token chip (`12.3K tok`) when provided.
- hides chips for non-coding-cli terminal mode.

`Pane.test.tsx`:
- forwards metadata prop into header.

**Step 2: Run component tests to confirm failure**

Run:
- `npm test -- test/unit/client/components/panes/PaneHeader.test.tsx`
- `npm test -- test/unit/client/components/panes/Pane.test.tsx`

Expected: FAIL.

**Step 3: Implement formatting helper and prop plumbing**

In `src/lib/format-terminal-meta.ts` add:
- `formatTokenCount(n: number): string`
- `formatHeaderCwd(path: string): string`
- `formatWorktreeLabel(worktreeRoot: string, repoRoot?: string): string`

In `PaneContainer`:
- lookup metadata by `terminalId` from `state.terminalMeta.byTerminalId`.
- pass to `Pane`.

In `Pane`:
- pass metadata to `PaneHeader`.

In `PaneHeader`:
- render compact chips inline after title for coding-cli modes (`claude`, `codex`).

```tsx
{showMeta && (
  <span className="text-[11px] text-muted-foreground truncate" aria-label="Terminal metadata">
    {metaParts.join(' · ')}
  </span>
)}
```

**Step 4: Re-run component tests**

Run:
- `npm test -- test/unit/client/components/panes/PaneHeader.test.tsx`
- `npm test -- test/unit/client/components/panes/Pane.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/panes/PaneContainer.tsx src/components/panes/Pane.tsx src/components/panes/PaneHeader.tsx src/lib/format-terminal-meta.ts test/unit/client/components/panes/PaneHeader.test.tsx test/unit/client/components/panes/Pane.test.tsx
git commit -m "feat(ui): show cwd/worktree/token metadata chips in coding-cli pane headers"
```

---

### Task 8: End-to-end metadata flow test and full regression

**Files:**
- Create: `test/e2e/pane-header-metadata-flow.test.tsx`

**Step 1: Write failing e2e flow test**

Create a harness similar to existing e2e WS tests:
- render tab with codex terminal pane.
- emit `terminal.meta.list.response` then `terminal.meta.updated`.
- assert header shows updated chips.
- emit `terminal.exit`; assert metadata chip is removed or reset.

```ts
expect(screen.getByText(/src\/freshell/)).toBeInTheDocument()
expect(screen.getByText(/12\.3K tok/)).toBeInTheDocument()
```

**Step 2: Run e2e test and confirm failure**

Run: `npm test -- test/e2e/pane-header-metadata-flow.test.tsx`
Expected: FAIL before implementation is complete, PASS after.

**Step 3: Final regression runs**

Run in order:
- `npm run lint`
- `npm test`

Expected: all pass.

**Step 4: Final commit**

```bash
git add test/e2e/pane-header-metadata-flow.test.tsx
git commit -m "test(e2e): validate terminal metadata websocket-to-header rendering flow"
```

**Step 5: Optional squash guidance (only if requested)**

Do not amend or squash unless explicitly requested by user.

---

## Final verification checklist

1. `terminal.meta.list` responds with current metadata for running terminals.
2. `terminal.meta.updated` broadcasts on association + token updates.
3. Codex token parsing uses nested `token_count.info.total_token_usage`.
4. Claude token totals are aggregated from session data without duplicate double-counting.
5. Metadata is runtime-only in Redux and does not bloat persisted pane layouts.
6. Codex/Claude pane headers show `cwd`, worktree context, and token totals.
7. `npm run lint` and `npm test` are green.

---

## Rollout notes

- Keep metadata chips lightweight (single-line, truncating) to avoid header overflow.
- If token usage is unavailable, render `cwd`/worktree only (no placeholders).
- If provider session association has not happened yet, chips should progressively fill in as updates arrive.
