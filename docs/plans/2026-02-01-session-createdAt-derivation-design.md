# Session createdAt derivation (read-only)

## Goal
Use session JSONL timestamps as the source of truth for createdAt and stop persisting auto-generated createdAt overrides to user config. Keep config writes strictly for user intent (manual overrides).

## Problem
On Windows, startup now attempts to persist createdAtOverride for every session during indexer refresh. This triggers a burst of atomic renames to ~/.freshell/config.json and hits transient file locks (EPERM), producing warnings and failed writes.

## Recommendation
Derive createdAt directly from session JSONL content (earliest timestamp) during indexing. Only apply createdAtOverride when explicitly set by the user via API. Remove the auto-persist logic from the Claude indexer.

## Design
- Extend JSONL parsing to capture the earliest valid 	imestamp in the session stream.
- If a timestamp is present, use it as createdAt.
- If no timestamp is present, fall back to filesystem stat times as a best-effort read-only approximation.
- Remove any background writes that attempt to save createdAtOverride automatically.

## Expected outcome
- Startup becomes read-only for derived timestamps.
- Config writes occur only for user-driven overrides.
- No rename storms or transient EPERM warnings on startup.

## Testing
- Unit test: ensure JSONL parsing extracts the earliest timestamp.
- Unit test: ensure indexer uses JSONL-derived createdAt when present.
