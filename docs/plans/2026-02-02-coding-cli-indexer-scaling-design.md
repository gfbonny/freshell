# Coding CLI Indexer Scaling Design (50k sessions)

## Summary
Scale the Coding CLI session indexer to handle up to ~50,000 sessions without blocking the event loop, while keeping default UX fast by indexing only the newest 10,000 sessions across all providers. Provide clear structured logs for high volumes and cap usage, and add a user-visible toggle (duplicated in Settings) to optionally search beyond the cap.

## Goals
- Keep WebSocket input latency responsive (avoid multi-second event-loop stalls).
- Default behavior remains fast for 1–10k sessions and graceful up to 50k.
- Index only the newest 10k sessions across all providers by default.
- Preserve existing UI behavior and API shape (projects array and /api/sessions).
- Provide structured logs for high volume and cap enforcement.

## Non-goals
- Full-text search index (FTS) at this stage.
- Real-time streaming search across all files beyond the cap by default.
- Major UI redesign of sessions list.

## Current Usage (why the index exists)
- Initial page load and WS ready payload includes projects for the sidebar.
- Sidebar shows sessions, sorts by activity/recency/project, and supports title-tier filtering locally.
- /api/sessions/search uses metadata for title tier and file scans for user/full-text tiers.
- Settings and session overrides trigger codingCliIndexer.refresh and broadcast sessions.updated.

## Constraints and Observations
- JSONL session logs are append-only or rarely edited after completion.
- Users generally interact with recent sessions; older sessions are accessed via search.
- Full-file scans and full rescan loops currently block the event loop at large scale.
- Node.js runs on a single event loop; long synchronous tasks degrade keystroke latency.

## Proposed Architecture
### 1) Incremental Metadata Cache (persistent + in-memory)
- Maintain a cache keyed by filePath with mtimeMs, size, and baseSession.
- On startup, load the persisted cache (JSON or JSONL) to avoid re-parsing.
- Recompute projects from cache immediately to populate ready payload fast.
- Use chokidar events to update only changed files rather than full rescans.
- Periodic background reconciliation (low priority) verifies cache against disk.

### 2) Global Cap of Newest Sessions (default 10,000)
- Add settings.codingCli.maxIndexedSessions (default 10000, 0 = unlimited).
- The cap is global across all providers and enforced after metadata collection.
- Use a min-heap of size N to keep only the newest sessions by updatedAt.
- This bounds memory and avoids sorting all sessions when counts are large.
- The cap is strict; no more than N sessions are returned in projects.

### 3) Search Beyond Cap (explicit, optional)
- New toggle: Search beyond cap (default off).
- The toggle appears in the search UI and is duplicated in Settings for persistence.
- When off: title search + user/full-text search limited to indexed sessions only.
- When on: the server may scan files outside the cap for user/full-text tiers,
  but with hard limits (max files scanned, max duration, and low concurrency)
  to prevent event-loop stalls.

### 4) Event-loop Safety
- Use async directory iteration (opendir) and yield between batches (setImmediate)
  during reconciliation or large scans.
- Coalesce refresh calls and avoid overlapping refresh operations.
- Optional future enhancement: move indexer work to a worker process.

## Logging and Observability
### Structured log events
- coding_cli_indexer_cap_applied (warn):
  - totalSessions, indexedSessions, droppedSessions, cutoffUpdatedAt,
    cap, providerCounts
- coding_cli_indexer_high_volume (error, startup only if total > 50k):
  - totalSessions, providerCounts, cap, message

### Logging behavior
- Warn on every refresh where cap is applied.
- Error once at startup if total sessions > 50k.

## API / UI Behavior
- /api/sessions and WS ready return only the capped session set.
- Sidebar shows a subtle indicator when cap is active:
  "Showing newest 10,000 of 37,214 sessions."
- Search toggle controls whether backend search can go beyond cap.
- Settings stores the toggle state and cap value.

## Data Flow
1) Startup:
   - Load cache -> build projects -> send ready payload.
   - Start chokidar watchers and background reconciliation.
   - If total sessions > 50k, log coding_cli_indexer_high_volume.
2) Change events:
   - On add/change/unlink, update cache entry and recompute affected groups.
   - Apply cap, update projects, broadcast sessions.updated.
3) Search:
   - Title tier: metadata only (fast).
   - User/full-text tiers: respect toggle and limits to avoid stalls.

## Testing
- Unit tests for cap behavior and heap selection.
- Unit tests for cache reuse (no re-parse on unchanged files).
- Unit tests for search scope toggle behavior.
- Integration test: cap warning log emitted when exceeding cap.

## Risks and Mitigations
- Risk: cap hides older sessions unexpectedly.
  - Mitigation: UI indicator + optional search beyond cap.
- Risk: cache drift.
  - Mitigation: background reconciliation and watcher error handling.
- Risk: large file scans for search beyond cap.
  - Mitigation: low concurrency, hard limits, optional user confirmation.

## Rollout
- Default cap on (10k).
- Search beyond cap off by default.
- Monitor logs for high volume and cap enforcement.

