# Plan: Improve Session Title Extraction & Worktree Project Grouping

## Status

Steps 1–4 (title extraction quality) landed on main as `c74b5ed`. Only Step 5 (worktree project grouping) remains.

---

## Completed: Title Extraction Quality (Steps 1–4)

These are done and merged. Kept here for context.

### Step 1: Consolidate `isSystemContext()` into shared `utils.ts` — DONE
### Step 2: Update both providers to use shared utils — DONE
### Step 3: Multi-line title extraction in `title-utils.ts` — DONE
### Step 4: Scope subagent filtering to Claude paths only — DONE

---

## Remaining: Worktree Project Grouping (Step 5)

### Problem

`resolveProjectPath()` for both providers returns `meta.cwd` verbatim. Sessions that ran in a git worktree (e.g. `/home/user/code/freshell/.worktrees/fix-tab-focus-pane-behavior`) get grouped as separate projects from the main repo (`/home/user/code/freshell`). When worktrees are deleted, these sessions become orphaned — pointing to paths that no longer exist, cluttering the sidebar.

### Research: Git Internals

**Worktrees:** The `.git` entry is a file (not directory) containing `gitdir: /path/to/repo/.git/worktrees/<name>`. The canonical way to find the parent repo is to read the `commondir` file inside that gitdir, which points to the shared `.git` directory. The repo root is the parent of that common dir.

**Submodules:** Also use `.git` files, but pointing to `.git/modules/...`. Must NOT be resolved to the superproject — submodules are independent repos and should keep their own project grouping.

**Bare repos:** The common dir is the repo itself (no `.git` subdirectory parent). Not relevant for our use case (sessions always have a working tree cwd).

### Design: `resolveGitRepoRoot(cwd)` utility

Add to `server/coding-cli/utils.ts`:

```
async function resolveGitRepoRoot(cwd: string): Promise<string>
```

**Algorithm:**

1. **Normalize input** — expand `~` to `os.homedir()`, resolve relative paths via `path.resolve()`. If the result is empty or invalid, return the original `cwd` immediately.

2. **Walk up from cwd** looking for a `.git` entry at each level.

3. **If `.git` is a directory** — this is a regular repo root. Return this directory.

4. **If `.git` is a file** — parse the `gitdir: <path>` line.
   - Resolve the gitdir path (may be relative to the `.git` file's directory).
   - **Distinguish worktree from submodule:**
     - If the gitdir path contains `/worktrees/` → it's a worktree. Read `commondir` file inside the gitdir to find the shared `.git` directory. The repo root is the parent of that common dir.
     - If the gitdir path contains `/modules/` → it's a submodule. Treat this directory as an independent repo root (return the directory containing the `.git` file).
     - Otherwise → unknown layout. Fall back to returning the current directory.

5. **If no `.git` found** (reached filesystem root) — return the original `cwd`.

6. **On any filesystem error** (deleted path, permission denied, etc.) — return the original `cwd`. Never collapse to `unknown` due to resolution failure.

**`commondir` reading (step 4, worktree branch):**
- Read `<gitdir>/commondir` — it contains a path (often relative like `../..`) pointing to the shared `.git` directory.
- Resolve it relative to the gitdir.
- The repo root is `path.dirname(commonDir)` (the parent of the `.git` directory).
- If `commondir` file is missing or unreadable, fall back: if gitdir matches `.../. git/worktrees/<name>`, go up 3 levels from the gitdir to find the repo root. If that doesn't work, return the original `cwd`.

**Caching:**
- Module-level `Map<string, string>` keyed by normalized `cwd` → resolved repo root.
- Cache is populated on first lookup, reused across all sessions in a refresh cycle.
- No TTL needed — git repo roots don't change. Cache can be cleared on full scan if desired.
- Export a `clearRepoRootCache()` for testing.

### Integration

Both providers' `resolveProjectPath()` change from:
```ts
return meta.cwd || 'unknown'
```
to:
```ts
if (!meta.cwd) return 'unknown'
return resolveGitRepoRoot(meta.cwd)
```

No changes needed to `session-indexer.ts` or the provider interface — the contract is the same, just the resolution is smarter.

### Deleted worktree handling

No special heuristic needed. The algorithm handles this naturally:
- If the worktree directory still exists → `.git` file is readable → resolve via `commondir` → correct parent repo.
- If the worktree directory was deleted → `fsp.stat()` fails during walk → catch block returns original `cwd`.
- Returning the original `cwd` means deleted-worktree sessions stay grouped under their worktree path (a stale but honest grouping). This is better than guessing wrong.
- Users can hide stale sessions via the existing session override/delete mechanism.

### Test plan

**New test file:** `test/unit/server/coding-cli/resolve-git-root.test.ts`

Create temp directories that simulate git layouts:

1. **Regular repo** — `tmp/repo/.git/` (directory) → returns `tmp/repo`
2. **Worktree** — `tmp/repo/.git/` (directory) + `tmp/worktree/.git` (file with `gitdir: tmp/repo/.git/worktrees/wt`) + `tmp/repo/.git/worktrees/wt/commondir` (contains `../..`) → returns `tmp/repo`
3. **Submodule** — `tmp/super/.git/` (directory) + `tmp/super/sub/.git` (file with `gitdir: tmp/super/.git/modules/sub`) → returns `tmp/super/sub` (NOT `tmp/super`)
4. **No git directory** — `tmp/plain/` → returns `tmp/plain`
5. **Deleted worktree path** — nonexistent path → returns the path as-is
6. **Nested path within repo** — `tmp/repo/src/deep/` → returns `tmp/repo`
7. **Tilde path** — `~/code/project` → expands `~` then resolves
8. **Cache hit** — second call with same cwd doesn't touch filesystem (verify with spy)

**Existing test updates:**
- `test/unit/server/coding-cli/claude-provider.test.ts` — no changes (tests `parseSessionContent`, not `resolveProjectPath`)
- `test/unit/server/coding-cli/codex-provider.test.ts` — same
- `test/unit/server/coding-cli/session-indexer.test.ts` — add test: two sessions with different worktree cwds pointing to same repo → grouped under one project

### Files Modified

| File | Change |
|------|--------|
| `server/coding-cli/utils.ts` | Add `resolveGitRepoRoot()`, `clearRepoRootCache()` |
| `server/coding-cli/providers/claude.ts` | `resolveProjectPath` calls `resolveGitRepoRoot` |
| `server/coding-cli/providers/codex.ts` | `resolveProjectPath` calls `resolveGitRepoRoot` |
| `test/unit/server/coding-cli/resolve-git-root.test.ts` | New — comprehensive tests |
| `test/unit/server/coding-cli/session-indexer.test.ts` | Add worktree grouping integration test |
