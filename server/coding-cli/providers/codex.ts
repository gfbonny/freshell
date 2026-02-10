import path from 'path'
import os from 'os'
import fsp from 'fs/promises'
import { extractTitleFromMessage } from '../../title-utils.js'
import type { CodingCliProvider } from '../provider.js'
import type { NormalizedEvent, ParsedSessionMeta, TokenPayload, TokenSummary } from '../types.js'
import { looksLikePath, isSystemContext, extractFromIdeContext, resolveGitRepoRoot } from '../utils.js'

export function defaultCodexHome(): string {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
}

function extractTextContent(items: any[] | undefined): string {
  if (!Array.isArray(items)) return ''
  return items
    .map((item) => (item && typeof item.text === 'string' ? item.text : ''))
    .filter(Boolean)
    .join('\n')
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function normalizeCompactPercent(numerator: number, denominator?: number): number | undefined {
  if (!denominator || denominator <= 0) return undefined
  const ratio = Math.round((numerator / denominator) * 100)
  return Math.max(0, Math.min(100, ratio))
}

type CodexUsage = {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  totalTokens: number
}

function parseUsagePayload(payload: any): CodexUsage | undefined {
  if (!payload || typeof payload !== 'object') return undefined

  const inputTokens = toFiniteNumber(payload.input_tokens ?? payload.inputTokens ?? payload.input) ?? 0
  const outputTokens = toFiniteNumber(payload.output_tokens ?? payload.outputTokens ?? payload.output) ?? 0
  const cachedTokens =
    toFiniteNumber(
      payload.cached_input_tokens ??
      payload.cache_read_input_tokens ??
      payload.cache_creation_input_tokens ??
      payload.cachedTokens ??
      payload.cached_tokens,
    ) ?? 0

  const explicitTotal = toFiniteNumber(payload.total_tokens ?? payload.totalTokens ?? payload.total)
  const totalTokens = explicitTotal ?? (inputTokens + outputTokens + cachedTokens)

  if (inputTokens === 0 && outputTokens === 0 && cachedTokens === 0 && totalTokens === 0) {
    return undefined
  }

  return { inputTokens, outputTokens, cachedTokens, totalTokens }
}

function parseCodexTokenEnvelope(payload: any): {
  eventTokens?: TokenPayload
  summary?: TokenSummary
} {
  const info = payload?.info
  if (info && typeof info === 'object') {
    const lastUsage = parseUsagePayload(info.last_token_usage)
    const totalUsage = parseUsagePayload(info.total_token_usage)

    const modelContextWindow = toFiniteNumber(info.model_context_window)
    const explicitCompactLimit =
      toFiniteNumber(info.model_auto_compact_token_limit) ??
      toFiniteNumber(info.auto_compact_limit) ??
      toFiniteNumber(info.auto_compact_token_limit) ??
      toFiniteNumber(info.compact_token_limit)

    const compactThresholdTokens =
      explicitCompactLimit ??
      (modelContextWindow ? Math.round(modelContextWindow * (90 / 95)) : undefined)

    const contextTokens =
      toFiniteNumber(info.total_usage_tokens) ??
      toFiniteNumber(info.total_token_usage?.total_tokens) ??
      totalUsage?.totalTokens

    const aggregate = totalUsage ?? lastUsage
    const summary = aggregate
      ? {
          inputTokens: aggregate.inputTokens,
          outputTokens: aggregate.outputTokens,
          cachedTokens: aggregate.cachedTokens,
          totalTokens: aggregate.totalTokens,
          contextTokens,
          modelContextWindow,
          compactThresholdTokens,
          compactPercent:
            contextTokens !== undefined
              ? normalizeCompactPercent(contextTokens, compactThresholdTokens)
              : undefined,
        }
      : undefined

    const eventUsage = lastUsage ?? totalUsage
    const eventTokens = eventUsage
      ? {
          inputTokens: eventUsage.inputTokens,
          outputTokens: eventUsage.outputTokens,
          ...(eventUsage.cachedTokens > 0 ? { cachedTokens: eventUsage.cachedTokens } : {}),
        }
      : undefined

    return { eventTokens, summary }
  }

  const legacyUsage = parseUsagePayload(payload)
  if (!legacyUsage) return {}
  return {
    eventTokens: {
      inputTokens: legacyUsage.inputTokens,
      outputTokens: legacyUsage.outputTokens,
      ...(legacyUsage.cachedTokens > 0 ? { cachedTokens: legacyUsage.cachedTokens } : {}),
    },
    summary: {
      inputTokens: legacyUsage.inputTokens,
      outputTokens: legacyUsage.outputTokens,
      cachedTokens: legacyUsage.cachedTokens,
      totalTokens: legacyUsage.totalTokens,
    },
  }
}

export function parseCodexSessionContent(content: string): ParsedSessionMeta {
  const lines = content.split(/\r?\n/).filter(Boolean)
  let sessionId: string | undefined
  let cwd: string | undefined
  let title: string | undefined
  let summary: string | undefined
  let isNonInteractive: boolean | undefined
  let gitBranch: string | undefined
  let isDirty: boolean | undefined
  let tokenUsage: TokenSummary | undefined

  for (const line of lines) {
    let obj: any
    try {
      obj = JSON.parse(line)
    } catch {
      continue
    }

    if (obj?.type === 'session_meta') {
      const payload = obj.payload || {}
      if (!sessionId && typeof payload.id === 'string') sessionId = payload.id
      if (!cwd && typeof payload.cwd === 'string' && looksLikePath(payload.cwd)) {
        cwd = payload.cwd
      }
      if (!gitBranch && typeof payload?.git?.branch === 'string' && payload.git.branch.trim()) {
        gitBranch = payload.git.branch.trim()
      }
      if (isDirty === undefined && typeof payload?.git?.dirty === 'boolean') {
        isDirty = payload.git.dirty
      }
      if (isDirty === undefined && typeof payload?.git?.isDirty === 'boolean') {
        isDirty = payload.git.isDirty
      }
      if (payload.source === 'exec') {
        isNonInteractive = true
      }
    }

    if (!cwd) {
      const possible = obj?.payload?.cwd || obj?.cwd || obj?.context?.cwd
      if (typeof possible === 'string' && looksLikePath(possible)) {
        cwd = possible
      }
    }

    if (!title && obj?.type === 'response_item' && obj?.payload?.type === 'message' && obj?.payload?.role === 'user') {
      const text = extractTextContent(obj.payload.content)
      if (text.trim()) {
        // Try to extract user request from IDE-formatted context first
        const ideRequest = extractFromIdeContext(text)
        if (ideRequest) {
          title = extractTitleFromMessage(ideRequest, 200)
        } else if (!isSystemContext(text)) {
          title = extractTitleFromMessage(text, 200)
        }
      }
    }

    if (!summary && obj?.type === 'response_item' && obj?.payload?.type === 'message' && obj?.payload?.role === 'assistant') {
      const text = extractTextContent(obj.payload.content)
      if (text.trim()) {
        summary = text.trim().slice(0, 240)
      }
    }

    if (obj?.type === 'event_msg' && obj?.payload?.type === 'token_count') {
      const parsedToken = parseCodexTokenEnvelope(obj.payload)
      if (parsedToken.summary) tokenUsage = parsedToken.summary
    }

    if (!cwd && obj?.type === 'turn_context' && typeof obj?.payload?.cwd === 'string') {
      const ctxCwd = obj.payload.cwd
      if (looksLikePath(ctxCwd)) cwd = ctxCwd
    }
  }

  return {
    sessionId,
    cwd,
    title,
    summary,
    messageCount: lines.length,
    isNonInteractive,
    gitBranch,
    isDirty,
    tokenUsage,
  }
}

function extractSessionIdFromFilename(filePath: string): string {
  const base = path.basename(filePath, '.jsonl')
  const match = base.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/)
  return match ? match[0] : base
}

async function walkJsonlFiles(dir: string): Promise<string[]> {
  let entries: any[] = []
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walkJsonlFiles(full)))
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(full)
    }
  }
  return files
}

export const codexProvider: CodingCliProvider = {
  name: 'codex',
  displayName: 'Codex',
  homeDir: defaultCodexHome(),

  getSessionGlob() {
    return path.join(this.homeDir, 'sessions', '**', '*.jsonl')
  },

  async listSessionFiles() {
    const sessionsDir = path.join(this.homeDir, 'sessions')
    return walkJsonlFiles(sessionsDir)
  },

  parseSessionFile(content: string) {
    return parseCodexSessionContent(content)
  },

  async resolveProjectPath(_filePath: string, meta: ParsedSessionMeta): Promise<string> {
    if (!meta.cwd) return 'unknown'
    return resolveGitRepoRoot(meta.cwd)
  },

  extractSessionId(filePath: string, meta?: ParsedSessionMeta): string {
    return meta?.sessionId || extractSessionIdFromFilename(filePath)
  },

  getCommand() {
    return process.env.CODEX_CMD || 'codex'
  },

  getStreamArgs(options) {
    // CRITICAL: Codex --json flag ONLY works with `exec` mode (non-interactive).
    // For `resume`, we cannot use --json - the interactive TUI doesn't support JSON output.
    // Resume sessions must be spawned as PTY without JSON parsing.
    if (options.resumeSessionId) {
      // Return resume args WITHOUT --json - caller should use PTY mode
      const args = ['resume', options.resumeSessionId]
      if (options.model) args.push('--model', options.model)
      if (options.sandbox) args.push('--sandbox', options.sandbox)
      return args
    }

    // For new exec sessions, use --json for streaming
    const args = ['exec', '--json']
    if (options.model) args.push('--model', options.model)
    if (options.sandbox) args.push('--sandbox', options.sandbox)
    args.push(options.prompt)
    return args
  },

  getResumeArgs(sessionId: string) {
    return ['resume', sessionId]
  },

  parseEvent(line: string): NormalizedEvent[] {
    const obj = JSON.parse(line)
    const timestamp = obj?.timestamp || new Date().toISOString()
    const sessionId =
      obj?.payload?.id ||
      obj?.payload?.session_id ||
      obj?.session_id ||
      obj?.payload?.sessionId ||
      'unknown'

    const base = {
      timestamp,
      sessionId,
      provider: 'codex' as const,
    }

    if (obj?.type === 'session_meta') {
      const sessionPayload = {
        cwd: obj?.payload?.cwd,
        model: obj?.payload?.model || obj?.payload?.model_provider,
        provider: 'codex' as const,
      }
      return [
        {
          ...base,
          type: 'session.start',
          session: sessionPayload,
          sessionInfo: sessionPayload, // Legacy alias
        },
      ]
    }

    if (obj?.type === 'response_item' && obj?.payload?.type === 'message') {
      const role = obj.payload.role === 'user' ? 'user' as const : 'assistant' as const
      const content = extractTextContent(obj.payload.content).trim()
      return [
        {
          ...base,
          type: role === 'user' ? 'message.user' : 'message.assistant',
          message: { role, content },
        },
      ]
    }

    if (obj?.type === 'response_item' && obj?.payload?.type === 'function_call') {
      let args: unknown = obj.payload.arguments
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args)
        } catch {
          // keep as string
        }
      }
      const toolPayload = {
        callId: obj.payload.call_id || 'unknown',
        name: obj.payload.name || 'unknown',
        arguments: args,
      }
      return [
        {
          ...base,
          type: 'tool.call',
          tool: toolPayload,
          // Legacy alias
          toolCall: {
            id: obj.payload.call_id || 'unknown',
            name: obj.payload.name || 'unknown',
            arguments: args,
          },
        },
      ]
    }

    if (obj?.type === 'response_item' && obj?.payload?.type === 'function_call_output') {
      const toolPayload = {
        callId: obj.payload.call_id || 'unknown',
        name: '',
        output: obj.payload.output || '',
        isError: false,
      }
      return [
        {
          ...base,
          type: 'tool.result',
          tool: toolPayload,
          // Legacy alias
          toolResult: {
            id: obj.payload.call_id || 'unknown',
            output: obj.payload.output || '',
            isError: false,
          },
        },
      ]
    }

    if (obj?.type === 'event_msg' && obj?.payload?.type === 'agent_reasoning') {
      return [
        {
          ...base,
          type: 'reasoning',
          reasoning: obj.payload.text || obj.payload.message || '',
          thinking: obj.payload.text || obj.payload.message || '',
        },
      ]
    }

    if (obj?.type === 'event_msg' && obj?.payload?.type === 'agent_message') {
      const content = obj.payload.message || obj.payload.text || ''
      return [
        {
          ...base,
          type: 'message.assistant',
          message: { role: 'assistant', content },
        },
      ]
    }

    if (obj?.type === 'event_msg' && obj?.payload?.type === 'token_count') {
      const parsedToken = parseCodexTokenEnvelope(obj.payload)
      if (!parsedToken.eventTokens) {
        return []
      }
      const input = parsedToken.eventTokens.inputTokens
      const output = parsedToken.eventTokens.outputTokens
      const total = input + output + (parsedToken.eventTokens.cachedTokens || 0)
      return [
        {
          ...base,
          type: 'token.usage',
          tokens: parsedToken.eventTokens,
          tokenUsage: { input, output, total }, // Legacy alias
        },
      ]
    }

    return []
  },

  supportsLiveStreaming() {
    // IMPORTANT: Codex supports JSON streaming only in `exec` mode (one-shot non-interactive).
    // We still allow streaming sessions for new prompts, but resume requires PTY mode.
    return true
  },

  supportsSessionResume() {
    // Codex supports resume via `codex resume <sessionId>` but NOT with JSON output.
    // Streaming resume is not supported; use terminal.create with mode='codex'.
    return false
  },
}
