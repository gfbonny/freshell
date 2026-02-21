# Router Extraction Design

## Problem

`server/index.ts` contains all route handlers inline. 11 test files duplicate these route handlers
(including schemas and helpers) to create isolated test Express apps. This means every production
change must be mirrored in test replicas — a maintenance burden and divergence risk.

Three specific symptoms (from PR #85 review):
1. **Test-replica duplication**: Tests copy-paste route handlers instead of importing real ones
2. **Inconsistent helper placement**: `cleanString` is at module scope in production but redefined
   inside test route handlers
3. **Scattered schemas**: Zod schemas defined inline next to routes, not organized

## Solution

Extract all route groups from `server/index.ts` into separate router modules using factory functions.
Tests import and mount real routers with mock dependencies — no more replicas.

## Pattern: Router Factory Functions

Each router module exports a factory function that receives dependencies and returns an Express Router:

```typescript
// server/terminals-router.ts
import { Router } from 'express'
import { z } from 'zod'
import { cleanString } from './utils.js'
import type { ConfigStore } from './config-store.js'
import type { TerminalRegistry } from './terminal-registry.js'
import type { WsHandler } from './ws-handler.js'

export const TerminalPatchSchema = z.object({
  titleOverride: z.string().max(500).optional().nullable(),
  descriptionOverride: z.string().max(2000).optional().nullable(),
  deleted: z.boolean().optional(),
})

export interface TerminalsRouterDeps {
  configStore: ConfigStore
  registry: TerminalRegistry
  wsHandler: WsHandler
}

export function createTerminalsRouter(deps: TerminalsRouterDeps): Router {
  const { configStore, registry, wsHandler } = deps
  const router = Router()
  // ... real route handlers ...
  return router
}
```

**In production** (`server/index.ts`): `app.use('/api/terminals', createTerminalsRouter({ configStore, registry, wsHandler }))`

**In tests**:
```typescript
const app = express()
app.use(express.json())
app.use('/api/terminals', createTerminalsRouter({
  configStore: mockConfigStore,
  registry: mockRegistry,
  wsHandler: mockWsHandler,
}))
```

## Router Groups

| Router module | Mount path | Routes | Key dependencies |
|---|---|---|---|
| `health-router.ts` | `/api` | GET /health, GET /debug | configStore, wsHandler, registry, codingCliIndexer, tabsRegistryStore, sessionRepairService, sdkBridge, startupState |
| `settings-router.ts` | `/api/settings` | GET /, PATCH /, PUT / | configStore, registry, wsHandler, codingCliIndexer, perfConfig |
| `perf-router.ts` | `/api/perf` | POST / | configStore, registry, wsHandler, perfConfig, logger |
| `network-router.ts` | `/api` | GET /network/status, POST /network/configure, POST /network/configure-firewall, GET /lan-info | networkManager, configStore, wsHandler, detectLanIps |
| `sessions-router.ts` | `/api` | GET /sessions, GET /sessions/search, PATCH /sessions/:id, DELETE /sessions/:id | configStore, codingCliIndexer, perfConfig |
| `project-colors-router.ts` | `/api` | PUT /project-colors | configStore, codingCliIndexer |
| `terminals-router.ts` | `/api/terminals` | GET /, PATCH /:id, DELETE /:id | configStore, registry, wsHandler |
| `ai-router.ts` | `/api/ai` | POST /terminals/:id/summary | registry, perfConfig, AI_CONFIG, PROMPTS |
| `files-router.ts` | `/api/files` | (existing, convert to factory) | configStore |
| `proxy-router.ts` | `/api/proxy` | POST /forward, DELETE /forward/:port | portForwardManager |
| `platform-router.ts` | `/api` | GET /platform, GET /version | detectPlatform, detectAvailableClis, detectHostName, checkForUpdate |

## Utility & Schema Organization

- **`server/utils.ts`**: Shared helpers like `cleanString`
- **Schemas co-locate with routers**: Each router exports its own schemas (e.g., `TerminalPatchSchema`
  from `terminals-router.ts`). Tests and other consumers import from the router module.
- **`settings-schema.ts` is removed**: `SettingsPatchSchema` moves into `settings-router.ts`

## server/index.ts After Extraction

Becomes pure orchestration:
1. Bootstrap dependencies (configStore, registry, wsHandler, etc.)
2. Create Express app with middleware (CORS, JSON parsing, rate limiting, auth)
3. Mount routers: `app.use('/api/terminals', createTerminalsRouter(deps))`
4. Set up WebSocket handler
5. Start listening

No route handler logic remains in index.ts.

## Test Migration

Each of the 11 test files that currently duplicates route handlers gets converted:

| Test file | Currently duplicates | After: imports |
|---|---|---|
| `test/server/terminals-api.test.ts` | Terminal PATCH/DELETE/GET | `createTerminalsRouter` |
| `test/server/api.test.ts` | Health/debug | `createHealthRouter` |
| `test/integration/server/api-edge-cases.test.ts` | Multiple route groups | Multiple router factories |
| `test/integration/server/network-api.test.ts` | Network routes | `createNetworkRouter` |
| `test/integration/server/settings-api.test.ts` | Settings routes | `createSettingsRouter` |
| `test/integration/server/session-search-api.test.ts` | Session search | `createSessionsRouter` |
| `test/integration/server/lan-info-api.test.ts` | LAN info | `createNetworkRouter` |
| `test/integration/server/platform-api.test.ts` | Platform | `createPlatformRouter` |
| `test/integration/server/candidate-dirs-api.test.ts` | Candidate dirs | `createFilesRouter` |
| `test/integration/server/port-forward-api.test.ts` | Proxy routes | `createProxyRouter` |
| `test/integration/server/pane-picker-cli.test.ts` | Pane picker | (assess during impl) |

## Migration Strategy

1. Extract routers one at a time, starting with the simplest (platform, proxy)
2. For each router: create module → update index.ts to use it → migrate tests → run tests
3. Work through dependency order (extract modules with fewer deps first)
4. Convert existing filesRouter to factory pattern
5. Final cleanup: remove settings-schema.ts, verify no inline schemas remain in index.ts

## Success Criteria

- Zero duplicated route handlers in test files
- All schemas exported from their router modules
- `cleanString` in a single shared location
- `server/index.ts` contains no route handler logic
- All existing tests pass (with updated imports, not duplicated logic)
