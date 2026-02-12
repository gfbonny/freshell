import { nanoid } from 'nanoid'
import { spawn, type ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { WebSocketServer, WebSocket } from 'ws'
import { logger } from './logger.js'
import {
  CliMessageSchema,
  type CliMessage,
  type SdkSessionState,
  type ContentBlock,
  type SdkServerMessage,
} from './sdk-bridge-types.js'

const log = logger.child({ component: 'sdk-bridge' })

const CLAUDE_CMD = process.env.CLAUDE_CMD || 'claude'
const GRACEFUL_KILL_TIMEOUT_MS = 5_000

interface SdkBridgeOptions {
  port?: number
}

interface SessionProcess {
  proc: ChildProcess
  cliSocket?: WebSocket
  browserListeners: Set<(msg: SdkServerMessage) => void>
  pendingMessages: string[]
  killTimer?: ReturnType<typeof setTimeout>
}

export class SdkBridge extends EventEmitter {
  private wss: WebSocketServer
  private sessions = new Map<string, SdkSessionState>()
  private processes = new Map<string, SessionProcess>()
  private port: number

  constructor(options: SdkBridgeOptions = {}) {
    super()
    this.port = options.port ?? 0
    this.wss = new WebSocketServer({ host: '127.0.0.1', port: this.port, path: '/ws/sdk' })
    this.wss.on('listening', () => {
      const addr = this.wss.address()
      this.port = typeof addr === 'object' ? addr.port : this.port
      log.info({ port: this.port }, 'SDK bridge WebSocket server listening')
    })
    this.wss.on('connection', (ws, req) => this.onCliConnection(ws, req))
  }

  getPort(): number {
    return this.port
  }

  createSession(options: {
    cwd?: string
    resumeSessionId?: string
    model?: string
    permissionMode?: string
  }): SdkSessionState {
    const sessionId = nanoid()
    const state: SdkSessionState = {
      sessionId,
      cwd: options.cwd,
      model: options.model,
      permissionMode: options.permissionMode,
      status: 'starting',
      createdAt: Date.now(),
      messages: [],
      pendingPermissions: new Map(),
      costUsd: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
    }
    this.sessions.set(sessionId, state)

    const proc = this.spawnCli(sessionId, options)
    this.processes.set(sessionId, {
      proc,
      browserListeners: new Set(),
      pendingMessages: [],
    })

    return state
  }

  getSession(sessionId: string): SdkSessionState | undefined {
    return this.sessions.get(sessionId)
  }

  listSessions(): SdkSessionState[] {
    return Array.from(this.sessions.values())
  }

  killSession(sessionId: string): boolean {
    const sp = this.processes.get(sessionId)
    if (!sp) return false

    const state = this.sessions.get(sessionId)
    if (state) state.status = 'exited'

    try {
      sp.proc.kill('SIGTERM')
      sp.killTimer = setTimeout(() => {
        try { sp.proc.kill('SIGKILL') } catch { /* ignore */ }
      }, GRACEFUL_KILL_TIMEOUT_MS)
    } catch { /* ignore */ }

    sp.cliSocket?.close()
    return true
  }

  subscribe(sessionId: string, listener: (msg: SdkServerMessage) => void): (() => void) | null {
    const sp = this.processes.get(sessionId)
    if (!sp) return null
    sp.browserListeners.add(listener)
    return () => { sp.browserListeners.delete(listener) }
  }

  sendUserMessage(sessionId: string, text: string, images?: Array<{ mediaType: string; data: string }>): boolean {
    const content: Array<Record<string, unknown>> = [{ type: 'text', text }]
    if (images?.length) {
      for (const img of images) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: img.mediaType, data: img.data },
        })
      }
    }

    const ndjson = JSON.stringify({ type: 'user', content }) + '\n'

    const state = this.sessions.get(sessionId)
    if (state) {
      state.messages.push({
        role: 'user',
        content: [{ type: 'text', text } as ContentBlock],
        timestamp: new Date().toISOString(),
      })
    }

    return this.sendToCli(sessionId, ndjson)
  }

  respondPermission(
    sessionId: string,
    requestId: string,
    behavior: 'allow' | 'deny',
    updatedInput?: Record<string, unknown>,
    message?: string,
  ): boolean {
    const state = this.sessions.get(sessionId)
    state?.pendingPermissions.delete(requestId)

    const response: Record<string, unknown> = {
      type: 'control_response',
      id: requestId,
      result: { behavior },
    }
    if (updatedInput) (response.result as Record<string, unknown>).updatedInput = updatedInput
    if (message) (response.result as Record<string, unknown>).message = message

    return this.sendToCli(sessionId, JSON.stringify(response) + '\n')
  }

  interrupt(sessionId: string): boolean {
    const ndjson = JSON.stringify({ type: 'control_request', subtype: 'interrupt' }) + '\n'
    return this.sendToCli(sessionId, ndjson)
  }

  close(): void {
    for (const [sessionId] of this.processes) {
      this.killSession(sessionId)
    }
    this.wss.close()
  }

  // ── Private ──

  private spawnCli(sessionId: string, options: {
    cwd?: string
    resumeSessionId?: string
    model?: string
    permissionMode?: string
  }): ChildProcess {
    const sdkUrl = `ws://127.0.0.1:${this.port}/ws/sdk?sessionId=${sessionId}`

    const args = [
      '--sdk-url', sdkUrl,
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--verbose',
      '-p', '',
    ]

    if (options.model) args.push('--model', options.model)
    if (options.permissionMode) args.push('--permission-mode', options.permissionMode)
    if (options.resumeSessionId) args.push('--resume', options.resumeSessionId)

    log.info({ sessionId, cmd: CLAUDE_CMD, args, cwd: options.cwd }, 'Spawning Claude Code in SDK mode')

    const proc = spawn(CLAUDE_CMD, args, {
      cwd: options.cwd || undefined,
      env: { ...process.env, CLAUDECODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    proc.on('error', (err) => {
      log.error({ sessionId, err }, 'Failed to spawn Claude Code CLI')
      const state = this.sessions.get(sessionId)
      if (state) state.status = 'exited'
      this.broadcastToSession(sessionId, {
        type: 'sdk.error' as const,
        sessionId,
        message: `Failed to spawn CLI: ${err.message}`,
      })
      this.broadcastToSession(sessionId, { type: 'sdk.exit', sessionId, exitCode: undefined })
      this.processes.delete(sessionId)
      this.sessions.delete(sessionId)
    })

    proc.stdout?.on('data', (data: Buffer) => {
      log.debug({ sessionId, stdout: data.toString().slice(0, 200) }, 'CLI stdout')
    })

    proc.stderr?.on('data', (data: Buffer) => {
      log.debug({ sessionId, stderr: data.toString().slice(0, 200) }, 'CLI stderr')
    })

    proc.on('exit', (code) => {
      log.info({ sessionId, exitCode: code }, 'Claude Code CLI exited')
      const state = this.sessions.get(sessionId)
      if (state) state.status = 'exited'
      // Clear any pending SIGKILL timer
      const sp = this.processes.get(sessionId)
      if (sp?.killTimer) clearTimeout(sp.killTimer)
      this.broadcastToSession(sessionId, { type: 'sdk.exit', sessionId, exitCode: code ?? undefined })
      // Clean up Maps to prevent memory leaks
      this.processes.delete(sessionId)
      this.sessions.delete(sessionId)
    })

    return proc
  }

  private onCliConnection(ws: WebSocket, req: import('http').IncomingMessage): void {
    const url = new URL(req.url || '', `http://127.0.0.1:${this.port}`)
    const sessionId = url.searchParams.get('sessionId')

    if (!sessionId || !this.sessions.has(sessionId)) {
      log.warn({ sessionId }, 'CLI connected with unknown sessionId')
      ws.close(4001, 'Unknown session')
      return
    }

    log.info({ sessionId }, 'Claude Code CLI connected to SDK bridge')
    const sp = this.processes.get(sessionId)
    if (sp) {
      sp.cliSocket = ws
      for (const msg of sp.pendingMessages) {
        ws.send(msg)
      }
      sp.pendingMessages = []
    }

    let buffer = ''
    ws.on('message', (data) => {
      buffer += data.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line)
          this.handleCliMessage(sessionId, parsed)
        } catch (err) {
          log.debug({ sessionId, line: line.slice(0, 100) }, 'Failed to parse CLI NDJSON line')
        }
      }
    })

    ws.on('close', () => {
      log.info({ sessionId }, 'CLI WebSocket disconnected')
      if (sp) sp.cliSocket = undefined
    })
  }

  private handleCliMessage(sessionId: string, raw: unknown): void {
    const parsed = CliMessageSchema.safeParse(raw)
    if (!parsed.success) {
      log.debug({ sessionId, error: parsed.error.message }, 'Unrecognized CLI message')
      return
    }

    const msg = parsed.data
    const state = this.sessions.get(sessionId)
    if (!state) return

    switch (msg.type) {
      case 'system': {
        if (msg.subtype === 'init') {
          state.cliSessionId = msg.session_id
          state.model = msg.model || state.model
          state.tools = msg.tools as Array<{ name: string }> | undefined
          state.cwd = msg.cwd || state.cwd
          state.status = 'connected'
          this.broadcastToSession(sessionId, {
            type: 'sdk.session.init',
            sessionId,
            cliSessionId: state.cliSessionId,
            model: state.model,
            cwd: state.cwd,
            tools: state.tools,
          })
        }
        break
      }

      case 'assistant': {
        const content = msg.message.content as ContentBlock[]
        state.messages.push({
          role: 'assistant',
          content,
          timestamp: new Date().toISOString(),
        })
        this.broadcastToSession(sessionId, {
          type: 'sdk.assistant',
          sessionId,
          content,
          model: msg.message.model,
          usage: msg.message.usage,
        })
        state.status = 'running'
        break
      }

      case 'result': {
        if (msg.cost_usd != null) state.costUsd += msg.cost_usd
        if (msg.usage) {
          state.totalInputTokens += msg.usage.input_tokens
          state.totalOutputTokens += msg.usage.output_tokens
        }
        state.status = 'idle'
        this.broadcastToSession(sessionId, {
          type: 'sdk.result',
          sessionId,
          result: msg.result,
          durationMs: msg.duration_ms,
          costUsd: msg.cost_usd,
          usage: msg.usage,
        })
        break
      }

      case 'stream_event': {
        this.broadcastToSession(sessionId, {
          type: 'sdk.stream',
          sessionId,
          event: msg.event,
        })
        break
      }

      case 'control_request': {
        state.pendingPermissions.set(msg.id, {
          subtype: msg.subtype,
          tool: msg.tool as { name: string; input?: Record<string, unknown> } | undefined,
        })
        this.broadcastToSession(sessionId, {
          type: 'sdk.permission.request',
          sessionId,
          requestId: msg.id,
          subtype: msg.subtype,
          tool: msg.tool as { name: string; input?: Record<string, unknown> } | undefined,
        })
        break
      }

      case 'keep_alive':
        break

      default:
        log.debug({ sessionId, type: (msg as CliMessage).type }, 'Unhandled CLI message type')
    }
  }

  private sendToCli(sessionId: string, ndjson: string): boolean {
    const sp = this.processes.get(sessionId)
    if (!sp) return false

    if (sp.cliSocket?.readyState === WebSocket.OPEN) {
      sp.cliSocket.send(ndjson)
      return true
    }

    sp.pendingMessages.push(ndjson)
    return true
  }

  private broadcastToSession(sessionId: string, msg: SdkServerMessage): void {
    const sp = this.processes.get(sessionId)
    if (!sp) return
    for (const listener of sp.browserListeners) {
      try {
        listener(msg)
      } catch (err) {
        log.warn({ err, sessionId }, 'Browser listener error')
      }
    }
    this.emit('message', sessionId, msg)
  }
}
