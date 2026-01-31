# Session Search Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add tiered search to Claude sessions - title-only, user messages, and full text search.

**Architecture:** Backend streaming search through JSONL files with three depth tiers. Tier 1 searches cached metadata (instant). Tier 2 and 3 stream the JSONL files, extracting user messages or all content respectively. Frontend provides search input with tier toggle.

**Tech Stack:** Node.js streaming, Express REST API, React, Redux, Zod validation

---

## Task 1: Define Search Types and Zod Schemas

**Files:**
- Create: `server/session-search.ts`
- Test: `test/unit/server/session-search.test.ts`

**Step 1: Write the failing test for search types**

```typescript
// test/unit/server/session-search.test.ts
import { describe, it, expect } from 'vitest'
import {
  SearchTier,
  SearchResultSchema,
  type SearchResult,
  type SearchMatch,
} from '../../../server/session-search.js'

describe('session-search types', () => {
  describe('SearchTier enum', () => {
    it('has three tiers: title, userMessages, fullText', () => {
      expect(SearchTier.Title).toBe('title')
      expect(SearchTier.UserMessages).toBe('userMessages')
      expect(SearchTier.FullText).toBe('fullText')
    })
  })

  describe('SearchResultSchema', () => {
    it('validates a valid search result', () => {
      const result: SearchResult = {
        sessionId: 'abc123',
        projectPath: '/home/user/project',
        title: 'Fix the bug',
        matchedIn: 'title',
        snippet: 'Fix the bug in login',
        updatedAt: Date.now(),
      }
      expect(() => SearchResultSchema.parse(result)).not.toThrow()
    })

    it('requires sessionId and projectPath', () => {
      const invalid = { title: 'Test' }
      expect(() => SearchResultSchema.parse(invalid)).toThrow()
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/server/session-search.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// server/session-search.ts
import { z } from 'zod'

export const SearchTier = {
  Title: 'title',
  UserMessages: 'userMessages',
  FullText: 'fullText',
} as const

export type SearchTierType = (typeof SearchTier)[keyof typeof SearchTier]

export const SearchMatchSchema = z.object({
  line: z.number(),
  text: z.string(),
  context: z.string().optional(),
})

export type SearchMatch = z.infer<typeof SearchMatchSchema>

export const SearchResultSchema = z.object({
  sessionId: z.string(),
  projectPath: z.string(),
  title: z.string().optional(),
  summary: z.string().optional(),
  matchedIn: z.enum(['title', 'userMessage', 'assistantMessage', 'summary']),
  snippet: z.string().optional(),
  updatedAt: z.number(),
  cwd: z.string().optional(),
})

export type SearchResult = z.infer<typeof SearchResultSchema>

export const SearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  tier: z.enum(['title', 'userMessages', 'fullText']).default('title'),
  limit: z.number().min(1).max(100).default(50),
})

export type SearchRequest = z.infer<typeof SearchRequestSchema>

export const SearchResponseSchema = z.object({
  results: z.array(SearchResultSchema),
  tier: z.enum(['title', 'userMessages', 'fullText']),
  query: z.string(),
  totalScanned: z.number(),
})

export type SearchResponse = z.infer<typeof SearchResponseSchema>
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/server/session-search.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/session-search.ts test/unit/server/session-search.test.ts
git commit -m "$(cat <<'EOF'
feat(session-search): add types and Zod schemas for tiered search

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Implement Title Search (Tier 1)

**Files:**
- Modify: `server/session-search.ts`
- Test: `test/unit/server/session-search.test.ts`

**Step 1: Write failing test for title search**

```typescript
// Add to test/unit/server/session-search.test.ts
import { searchTitleTier } from '../../../server/session-search.js'
import type { ProjectGroup } from '../../../server/claude-indexer.js'

describe('searchTitleTier()', () => {
  const mockProjects: ProjectGroup[] = [
    {
      projectPath: '/home/user/project-a',
      sessions: [
        {
          sessionId: 'session-1',
          projectPath: '/home/user/project-a',
          updatedAt: 1000,
          title: 'Fix the login bug',
          cwd: '/home/user/project-a',
        },
        {
          sessionId: 'session-2',
          projectPath: '/home/user/project-a',
          updatedAt: 2000,
          title: 'Add user authentication',
          cwd: '/home/user/project-a',
        },
      ],
    },
    {
      projectPath: '/home/user/project-b',
      sessions: [
        {
          sessionId: 'session-3',
          projectPath: '/home/user/project-b',
          updatedAt: 3000,
          title: 'Implement dark mode',
          summary: 'User requested dark mode feature',
          cwd: '/home/user/project-b',
        },
      ],
    },
  ]

  it('finds sessions matching query in title', () => {
    const results = searchTitleTier(mockProjects, 'login')

    expect(results).toHaveLength(1)
    expect(results[0].sessionId).toBe('session-1')
    expect(results[0].matchedIn).toBe('title')
  })

  it('is case-insensitive', () => {
    const results = searchTitleTier(mockProjects, 'LOGIN')

    expect(results).toHaveLength(1)
    expect(results[0].sessionId).toBe('session-1')
  })

  it('matches partial words', () => {
    const results = searchTitleTier(mockProjects, 'auth')

    expect(results).toHaveLength(1)
    expect(results[0].sessionId).toBe('session-2')
  })

  it('also searches summary field', () => {
    const results = searchTitleTier(mockProjects, 'dark mode feature')

    expect(results).toHaveLength(1)
    expect(results[0].sessionId).toBe('session-3')
  })

  it('returns empty array for no matches', () => {
    const results = searchTitleTier(mockProjects, 'nonexistent')

    expect(results).toHaveLength(0)
  })

  it('respects limit parameter', () => {
    const results = searchTitleTier(mockProjects, 'a', 1)

    expect(results).toHaveLength(1)
  })

  it('sorts by updatedAt descending', () => {
    const results = searchTitleTier(mockProjects, 'a')

    // All sessions have 'a' in title, should be sorted by updatedAt desc
    expect(results[0].updatedAt).toBeGreaterThanOrEqual(results[results.length - 1].updatedAt)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/server/session-search.test.ts`
Expected: FAIL with "searchTitleTier is not a function"

**Step 3: Implement searchTitleTier**

```typescript
// Add to server/session-search.ts
import type { ProjectGroup, ClaudeSession } from './claude-indexer.js'

export function searchTitleTier(
  projects: ProjectGroup[],
  query: string,
  limit = 50
): SearchResult[] {
  const q = query.toLowerCase()
  const results: SearchResult[] = []

  for (const project of projects) {
    for (const session of project.sessions) {
      const titleMatch = session.title?.toLowerCase().includes(q)
      const summaryMatch = session.summary?.toLowerCase().includes(q)

      if (titleMatch || summaryMatch) {
        results.push({
          sessionId: session.sessionId,
          projectPath: session.projectPath,
          title: session.title,
          summary: session.summary,
          matchedIn: titleMatch ? 'title' : 'summary',
          snippet: titleMatch ? session.title : session.summary,
          updatedAt: session.updatedAt,
          cwd: session.cwd,
        })
      }
    }
  }

  // Sort by updatedAt descending
  results.sort((a, b) => b.updatedAt - a.updatedAt)

  return results.slice(0, limit)
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/server/session-search.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/session-search.ts test/unit/server/session-search.test.ts
git commit -m "$(cat <<'EOF'
feat(session-search): implement title tier search

Searches cached title and summary fields from indexed sessions.
Case-insensitive, partial matching, sorted by recency.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Implement JSONL Content Extractor

**Files:**
- Modify: `server/session-search.ts`
- Test: `test/unit/server/session-search.test.ts`

**Step 1: Write failing test for content extraction**

```typescript
// Add to test/unit/server/session-search.test.ts
import { extractUserMessages, extractAllMessages } from '../../../server/session-search.js'

describe('extractUserMessages()', () => {
  it('extracts user messages from simple format', () => {
    const content = [
      '{"type":"user","message":"Hello world","uuid":"1"}',
      '{"type":"assistant","message":"Hi there","uuid":"2"}',
      '{"type":"user","message":"How are you?","uuid":"3"}',
    ].join('\n')

    const messages = extractUserMessages(content)

    expect(messages).toHaveLength(2)
    expect(messages[0]).toBe('Hello world')
    expect(messages[1]).toBe('How are you?')
  })

  it('extracts user messages from nested message.content format', () => {
    const content = [
      '{"type":"user","message":{"role":"user","content":"Nested message"},"uuid":"1"}',
    ].join('\n')

    const messages = extractUserMessages(content)

    expect(messages).toHaveLength(1)
    expect(messages[0]).toBe('Nested message')
  })

  it('extracts user messages from content array format', () => {
    const content = [
      '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Array format"}]},"uuid":"1"}',
    ].join('\n')

    const messages = extractUserMessages(content)

    expect(messages).toHaveLength(1)
    expect(messages[0]).toBe('Array format')
  })

  it('skips non-user messages', () => {
    const content = [
      '{"type":"assistant","message":"Response","uuid":"1"}',
      '{"type":"system","subtype":"init","uuid":"2"}',
    ].join('\n')

    const messages = extractUserMessages(content)

    expect(messages).toHaveLength(0)
  })

  it('handles malformed JSON gracefully', () => {
    const content = [
      'not valid json',
      '{"type":"user","message":"Valid","uuid":"1"}',
    ].join('\n')

    const messages = extractUserMessages(content)

    expect(messages).toHaveLength(1)
    expect(messages[0]).toBe('Valid')
  })
})

describe('extractAllMessages()', () => {
  it('extracts both user and assistant messages', () => {
    const content = [
      '{"type":"user","message":"User says hello","uuid":"1"}',
      '{"type":"assistant","message":"Assistant responds","uuid":"2"}',
    ].join('\n')

    const messages = extractAllMessages(content)

    expect(messages).toHaveLength(2)
    expect(messages).toContain('User says hello')
    expect(messages).toContain('Assistant responds')
  })

  it('extracts text from assistant content arrays', () => {
    const content = [
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Main response"},{"type":"thinking","thinking":"Internal thought"}]},"uuid":"1"}',
    ].join('\n')

    const messages = extractAllMessages(content)

    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('Main response')
    expect(messages[0]).toContain('Internal thought')
  })

  it('skips system and progress messages', () => {
    const content = [
      '{"type":"system","subtype":"init","uuid":"1"}',
      '{"type":"progress","content":"Loading...","uuid":"2"}',
      '{"type":"user","message":"Hello","uuid":"3"}',
    ].join('\n')

    const messages = extractAllMessages(content)

    expect(messages).toHaveLength(1)
    expect(messages[0]).toBe('Hello')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/server/session-search.test.ts`
Expected: FAIL with "extractUserMessages is not a function"

**Step 3: Implement content extractors**

```typescript
// Add to server/session-search.ts

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === 'string') return block
        if (block?.type === 'text' && typeof block.text === 'string') return block.text
        if (block?.type === 'thinking' && typeof block.thinking === 'string') return block.thinking
        return ''
      })
      .filter(Boolean)
      .join(' ')
  }
  return ''
}

function extractMessageText(obj: any): string | null {
  // Direct message string
  if (typeof obj.message === 'string') {
    return obj.message
  }
  // Nested message.content
  if (obj.message && typeof obj.message === 'object') {
    const content = obj.message.content
    return extractTextFromContent(content) || null
  }
  // Direct content field
  if (obj.content) {
    return extractTextFromContent(obj.content) || null
  }
  return null
}

export function extractUserMessages(content: string): string[] {
  const messages: string[] = []
  const lines = content.split(/\r?\n/).filter(Boolean)

  for (const line of lines) {
    try {
      const obj = JSON.parse(line)
      if (obj.type !== 'user') continue

      const text = extractMessageText(obj)
      if (text) messages.push(text)
    } catch {
      // Skip malformed JSON
    }
  }

  return messages
}

export function extractAllMessages(content: string): string[] {
  const messages: string[] = []
  const lines = content.split(/\r?\n/).filter(Boolean)

  for (const line of lines) {
    try {
      const obj = JSON.parse(line)
      if (obj.type !== 'user' && obj.type !== 'assistant') continue

      const text = extractMessageText(obj)
      if (text) messages.push(text)
    } catch {
      // Skip malformed JSON
    }
  }

  return messages
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/server/session-search.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/session-search.ts test/unit/server/session-search.test.ts
git commit -m "$(cat <<'EOF'
feat(session-search): add JSONL content extractors

extractUserMessages() - extracts text from user type messages
extractAllMessages() - extracts text from user and assistant messages
Handles various Claude JSONL formats (string, nested, array content).

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Implement File-Based Search (Tier 2 & 3)

**Files:**
- Modify: `server/session-search.ts`
- Test: `test/unit/server/session-search.test.ts`

**Step 1: Write failing test for file-based search**

```typescript
// Add to test/unit/server/session-search.test.ts
import { searchSessionFile } from '../../../server/session-search.js'
import fsp from 'fs/promises'
import path from 'path'
import os from 'os'

describe('searchSessionFile()', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'session-search-test-'))
  })

  afterEach(async () => {
    await fsp.rm(tempDir, { recursive: true, force: true })
  })

  async function createTestSession(name: string, content: string): Promise<string> {
    const filePath = path.join(tempDir, `${name}.jsonl`)
    await fsp.writeFile(filePath, content)
    return filePath
  }

  it('finds match in user message (tier userMessages)', async () => {
    const filePath = await createTestSession('test1', [
      '{"type":"user","message":"Fix the authentication bug","uuid":"1"}',
      '{"type":"assistant","message":"I will fix that","uuid":"2"}',
    ].join('\n'))

    const result = await searchSessionFile(filePath, 'authentication', 'userMessages')

    expect(result).not.toBeNull()
    expect(result?.matchedIn).toBe('userMessage')
    expect(result?.snippet).toContain('authentication')
  })

  it('does not search assistant messages in tier userMessages', async () => {
    const filePath = await createTestSession('test2', [
      '{"type":"user","message":"Hello","uuid":"1"}',
      '{"type":"assistant","message":"The authentication is fixed","uuid":"2"}',
    ].join('\n'))

    const result = await searchSessionFile(filePath, 'authentication', 'userMessages')

    expect(result).toBeNull()
  })

  it('searches assistant messages in tier fullText', async () => {
    const filePath = await createTestSession('test3', [
      '{"type":"user","message":"Hello","uuid":"1"}',
      '{"type":"assistant","message":"The authentication is fixed","uuid":"2"}',
    ].join('\n'))

    const result = await searchSessionFile(filePath, 'authentication', 'fullText')

    expect(result).not.toBeNull()
    expect(result?.matchedIn).toBe('assistantMessage')
  })

  it('extracts snippet context around match', async () => {
    const longMessage = 'A'.repeat(50) + 'TARGET' + 'B'.repeat(50)
    const filePath = await createTestSession('test4', [
      `{"type":"user","message":"${longMessage}","uuid":"1"}`,
    ].join('\n'))

    const result = await searchSessionFile(filePath, 'TARGET', 'userMessages')

    expect(result?.snippet?.length).toBeLessThanOrEqual(120)
    expect(result?.snippet).toContain('TARGET')
  })

  it('returns null for non-existent file', async () => {
    const result = await searchSessionFile('/nonexistent/file.jsonl', 'test', 'fullText')

    expect(result).toBeNull()
  })

  it('is case-insensitive', async () => {
    const filePath = await createTestSession('test5', [
      '{"type":"user","message":"Fix the BUG","uuid":"1"}',
    ].join('\n'))

    const result = await searchSessionFile(filePath, 'bug', 'userMessages')

    expect(result).not.toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/server/session-search.test.ts`
Expected: FAIL with "searchSessionFile is not a function"

**Step 3: Implement searchSessionFile**

```typescript
// Add to server/session-search.ts
import fs from 'fs'
import path from 'path'

function extractSnippet(text: string, query: string, contextLength = 50): string {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const index = lowerText.indexOf(lowerQuery)

  if (index === -1) return text.slice(0, 100)

  const start = Math.max(0, index - contextLength)
  const end = Math.min(text.length, index + query.length + contextLength)

  let snippet = text.slice(start, end)
  if (start > 0) snippet = '...' + snippet
  if (end < text.length) snippet = snippet + '...'

  return snippet
}

export async function searchSessionFile(
  filePath: string,
  query: string,
  tier: 'userMessages' | 'fullText'
): Promise<Omit<SearchResult, 'sessionId' | 'projectPath' | 'updatedAt'> | null> {
  const q = query.toLowerCase()

  let content: string
  try {
    content = await fs.promises.readFile(filePath, 'utf-8')
  } catch {
    return null
  }

  const lines = content.split(/\r?\n/).filter(Boolean)

  for (const line of lines) {
    let obj: any
    try {
      obj = JSON.parse(line)
    } catch {
      continue
    }

    const isUser = obj.type === 'user'
    const isAssistant = obj.type === 'assistant'

    // In userMessages tier, only search user messages
    if (tier === 'userMessages' && !isUser) continue
    // In fullText tier, search both
    if (tier === 'fullText' && !isUser && !isAssistant) continue

    const text = extractMessageText(obj)
    if (!text) continue

    if (text.toLowerCase().includes(q)) {
      return {
        matchedIn: isUser ? 'userMessage' : 'assistantMessage',
        snippet: extractSnippet(text, query),
      }
    }
  }

  return null
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/server/session-search.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/session-search.ts test/unit/server/session-search.test.ts
git commit -m "$(cat <<'EOF'
feat(session-search): implement file-based search for tier 2 & 3

searchSessionFile() reads JSONL and searches message content.
Tier userMessages: only user messages
Tier fullText: user + assistant messages
Returns snippet with context around match.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Implement Full Search Orchestrator

**Files:**
- Modify: `server/session-search.ts`
- Test: `test/unit/server/session-search.test.ts`

**Step 1: Write failing test for search orchestrator**

```typescript
// Add to test/unit/server/session-search.test.ts
import { searchSessions } from '../../../server/session-search.js'

describe('searchSessions() orchestrator', () => {
  let tempDir: string
  let mockClaudeHome: string

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'search-orchestrator-'))
    mockClaudeHome = path.join(tempDir, '.claude')
    const projectDir = path.join(mockClaudeHome, 'projects', 'test-project')
    await fsp.mkdir(projectDir, { recursive: true })

    // Create test sessions
    await fsp.writeFile(
      path.join(projectDir, 'session-1.jsonl'),
      '{"type":"user","message":"Fix login bug","uuid":"1","cwd":"/project"}\n'
    )
    await fsp.writeFile(
      path.join(projectDir, 'session-2.jsonl'),
      '{"type":"user","message":"Hello","uuid":"1","cwd":"/project"}\n' +
      '{"type":"assistant","message":"The authentication system works","uuid":"2"}\n'
    )
  })

  afterEach(async () => {
    await fsp.rm(tempDir, { recursive: true, force: true })
  })

  it('tier title only searches metadata', async () => {
    const projects: ProjectGroup[] = [
      {
        projectPath: '/test-project',
        sessions: [
          { sessionId: 'session-1', projectPath: '/test-project', updatedAt: 1000, title: 'Fix login bug', cwd: '/project' },
          { sessionId: 'session-2', projectPath: '/test-project', updatedAt: 2000, title: 'Hello', cwd: '/project' },
        ],
      },
    ]

    const response = await searchSessions({
      projects,
      claudeHome: mockClaudeHome,
      query: 'login',
      tier: 'title',
    })

    expect(response.results).toHaveLength(1)
    expect(response.results[0].sessionId).toBe('session-1')
    expect(response.tier).toBe('title')
  })

  it('tier userMessages searches file content', async () => {
    const projects: ProjectGroup[] = [
      {
        projectPath: '/test-project',
        sessions: [
          { sessionId: 'session-1', projectPath: '/test-project', updatedAt: 1000, title: 'Fix login bug', cwd: '/project' },
          { sessionId: 'session-2', projectPath: '/test-project', updatedAt: 2000, title: 'Hello', cwd: '/project' },
        ],
      },
    ]

    const response = await searchSessions({
      projects,
      claudeHome: mockClaudeHome,
      query: 'login',
      tier: 'userMessages',
    })

    expect(response.results).toHaveLength(1)
    expect(response.results[0].sessionId).toBe('session-1')
  })

  it('tier fullText finds assistant message matches', async () => {
    const projects: ProjectGroup[] = [
      {
        projectPath: '/test-project',
        sessions: [
          { sessionId: 'session-1', projectPath: '/test-project', updatedAt: 1000, title: 'Login', cwd: '/project' },
          { sessionId: 'session-2', projectPath: '/test-project', updatedAt: 2000, title: 'Hello', cwd: '/project' },
        ],
      },
    ]

    const response = await searchSessions({
      projects,
      claudeHome: mockClaudeHome,
      query: 'authentication',
      tier: 'fullText',
    })

    expect(response.results).toHaveLength(1)
    expect(response.results[0].sessionId).toBe('session-2')
    expect(response.results[0].matchedIn).toBe('assistantMessage')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/server/session-search.test.ts`
Expected: FAIL with "searchSessions is not a function"

**Step 3: Implement searchSessions orchestrator**

```typescript
// Add to server/session-search.ts

export interface SearchSessionsOptions {
  projects: ProjectGroup[]
  claudeHome: string
  query: string
  tier: SearchTierType
  limit?: number
}

export async function searchSessions(options: SearchSessionsOptions): Promise<SearchResponse> {
  const { projects, claudeHome, query, tier, limit = 50 } = options

  // Tier 1: Title search (instant, metadata only)
  if (tier === SearchTier.Title) {
    const results = searchTitleTier(projects, query, limit)
    return {
      results,
      tier,
      query,
      totalScanned: projects.reduce((sum, p) => sum + p.sessions.length, 0),
    }
  }

  // Tier 2 & 3: File-based search
  const results: SearchResult[] = []
  let totalScanned = 0

  for (const project of projects) {
    for (const session of project.sessions) {
      totalScanned++

      // Construct file path
      const projectDirName = project.projectPath.replace(/[/\\:]/g, '-').replace(/^-+/, '')
      const sessionFile = path.join(
        claudeHome,
        'projects',
        projectDirName,
        `${session.sessionId}.jsonl`
      )

      // Try direct path first, then search for the file
      let filePath = sessionFile
      try {
        await fs.promises.access(filePath)
      } catch {
        // File not found at expected path - skip
        continue
      }

      const searchTier = tier === SearchTier.UserMessages ? 'userMessages' : 'fullText'
      const match = await searchSessionFile(filePath, query, searchTier)

      if (match) {
        results.push({
          sessionId: session.sessionId,
          projectPath: session.projectPath,
          title: session.title,
          summary: session.summary,
          matchedIn: match.matchedIn,
          snippet: match.snippet,
          updatedAt: session.updatedAt,
          cwd: session.cwd,
        })

        if (results.length >= limit) break
      }
    }
    if (results.length >= limit) break
  }

  // Sort by updatedAt descending
  results.sort((a, b) => b.updatedAt - a.updatedAt)

  return {
    results,
    tier,
    query,
    totalScanned,
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/server/session-search.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/session-search.ts test/unit/server/session-search.test.ts
git commit -m "$(cat <<'EOF'
feat(session-search): add search orchestrator for all tiers

searchSessions() coordinates search across all sessions.
- title tier: instant metadata search
- userMessages tier: searches user message content in JSONL files
- fullText tier: searches all message content in JSONL files

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Add Search API Endpoint

**Files:**
- Modify: `server/index.ts`
- Test: `test/integration/server/session-search-api.test.ts`

**Step 1: Write failing integration test**

```typescript
// test/integration/server/session-search-api.test.ts
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import fsp from 'fs/promises'
import path from 'path'
import os from 'os'

const mockState = vi.hoisted(() => ({
  homeDir: process.env.TEMP || process.env.TMP || '/tmp',
}))

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os')
  return {
    ...actual,
    default: { ...actual, homedir: () => mockState.homeDir },
    homedir: () => mockState.homeDir,
  }
})

import { searchSessions, SearchRequestSchema } from '../../../server/session-search.js'
import type { ProjectGroup } from '../../../server/claude-indexer.js'

const TEST_AUTH_TOKEN = 'test-auth-token'

describe('Session Search API', () => {
  let app: Express
  let tempDir: string
  let claudeHome: string
  let mockProjects: ProjectGroup[]

  beforeAll(() => {
    process.env.AUTH_TOKEN = TEST_AUTH_TOKEN
  })

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'search-api-test-'))
    mockState.homeDir = tempDir
    claudeHome = path.join(tempDir, '.claude')

    // Create mock sessions
    const projectDir = path.join(claudeHome, 'projects', 'test-project')
    await fsp.mkdir(projectDir, { recursive: true })

    await fsp.writeFile(
      path.join(projectDir, 'session-abc.jsonl'),
      '{"type":"user","message":"Fix login bug","uuid":"1","cwd":"/project"}\n'
    )

    mockProjects = [
      {
        projectPath: '/test-project',
        sessions: [
          { sessionId: 'session-abc', projectPath: '/test-project', updatedAt: 1000, title: 'Fix login bug', cwd: '/project' },
        ],
      },
    ]

    app = express()
    app.use(express.json())

    // Auth middleware
    app.use('/api', (req, res, next) => {
      const token = req.headers['x-auth-token']
      if (token !== TEST_AUTH_TOKEN) return res.status(401).json({ error: 'Unauthorized' })
      next()
    })

    // Search endpoint
    app.get('/api/sessions/search', async (req, res) => {
      try {
        const parsed = SearchRequestSchema.safeParse({
          query: req.query.q,
          tier: req.query.tier || 'title',
          limit: req.query.limit ? Number(req.query.limit) : undefined,
        })

        if (!parsed.success) {
          return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues })
        }

        const response = await searchSessions({
          projects: mockProjects,
          claudeHome,
          query: parsed.data.query,
          tier: parsed.data.tier,
          limit: parsed.data.limit,
        })

        res.json(response)
      } catch (err: any) {
        res.status(500).json({ error: err.message })
      }
    })
  })

  afterEach(async () => {
    await fsp.rm(tempDir, { recursive: true, force: true })
  })

  afterAll(() => {
    delete process.env.AUTH_TOKEN
  })

  it('requires authentication', async () => {
    const res = await request(app).get('/api/sessions/search?q=test')
    expect(res.status).toBe(401)
  })

  it('requires query parameter', async () => {
    const res = await request(app)
      .get('/api/sessions/search')
      .set('x-auth-token', TEST_AUTH_TOKEN)

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Invalid request')
  })

  it('searches with default title tier', async () => {
    const res = await request(app)
      .get('/api/sessions/search?q=login')
      .set('x-auth-token', TEST_AUTH_TOKEN)

    expect(res.status).toBe(200)
    expect(res.body.tier).toBe('title')
    expect(res.body.results).toHaveLength(1)
    expect(res.body.results[0].sessionId).toBe('session-abc')
  })

  it('accepts tier parameter', async () => {
    const res = await request(app)
      .get('/api/sessions/search?q=login&tier=userMessages')
      .set('x-auth-token', TEST_AUTH_TOKEN)

    expect(res.status).toBe(200)
    expect(res.body.tier).toBe('userMessages')
  })

  it('accepts limit parameter', async () => {
    const res = await request(app)
      .get('/api/sessions/search?q=a&tier=title&limit=5')
      .set('x-auth-token', TEST_AUTH_TOKEN)

    expect(res.status).toBe(200)
  })

  it('rejects invalid tier', async () => {
    const res = await request(app)
      .get('/api/sessions/search?q=test&tier=invalid')
      .set('x-auth-token', TEST_AUTH_TOKEN)

    expect(res.status).toBe(400)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/integration/server/session-search-api.test.ts`
Expected: PASS (test creates its own app, so this should work once imports work)

**Step 3: Add endpoint to server/index.ts**

```typescript
// Add to server/index.ts after the other session routes (around line 167)

// --- API: session search ---
app.get('/api/sessions/search', async (req, res) => {
  try {
    const { SearchRequestSchema, searchSessions } = await import('./session-search.js')

    const parsed = SearchRequestSchema.safeParse({
      query: req.query.q,
      tier: req.query.tier || 'title',
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    })

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues })
    }

    const response = await searchSessions({
      projects: claudeIndexer.getProjects(),
      claudeHome: defaultClaudeHome(),
      query: parsed.data.query,
      tier: parsed.data.tier,
      limit: parsed.data.limit,
    })

    res.json(response)
  } catch (err: any) {
    logger.error({ err }, 'Session search failed')
    res.status(500).json({ error: 'Search failed' })
  }
})
```

Also add the import at the top:
```typescript
import { defaultClaudeHome } from './claude-indexer.js'
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/integration/server/session-search-api.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/index.ts test/integration/server/session-search-api.test.ts
git commit -m "$(cat <<'EOF'
feat(session-search): add GET /api/sessions/search endpoint

Query params:
- q (required): search query string
- tier (optional): title, userMessages, or fullText (default: title)
- limit (optional): max results (default: 50)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Add Frontend Search API Function

**Files:**
- Modify: `src/lib/api.ts`
- Test: `test/unit/client/lib/api.test.ts` (create)

**Step 1: Write failing test**

```typescript
// test/unit/client/lib/api.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock sessionStorage
const mockSessionStorage: Record<string, string> = {}
vi.stubGlobal('sessionStorage', {
  getItem: (key: string) => mockSessionStorage[key] || null,
  setItem: (key: string, value: string) => { mockSessionStorage[key] = value },
})

import { api, searchSessions, type SearchResponse } from '@/lib/api'

describe('searchSessions()', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockSessionStorage['auth-token'] = 'test-token'
  })

  it('calls /api/sessions/search with query', async () => {
    const mockResponse: SearchResponse = {
      results: [],
      tier: 'title',
      query: 'test',
      totalScanned: 0,
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    })

    await searchSessions({ query: 'test' })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/sessions/search?q=test&tier=title',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    )
  })

  it('includes tier parameter', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ results: [], tier: 'fullText', query: 'test', totalScanned: 0 })),
    })

    await searchSessions({ query: 'test', tier: 'fullText' })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/sessions/search?q=test&tier=fullText',
      expect.anything()
    )
  })

  it('includes limit parameter when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ results: [], tier: 'title', query: 'test', totalScanned: 0 })),
    })

    await searchSessions({ query: 'test', limit: 10 })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/sessions/search?q=test&tier=title&limit=10',
      expect.anything()
    )
  })

  it('returns search response', async () => {
    const mockResponse: SearchResponse = {
      results: [
        { sessionId: 'abc', projectPath: '/proj', matchedIn: 'title', updatedAt: 1000 },
      ],
      tier: 'title',
      query: 'test',
      totalScanned: 5,
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    })

    const result = await searchSessions({ query: 'test' })

    expect(result.results).toHaveLength(1)
    expect(result.results[0].sessionId).toBe('abc')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/client/lib/api.test.ts`
Expected: FAIL with "searchSessions is not exported"

**Step 3: Add searchSessions to api.ts**

```typescript
// Add to src/lib/api.ts

export type SearchResult = {
  sessionId: string
  projectPath: string
  title?: string
  summary?: string
  matchedIn: 'title' | 'userMessage' | 'assistantMessage' | 'summary'
  snippet?: string
  updatedAt: number
  cwd?: string
}

export type SearchResponse = {
  results: SearchResult[]
  tier: 'title' | 'userMessages' | 'fullText'
  query: string
  totalScanned: number
}

export type SearchOptions = {
  query: string
  tier?: 'title' | 'userMessages' | 'fullText'
  limit?: number
}

export async function searchSessions(options: SearchOptions): Promise<SearchResponse> {
  const { query, tier = 'title', limit } = options
  const params = new URLSearchParams({ q: query, tier })
  if (limit) params.set('limit', String(limit))

  return api.get<SearchResponse>(`/api/sessions/search?${params}`)
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/client/lib/api.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/api.ts test/unit/client/lib/api.test.ts
git commit -m "$(cat <<'EOF'
feat(session-search): add searchSessions() client API function

Calls GET /api/sessions/search with query, tier, and limit params.
Returns typed SearchResponse with results array.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Add Search Tier Toggle to Sidebar

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Test: `test/unit/client/components/Sidebar.test.tsx`

**Step 1: Write failing test for tier toggle**

```typescript
// Add to test/unit/client/components/Sidebar.test.tsx
describe('Search tier toggle', () => {
  it('renders tier selector when searching', async () => {
    const store = createTestStore()
    const { getByPlaceholderText, getByRole, queryByRole } = renderSidebar(store, [])
    await act(() => vi.advanceTimersByTime(100))

    // Type in search
    const input = getByPlaceholderText('Search...')
    fireEvent.change(input, { target: { value: 'test' } })

    // Should show tier selector
    expect(getByRole('combobox', { name: /search tier/i })).toBeInTheDocument()
  })

  it('hides tier selector when search is empty', async () => {
    const store = createTestStore()
    const { getByPlaceholderText, queryByRole } = renderSidebar(store, [])
    await act(() => vi.advanceTimersByTime(100))

    const input = getByPlaceholderText('Search...')
    expect(input).toHaveValue('')
    expect(queryByRole('combobox', { name: /search tier/i })).not.toBeInTheDocument()
  })

  it('defaults to title tier', async () => {
    const store = createTestStore()
    const { getByPlaceholderText, getByRole } = renderSidebar(store, [])
    await act(() => vi.advanceTimersByTime(100))

    fireEvent.change(getByPlaceholderText('Search...'), { target: { value: 'test' } })

    const select = getByRole('combobox', { name: /search tier/i })
    expect(select).toHaveValue('title')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/client/components/Sidebar.test.tsx`
Expected: FAIL with "Unable to find an accessible element"

**Step 3: Add tier toggle to Sidebar**

```typescript
// Modify src/components/Sidebar.tsx

// Add state for search tier (near other state declarations)
const [searchTier, setSearchTier] = useState<'title' | 'userMessages' | 'fullText'>('title')

// Update the Search section JSX (replace the existing search div)
{/* Search */}
<div className="px-3 pb-3">
  <div className="relative">
    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
    <input
      type="text"
      placeholder="Search..."
      value={filter}
      onChange={(e) => setFilter(e.target.value)}
      className="w-full h-8 pl-8 pr-3 text-sm bg-muted/50 border-0 rounded-md placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-border"
    />
  </div>
  {filter.trim() && (
    <div className="mt-2">
      <select
        aria-label="Search tier"
        value={searchTier}
        onChange={(e) => setSearchTier(e.target.value as typeof searchTier)}
        className="w-full h-7 px-2 text-xs bg-muted/50 border-0 rounded-md focus:outline-none focus:ring-1 focus:ring-border"
      >
        <option value="title">Title</option>
        <option value="userMessages">User Msg</option>
        <option value="fullText">Full Text</option>
      </select>
    </div>
  )}
</div>
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/client/components/Sidebar.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/Sidebar.tsx test/unit/client/components/Sidebar.test.tsx
git commit -m "$(cat <<'EOF'
feat(session-search): add tier toggle to sidebar search

Shows dropdown when search has text:
- Title (default): searches cached titles/summaries
- User Msg: searches user message content
- Full Text: searches all message content

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Wire Up Backend Search in Sidebar

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Test: `test/unit/client/components/Sidebar.test.tsx`

**Step 1: Write failing test for backend search**

```typescript
// Add to test/unit/client/components/Sidebar.test.tsx

// Mock the searchSessions API
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual('@/lib/api')
  return {
    ...actual,
    searchSessions: vi.fn(),
  }
})

import { searchSessions as mockSearchSessions } from '@/lib/api'

describe('Backend search integration', () => {
  beforeEach(() => {
    vi.mocked(mockSearchSessions).mockReset()
  })

  it('calls searchSessions API when tier is not title and query exists', async () => {
    vi.mocked(mockSearchSessions).mockResolvedValue({
      results: [
        { sessionId: 'result-1', projectPath: '/proj', matchedIn: 'userMessage', updatedAt: 1000, snippet: 'Found it' },
      ],
      tier: 'userMessages',
      query: 'test',
      totalScanned: 5,
    })

    const store = createTestStore({ projects: [] })
    const { getByPlaceholderText, getByRole, findByText } = renderSidebar(store, [])
    await act(() => vi.advanceTimersByTime(100))

    // Enter search query
    fireEvent.change(getByPlaceholderText('Search...'), { target: { value: 'test' } })

    // Change tier to userMessages
    fireEvent.change(getByRole('combobox', { name: /search tier/i }), { target: { value: 'userMessages' } })

    // Wait for debounce
    await act(() => vi.advanceTimersByTime(500))

    expect(mockSearchSessions).toHaveBeenCalledWith({
      query: 'test',
      tier: 'userMessages',
    })
  })

  it('displays search results from API', async () => {
    vi.mocked(mockSearchSessions).mockResolvedValue({
      results: [
        { sessionId: 'result-1', projectPath: '/proj', matchedIn: 'userMessage', updatedAt: 1000, title: 'Found Session', snippet: 'test found here' },
      ],
      tier: 'userMessages',
      query: 'test',
      totalScanned: 5,
    })

    const store = createTestStore({ projects: [] })
    const { getByPlaceholderText, getByRole, findByText } = renderSidebar(store, [])
    await act(() => vi.advanceTimersByTime(100))

    fireEvent.change(getByPlaceholderText('Search...'), { target: { value: 'test' } })
    fireEvent.change(getByRole('combobox', { name: /search tier/i }), { target: { value: 'userMessages' } })

    await act(() => vi.advanceTimersByTime(500))

    expect(await findByText('Found Session')).toBeInTheDocument()
  })

  it('does not call API for title tier (uses local filter)', async () => {
    const store = createTestStore({
      projects: [
        {
          projectPath: '/proj',
          sessions: [{ sessionId: 's1', projectPath: '/proj', updatedAt: 1000, title: 'Test session', cwd: '/proj' }],
        },
      ],
    })
    const { getByPlaceholderText, getByRole } = renderSidebar(store, [])
    await act(() => vi.advanceTimersByTime(100))

    fireEvent.change(getByPlaceholderText('Search...'), { target: { value: 'test' } })

    // Keep default title tier
    await act(() => vi.advanceTimersByTime(500))

    expect(mockSearchSessions).not.toHaveBeenCalled()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/client/components/Sidebar.test.tsx`
Expected: FAIL

**Step 3: Wire up backend search**

```typescript
// Modify src/components/Sidebar.tsx

// Add imports
import { searchSessions, type SearchResponse, type SearchResult } from '@/lib/api'

// Add state for search results
const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null)
const [isSearching, setIsSearching] = useState(false)

// Add effect for backend search
useEffect(() => {
  if (!filter.trim() || searchTier === 'title') {
    setSearchResults(null)
    return
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(async () => {
    setIsSearching(true)
    try {
      const response = await searchSessions({
        query: filter.trim(),
        tier: searchTier,
      })
      if (!controller.signal.aborted) {
        setSearchResults(response.results)
      }
    } catch (err) {
      console.error('Search failed:', err)
      if (!controller.signal.aborted) {
        setSearchResults([])
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsSearching(false)
      }
    }
  }, 300) // Debounce 300ms

  return () => {
    controller.abort()
    clearTimeout(timeoutId)
  }
}, [filter, searchTier])

// Modify filteredItems to use searchResults when available
const filteredItems = useMemo(() => {
  // If we have backend search results, convert them to SessionItems
  if (searchResults !== null) {
    return searchResults.map((result): SessionItem => ({
      id: `search-${result.sessionId}`,
      sessionId: result.sessionId,
      title: result.title || result.sessionId.slice(0, 8),
      subtitle: getProjectName(result.projectPath),
      projectPath: result.projectPath,
      timestamp: result.updatedAt,
      cwd: result.cwd,
      hasTab: tabs.some((t) => t.resumeSessionId === result.sessionId),
      isRunning: false,
    }))
  }

  // Otherwise use local filtering for title tier
  if (!filter.trim()) return sessionItems
  const q = filter.toLowerCase()
  return sessionItems.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.subtitle?.toLowerCase().includes(q) ||
      item.projectPath?.toLowerCase().includes(q)
  )
}, [searchResults, sessionItems, filter, tabs])
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/client/components/Sidebar.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/Sidebar.tsx test/unit/client/components/Sidebar.test.tsx
git commit -m "$(cat <<'EOF'
feat(session-search): wire up backend search in sidebar

- Title tier: uses local filtering (instant)
- User Msg / Full Text tiers: calls backend API with 300ms debounce
- Displays results in same session list format
- Handles loading state and errors

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Add Loading Indicator and Polish

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Test: `test/unit/client/components/Sidebar.test.tsx`

**Step 1: Write failing test for loading state**

```typescript
// Add to test/unit/client/components/Sidebar.test.tsx
describe('Search loading state', () => {
  it('shows loading indicator while searching', async () => {
    // Make the search take some time
    vi.mocked(mockSearchSessions).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({
        results: [],
        tier: 'userMessages',
        query: 'test',
        totalScanned: 0,
      }), 1000))
    )

    const store = createTestStore({ projects: [] })
    const { getByPlaceholderText, getByRole, getByTestId, queryByTestId } = renderSidebar(store, [])
    await act(() => vi.advanceTimersByTime(100))

    fireEvent.change(getByPlaceholderText('Search...'), { target: { value: 'test' } })
    fireEvent.change(getByRole('combobox', { name: /search tier/i }), { target: { value: 'userMessages' } })

    // After debounce but before search completes
    await act(() => vi.advanceTimersByTime(350))
    expect(getByTestId('search-loading')).toBeInTheDocument()

    // After search completes
    await act(() => vi.advanceTimersByTime(1000))
    expect(queryByTestId('search-loading')).not.toBeInTheDocument()
  })

  it('shows "No results" message when search returns empty', async () => {
    vi.mocked(mockSearchSessions).mockResolvedValue({
      results: [],
      tier: 'userMessages',
      query: 'nonexistent',
      totalScanned: 10,
    })

    const store = createTestStore({ projects: [] })
    const { getByPlaceholderText, getByRole, findByText } = renderSidebar(store, [])
    await act(() => vi.advanceTimersByTime(100))

    fireEvent.change(getByPlaceholderText('Search...'), { target: { value: 'nonexistent' } })
    fireEvent.change(getByRole('combobox', { name: /search tier/i }), { target: { value: 'userMessages' } })

    await act(() => vi.advanceTimersByTime(500))

    expect(await findByText(/no results/i)).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/client/components/Sidebar.test.tsx`
Expected: FAIL

**Step 3: Add loading indicator and empty state**

```typescript
// Modify src/components/Sidebar.tsx

// Add Loader2 to lucide-react imports
import { Terminal, History, Settings, LayoutGrid, Search, Play, Loader2 } from 'lucide-react'

// Update the Session List section to show loading/empty states
{/* Session List */}
<div className="flex-1 overflow-y-auto px-2">
  {isSearching && (
    <div className="flex items-center justify-center py-8" data-testid="search-loading">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
    </div>
  )}
  {!isSearching && (
    <div className="space-y-0.5">
      {sortedItems.length === 0 ? (
        <div className="px-2 py-8 text-center text-sm text-muted-foreground">
          {filter.trim() && searchTier !== 'title'
            ? 'No results found'
            : filter.trim()
            ? 'No matching sessions'
            : 'No sessions yet'}
        </div>
      ) : (
        sortedItems.map((item) => {
          const activeTab = tabs.find((t) => t.id === activeTabId)
          const isActive = item.isRunning
            ? item.runningTerminalId === activeTab?.terminalId
            : item.sessionId === activeTab?.resumeSessionId

          return (
            <SidebarItem
              key={item.id}
              item={item}
              isActiveTab={isActive}
              showProjectBadge={settings.sidebar?.showProjectBadges}
              onClick={() => handleItemClick(item)}
            />
          )
        })
      )}
    </div>
  )}
</div>
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/client/components/Sidebar.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/Sidebar.tsx test/unit/client/components/Sidebar.test.tsx
git commit -m "$(cat <<'EOF'
feat(session-search): add loading indicator and empty state

- Shows spinner while backend search is in progress
- Shows "No results found" for empty backend search results
- Shows "No matching sessions" for empty local filter results

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Final Integration Test and Cleanup

**Files:**
- Create: `test/integration/session-search-e2e.test.ts`

**Step 1: Write integration test**

```typescript
// test/integration/session-search-e2e.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fsp from 'fs/promises'
import path from 'path'
import os from 'os'
import { searchSessions, SearchTier } from '../../server/session-search.js'
import type { ProjectGroup } from '../../server/claude-indexer.js'

describe('Session Search E2E', () => {
  let tempDir: string
  let claudeHome: string

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'search-e2e-'))
    claudeHome = path.join(tempDir, '.claude')

    // Create realistic session structure
    const projectDir = path.join(claudeHome, 'projects', '-home-user-myproject')
    await fsp.mkdir(projectDir, { recursive: true })

    // Session 1: Login feature
    await fsp.writeFile(
      path.join(projectDir, 'session-login.jsonl'),
      [
        '{"type":"system","subtype":"init","session_id":"session-login","uuid":"1"}',
        '{"type":"user","message":"Help me implement user authentication","uuid":"2","parentUuid":"1","cwd":"/home/user/myproject"}',
        '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"I\\'ll help you implement authentication. Let\\'s start with JWT tokens."}]},"uuid":"3","parentUuid":"2"}',
        '{"type":"user","message":"Can you also add password hashing?","uuid":"4","parentUuid":"3"}',
        '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Sure! I\\'ll use bcrypt for password hashing."}]},"uuid":"5","parentUuid":"4"}',
      ].join('\n')
    )

    // Session 2: Bug fix
    await fsp.writeFile(
      path.join(projectDir, 'session-bugfix.jsonl'),
      [
        '{"type":"system","subtype":"init","session_id":"session-bugfix","uuid":"1"}',
        '{"type":"user","message":"Fix the memory leak in the worker","uuid":"2","parentUuid":"1","cwd":"/home/user/myproject"}',
        '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"I found the issue - the event listeners aren\\'t being cleaned up."}]},"uuid":"3","parentUuid":"2"}',
      ].join('\n')
    )
  })

  afterEach(async () => {
    await fsp.rm(tempDir, { recursive: true, force: true })
  })

  const mockProjects: ProjectGroup[] = [
    {
      projectPath: '/home/user/myproject',
      sessions: [
        { sessionId: 'session-login', projectPath: '/home/user/myproject', updatedAt: 2000, title: 'Help me implement user authentication', cwd: '/home/user/myproject' },
        { sessionId: 'session-bugfix', projectPath: '/home/user/myproject', updatedAt: 1000, title: 'Fix the memory leak in the worker', cwd: '/home/user/myproject' },
      ],
    },
  ]

  it('title tier finds session by title keyword', async () => {
    const result = await searchSessions({
      projects: mockProjects,
      claudeHome,
      query: 'authentication',
      tier: SearchTier.Title,
    })

    expect(result.results).toHaveLength(1)
    expect(result.results[0].sessionId).toBe('session-login')
  })

  it('userMessages tier finds session by user message content', async () => {
    const result = await searchSessions({
      projects: mockProjects,
      claudeHome,
      query: 'password hashing',
      tier: SearchTier.UserMessages,
    })

    expect(result.results).toHaveLength(1)
    expect(result.results[0].sessionId).toBe('session-login')
  })

  it('fullText tier finds session by assistant response', async () => {
    const result = await searchSessions({
      projects: mockProjects,
      claudeHome,
      query: 'JWT tokens',
      tier: SearchTier.FullText,
    })

    expect(result.results).toHaveLength(1)
    expect(result.results[0].sessionId).toBe('session-login')
    expect(result.results[0].matchedIn).toBe('assistantMessage')
  })

  it('fullText tier finds bcrypt mention in assistant response', async () => {
    const result = await searchSessions({
      projects: mockProjects,
      claudeHome,
      query: 'bcrypt',
      tier: SearchTier.FullText,
    })

    expect(result.results).toHaveLength(1)
    expect(result.results[0].sessionId).toBe('session-login')
  })

  it('returns empty for non-matching query', async () => {
    const result = await searchSessions({
      projects: mockProjects,
      claudeHome,
      query: 'kubernetes deployment',
      tier: SearchTier.FullText,
    })

    expect(result.results).toHaveLength(0)
    expect(result.totalScanned).toBe(2)
  })
})
```

**Step 2: Run test to verify it passes**

Run: `npm test -- test/integration/session-search-e2e.test.ts`
Expected: PASS

**Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add test/integration/session-search-e2e.test.ts
git commit -m "$(cat <<'EOF'
test(session-search): add e2e integration tests

Tests realistic session files with:
- Title tier search
- User message search
- Full text search (including assistant responses)
- Empty result handling

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

**Step 5: Final commit with feature complete**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(session-search): complete tiered session search feature

Adds three-tier search for Claude sessions:
- Title: instant search on cached metadata
- User Msg: searches user message content in JSONL files
- Full Text: searches all message content

Backend:
- GET /api/sessions/search?q=...&tier=...&limit=...
- Streaming JSONL parser with content extractors
- Zod schema validation

Frontend:
- Tier selector dropdown in sidebar
- Debounced API calls for deep search tiers
- Loading state and empty results handling

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Summary

This plan implements tiered session search in 11 tasks:

1. **Types & Schemas** - Zod schemas for search request/response
2. **Title Search** - In-memory search of cached metadata
3. **Content Extractor** - JSONL parser for user/assistant messages
4. **File Search** - Search through JSONL file content
5. **Orchestrator** - Coordinates search across all sessions
6. **API Endpoint** - GET /api/sessions/search
7. **Client API** - searchSessions() function
8. **Tier Toggle** - Dropdown in sidebar
9. **Wire Up Search** - Connect frontend to backend
10. **Loading State** - Spinner and empty state UI
11. **E2E Tests** - Integration test with realistic sessions

Each task follows TDD with failing test → implementation → passing test → commit.
