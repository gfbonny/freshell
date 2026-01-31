# Claude Session Auto-Repair Design

## Problem

After Freshell crashes, Claude sessions fail to resume - users see "Sautéed for X time" but no conversation history. All session data appears lost.

### How Claude Sessions Work

Claude stores conversation history in JSONL files at `~/.claude/projects/<project>/`:

```
<session-id>.jsonl          # Main session file
<session-id>/
  subagents/                 # Subagent conversations (prompt suggestions, compaction)
    agent-aprompt_suggestion-abc123.jsonl
```

Each message in the JSONL has:
- `uuid` - Unique identifier for this message
- `parentUuid` - Pointer to the previous message (forming a linked list)
- `type` - Message type (user, assistant, system, progress, summary)

When resuming with `claude --resume <session-id>`, Claude walks backwards from the last message through `parentUuid` links to reconstruct the conversation. **If any link points to a UUID that doesn't exist in the file, the chain breaks and history won't load.**

### What Causes Corruption

1. **Subagent cross-references**: Claude spawns subagents (for prompt suggestions, compaction) that write to separate files. Progress messages in the main session can have `parentUuid` pointing to UUIDs in subagent files.

2. **Crash timing**: When Freshell crashes, Claude processes are killed mid-operation. The main session file may have messages referencing subagent UUIDs that Claude won't read during resume.

3. **Result**: The chain appears broken. Claude can only show history up to the break point - if that's near the end (depth 2-3), there's effectively nothing to show.

### The Cascade Effect

When Claude can't resume a session:
1. Claude starts a **fresh session** with a new session ID
2. Claude emits `init` event with the new session ID
3. Freshell updates the tab's `resumeSessionId` to the new ID
4. The old session still exists on disk but is now orphaned - no tab references it
5. User sees the old session in the sidebar, but clicking it opens a **new tab** instead of reconnecting

### Example

```
Session file (corrupted):
  Line 100: assistant { uuid: "aaa", parentUuid: "zzz" }  ← "zzz" exists
  Line 101: progress  { uuid: "bbb", parentUuid: "xxx" }  ← "xxx" is in subagent file!
  Line 102: system    { uuid: "ccc", parentUuid: "bbb" }  ← points to orphan

Chain from last message:
  ccc → bbb → xxx (MISSING!) → chain breaks at depth 2

Result: Claude shows no history, starts fresh session.
```

### The Fix

Re-parent orphan messages to point to the previous valid message:

```
After repair:
  Line 101: progress  { uuid: "bbb", parentUuid: "aaa" }  ← fixed!

Chain: ccc → bbb → aaa → zzz → ... (intact to root)
```

## Solution Overview

Automatically detect and repair corrupted sessions **before** Claude tries to resume them. The repair happens server-side, transparently to the user. This prevents the cascade effect where Claude creates a fresh session and the tab loses its association.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                              Server                                  │
│                                                                      │
│  ┌────────────────┐   ┌────────────────┐   ┌────────────────────┐   │
│  │ SessionCache   │◄──│ SessionScanner │◄──│ SessionRepairQueue │   │
│  │ (mtime+size)   │   │ (Node → Rust)  │   │ (priority-ordered) │   │
│  └────────────────┘   └────────────────┘   └────────────────────┘   │
│          │                    │                      ▲              │
│          │                    ▼                      │              │
│          │            ┌────────────────┐   ┌────────────────────┐   │
│          └───────────►│ terminal.create│   │  WebSocket Handler │   │
│                       │ (waits for     │   │  (hello, status)   │   │
│                       │  repair first) │   └────────────────────┘   │
│                       └────────────────┘             ▲              │
│                                                      │              │
└──────────────────────────────────────────────────────┼──────────────┘
                                                       │
┌──────────────────────────────────────────────────────┴──────────────┐
│                              Client                                  │
│                                                                      │
│  → hello { token, sessions: { active, visible, background } }       │
│  ← ready { }                                                         │
│  ← session.status { id, status: "repaired", chainDepth: 294 }       │
│  ← session.status { id, status: "healthy" }                          │
│  ← session.status { id, status: "missing" }  → show error toast     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Flow:**
1. Server starts → queues ALL sessions at 'disk' priority → starts background processing
2. Client connects → sends `hello` with its session IDs → server re-prioritizes those to front
3. Active session scanned/repaired first → `session.status` sent → terminal can spawn Claude
4. Background processing continues for all other sessions during idle time

## Components

### 1. SessionScanner Interface

Designed for future Rust replacement via NAPI-RS.

```typescript
// server/session-scanner/types.ts

export interface SessionScanResult {
  sessionId: string
  filePath: string
  status: 'healthy' | 'corrupted' | 'missing' | 'unreadable'
  chainDepth: number        // depth from last message to root (or break point)
  orphanCount: number       // number of messages with missing parents
  fileSize: number
  messageCount: number
}

export interface SessionRepairResult {
  sessionId: string
  status: 'repaired' | 'already_healthy' | 'failed'
  backupPath?: string       // path to .backup-{timestamp}.jsonl
  orphansFixed: number
  newChainDepth: number
}

export interface SessionScanner {
  /**
   * Scan a session file for chain integrity.
   * Returns scan result without modifying the file.
   */
  scan(filePath: string): Promise<SessionScanResult>

  /**
   * Repair a corrupted session file.
   * Creates backup before modifying. Idempotent - safe to call on healthy files.
   */
  repair(filePath: string): Promise<SessionRepairResult>

  /**
   * Scan multiple files in parallel.
   * Used for batch scanning at server start.
   */
  scanBatch(filePaths: string[]): Promise<SessionScanResult[]>
}
```

### 2. SessionCache

Node.js implementation - stays in Node even after Rust scanner.

```typescript
// server/session-scanner/cache.ts

export interface CacheEntry {
  mtime: number
  size: number
  result: SessionScanResult
}

export class SessionCache {
  private cache: Map<string, CacheEntry> = new Map()
  private persistPath: string

  constructor(persistPath: string)

  /**
   * Get cached result if file hasn't changed.
   * Returns null if cache miss or file modified.
   */
  async get(filePath: string): Promise<SessionScanResult | null>

  /**
   * Store scan result with file metadata for invalidation.
   */
  set(filePath: string, result: SessionScanResult): Promise<void>

  /**
   * Invalidate entry (called when file changes detected).
   */
  invalidate(filePath: string): void

  /**
   * Persist cache to disk (graceful shutdown).
   */
  persist(): Promise<void>

  /**
   * Load cache from disk (server start).
   */
  load(): Promise<void>
}
```

### 3. SessionRepairQueue

Prioritized repair queue based on client needs.

```typescript
// server/session-scanner/queue.ts

export type Priority = 'active' | 'visible' | 'background' | 'disk'

export interface QueueItem {
  sessionId: string
  filePath: string
  priority: Priority
  addedAt: number
}

export class SessionRepairQueue {
  private queue: QueueItem[] = []
  private processing: Set<string> = new Set()
  private scanner: SessionScanner
  private cache: SessionCache

  constructor(scanner: SessionScanner, cache: SessionCache)

  /**
   * Add sessions to queue with priority.
   * Higher priority items are processed first.
   * Deduplicates - won't add if already queued or processing.
   */
  enqueue(sessions: Array<{ sessionId: string; filePath: string; priority: Priority }>): void

  /**
   * Start processing queue. Emits events for each completed item.
   */
  start(): void

  /**
   * Stop processing (graceful shutdown).
   */
  stop(): Promise<void>

  // Events
  on(event: 'scanned', handler: (result: SessionScanResult) => void): void
  on(event: 'repaired', handler: (result: SessionRepairResult) => void): void
  on(event: 'error', handler: (sessionId: string, error: Error) => void): void
}
```

Priority order (highest first):
1. `active` - User is looking at this pane
2. `visible` - Other panes on screen
3. `background` - Client's other tabs (not visible)
4. `disk` - Sessions found on disk but not in client state

Within same priority, process in queue order (FIFO).

### 4. WebSocket Protocol Extensions

#### Client → Server: Enhanced `hello`

```typescript
interface HelloMessage {
  type: 'hello'
  token: string
  sessions?: {
    active?: string      // sessionId of active pane
    visible?: string[]   // sessionIds of visible but inactive panes
    background?: string[] // sessionIds of background tabs
  }
}
```

#### Server → Client: New `session.status`

```typescript
interface SessionStatusMessage {
  type: 'session.status'
  sessionId: string
  status: 'healthy' | 'repaired' | 'missing' | 'unrecoverable'
  chainDepth?: number    // included for debugging/display
  orphansFixed?: number  // if repaired
}
```

### 5. Integration Points

#### Server Startup

```typescript
// server/index.ts

async function startServer() {
  // 1. Load cache from disk
  await sessionCache.load()

  // 2. Discover ALL session files across all projects
  const claudeBase = path.join(os.homedir(), '.claude', 'projects')
  const sessionFiles = await glob(`${claudeBase}/*/*.jsonl`)

  // 3. Queue ALL sessions at 'disk' priority (lowest)
  // These will be processed in background after client's sessions
  sessionRepairQueue.enqueue(
    sessionFiles.map(f => ({
      sessionId: extractSessionId(f),
      filePath: f,
      priority: 'disk'
    }))
  )

  // 4. Start queue processing (non-blocking background worker)
  sessionRepairQueue.start()

  // 5. Start HTTP/WebSocket server immediately (don't wait for queue)
  // Client's hello will re-prioritize their sessions to the front
  // After active tab is served, queue continues processing ALL sessions
  // This background work is "free" - happens during idle time
  // ...
}
```

#### WebSocket Handler

```typescript
// server/ws-handler.ts

function handleHello(ws: WebSocket, msg: HelloMessage) {
  // ... existing auth validation ...

  // Prioritize client's sessions
  if (msg.sessions) {
    const items: QueueItem[] = []

    if (msg.sessions.active) {
      items.push({
        sessionId: msg.sessions.active,
        filePath: getSessionFilePath(msg.sessions.active),
        priority: 'active'
      })
    }

    for (const id of msg.sessions.visible || []) {
      items.push({ sessionId: id, filePath: getSessionFilePath(id), priority: 'visible' })
    }

    for (const id of msg.sessions.background || []) {
      items.push({ sessionId: id, filePath: getSessionFilePath(id), priority: 'background' })
    }

    // This re-prioritizes if already in queue
    sessionRepairQueue.enqueue(items)
  }

  // Subscribe this client to session status updates
  sessionRepairQueue.on('scanned', (result) => {
    if (isClientInterestedIn(ws, result.sessionId)) {
      ws.send({ type: 'session.status', ...result })
    }
  })

  ws.send({ type: 'ready' })
}
```

#### Terminal Creation

```typescript
// server/terminal-registry.ts

async function createTerminal(options: CreateTerminalOptions) {
  if (options.mode === 'claude' && options.resumeSessionId) {
    // Wait for session to be scanned/repaired before spawning Claude
    const result = await sessionRepairQueue.waitFor(options.resumeSessionId)

    if (result.status === 'missing' || result.status === 'unrecoverable') {
      // Don't pass --resume for broken sessions
      options.resumeSessionId = undefined
    }
  }

  // ... existing spawn logic ...
}
```

## Repair Algorithm

```typescript
async function repair(filePath: string): Promise<SessionRepairResult> {
  const lines = await readLines(filePath)

  // Pass 1: Build UUID index
  const uuidToLine: Map<string, number> = new Map()
  const lineToObj: Map<number, ParsedMessage> = new Map()

  for (let i = 0; i < lines.length; i++) {
    const obj = JSON.parse(lines[i])
    if (obj.uuid) {
      uuidToLine.set(obj.uuid, i)
      lineToObj.set(i, obj)
    }
  }

  // Pass 2: Find orphans and fix
  const fixedLines: string[] = []
  let orphansFixed = 0

  for (let i = 0; i < lines.length; i++) {
    const obj = JSON.parse(lines[i])
    const parent = obj.parentUuid

    if (parent && !uuidToLine.has(parent)) {
      // Orphan found - find previous valid message
      let newParent: string | null = null
      for (let j = i - 1; j >= 0; j--) {
        const candidate = lineToObj.get(j)
        if (candidate) {
          const candidateParent = candidate.parentUuid
          if (!candidateParent || uuidToLine.has(candidateParent)) {
            newParent = candidate.uuid
            break
          }
        }
      }

      obj.parentUuid = newParent
      fixedLines.push(JSON.stringify(obj))
      orphansFixed++
    } else {
      fixedLines.push(lines[i])
    }
  }

  if (orphansFixed === 0) {
    return { sessionId, status: 'already_healthy', orphansFixed: 0, newChainDepth }
  }

  // Backup original
  const backupPath = `${filePath}.backup-${Date.now()}`
  await fs.copyFile(filePath, backupPath)

  // Write repaired
  await fs.writeFile(filePath, fixedLines.join('\n'))

  return { sessionId, status: 'repaired', backupPath, orphansFixed, newChainDepth }
}
```

## Cache Freshness (No File Watching)

We do NOT watch all session files - that would be expensive with hundreds of files across projects.

Instead, check cache freshness on access:

```typescript
// In SessionCache.get()
async get(filePath: string): Promise<SessionScanResult | null> {
  const entry = this.cache.get(filePath)
  if (!entry) return null

  // Cheap stat() check
  const stat = await fs.stat(filePath).catch(() => null)
  if (!stat) {
    this.cache.delete(filePath)
    return null
  }

  // Invalidate if file changed
  if (stat.mtimeMs !== entry.mtime || stat.size !== entry.size) {
    this.cache.delete(filePath)
    return null
  }

  return entry.result
}
```

The existing `claude-indexer.ts` watches the current project directory for sidebar updates. Session repair piggybacks on this for the active project, but doesn't extend watching to all projects.

## Client Changes

### Enhanced `hello` Message

```typescript
// src/lib/websocket.ts

function buildHelloMessage(): HelloMessage {
  const tabs = store.getState().tabs.tabs
  const activeTabId = store.getState().tabs.activeTabId
  const panes = store.getState().panes

  const sessions = {
    active: undefined as string | undefined,
    visible: [] as string[],
    background: [] as string[]
  }

  for (const tab of tabs) {
    const sessionId = getSessionIdFromTab(tab, panes)
    if (!sessionId) continue

    if (tab.id === activeTabId) {
      sessions.active = sessionId
    } else if (isTabVisible(tab)) {
      sessions.visible.push(sessionId)
    } else {
      sessions.background.push(sessionId)
    }
  }

  return { type: 'hello', token: getToken(), sessions }
}
```

### Handle `session.status`

```typescript
// src/lib/websocket.ts

function handleSessionStatus(msg: SessionStatusMessage) {
  if (msg.status === 'missing' || msg.status === 'unrecoverable') {
    // Show toast notification
    toast.error(`Session ${msg.sessionId.slice(0, 8)}... could not be recovered`)

    // Optionally clear the resumeSessionId from affected tabs
    dispatch(clearBrokenSession({ sessionId: msg.sessionId }))
  } else if (msg.status === 'repaired') {
    // Optional: subtle indication that repair happened
    console.log(`Session ${msg.sessionId} repaired (${msg.orphansFixed} orphans fixed)`)
  }
}
```

## Testing Strategy

### Unit Tests

1. **Scanner tests** (`test/unit/server/session-scanner.test.ts`)
   - Scan healthy file → returns healthy status
   - Scan corrupted file → detects orphans, returns corrupted status
   - Scan missing file → returns missing status
   - Scan malformed JSON → returns unreadable status
   - Chain depth calculation is accurate

2. **Repair tests** (`test/unit/server/session-repair.test.ts`)
   - Repair corrupted file → orphans re-parented correctly
   - Repair creates backup before modifying
   - Repair is idempotent (calling twice is safe)
   - Repaired chain reaches root
   - Repair preserves message content (only parentUuid changes)

3. **Cache tests** (`test/unit/server/session-cache.test.ts`)
   - Cache hit when file unchanged
   - Cache miss when mtime changes
   - Cache miss when size changes
   - Cache persists to disk
   - Cache loads from disk

4. **Queue tests** (`test/unit/server/session-queue.test.ts`)
   - Priority ordering (active > visible > background > disk)
   - Deduplication (same session not queued twice)
   - Re-prioritization (background → active)
   - Concurrent processing limit
   - Graceful shutdown waits for in-progress

### Integration Tests

5. **End-to-end repair** (`test/integration/session-repair.test.ts`)
   - Create corrupted session file, repair, verify Claude can resume
   - Multiple orphans at different depths
   - Large file (5MB+) performance

6. **WebSocket protocol** (`test/integration/session-protocol.test.ts`)
   - Hello with sessions triggers prioritized scanning
   - Session status messages sent to correct clients
   - Terminal creation waits for repair

### Test Fixtures

Create fixture files in `test/fixtures/sessions/`:
- `healthy.jsonl` - Valid session with intact chain
- `corrupted-shallow.jsonl` - Orphan at depth 2
- `corrupted-deep.jsonl` - Orphan at depth 50
- `corrupted-multiple.jsonl` - Multiple orphans
- `malformed.jsonl` - Invalid JSON on some lines
- `empty.jsonl` - Empty file
- `large.jsonl` - 5MB+ file for performance testing

## Future: Rust Implementation

The `SessionScanner` interface is designed for drop-in Rust replacement:

```rust
// src/lib.rs (NAPI-RS)

#[napi]
pub struct SessionScanResult {
  pub session_id: String,
  pub file_path: String,
  pub status: String,  // "healthy" | "corrupted" | "missing" | "unreadable"
  pub chain_depth: u32,
  pub orphan_count: u32,
  pub file_size: u64,
  pub message_count: u32,
}

#[napi]
pub async fn scan(file_path: String) -> Result<SessionScanResult> {
  // Fast Rust implementation using serde_json streaming
}

#[napi]
pub async fn repair(file_path: String) -> Result<SessionRepairResult> {
  // Fast Rust implementation
}
```

The Node.js wrapper:

```typescript
// server/session-scanner/index.ts

import * as native from './native'  // NAPI-RS bindings

export const scanner: SessionScanner = {
  scan: native.scan,
  repair: native.repair,
  scanBatch: (paths) => Promise.all(paths.map(native.scan))
}
```

Same tests run against both implementations.

## Rollout Plan

1. **Phase 1**: Node.js implementation with full test coverage
2. **Phase 2**: Integration with WebSocket protocol and terminal creation
3. **Phase 3**: Client-side hello enhancement and status handling
4. **Phase 4**: Rust implementation (async, uses same tests)
5. **Phase 5**: Performance benchmarking, switch to Rust if beneficial

## Backup Cleanup

At server startup, clean up old backup files:

```typescript
async function cleanupOldBackups() {
  const claudeBase = path.join(os.homedir(), '.claude', 'projects')
  const backups = await glob(`${claudeBase}/*/*.jsonl.backup-*`)
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000)

  for (const backup of backups) {
    // Extract timestamp from filename: session.jsonl.backup-1706644800000
    const match = backup.match(/\.backup-(\d+)$/)
    if (match && parseInt(match[1]) < thirtyDaysAgo) {
      await fs.unlink(backup)
    }
  }
}
```

## Design Decisions

1. **Backup retention**: Keep `.backup-*` files for 30 days, then clean up.

2. **Multiple projects**: Scan ALL Claude sessions in `~/.claude/projects/*/`. With mtime+size caching, this is efficient:
   - `stat()` is cheap (~0.1ms per file)
   - Only files with changed mtime/size get parsed
   - First startup scans everything, subsequent startups are mostly cache hits
   - No file watching needed - just check cache freshness on access

3. **Repair notification UX**: Silent unless broken. Users only see a notification if a session is `missing` or `unrecoverable`. Successful repairs are silent (logged for debugging).
