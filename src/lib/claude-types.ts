// src/lib/claude-types.ts
// Mirror server types for client use

export type ClaudeEventType = 'system' | 'assistant' | 'user' | 'result'

export interface TextContent {
  type: 'text'
  text: string
}

export interface ToolUseContent {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResultContent {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

export type ContentBlock = TextContent | ToolUseContent | ToolResultContent

export interface ClaudeMessage {
  id?: string
  role: 'assistant' | 'user'
  content: ContentBlock[]
  model?: string
  usage?: {
    input_tokens: number
    output_tokens: number
  }
}

export interface SystemInitEvent {
  type: 'system'
  subtype: 'init'
  session_id: string
  cwd: string
  model: string
  tools: string[]
  claude_code_version: string
}

export interface MessageEvent {
  type: 'assistant' | 'user'
  message: ClaudeMessage
  session_id: string
  uuid: string
  tool_use_result?: {
    stdout?: string
    stderr?: string
    isImage?: boolean
  }
}

export interface ResultEvent {
  type: 'result'
  subtype: 'success' | 'error'
  is_error: boolean
  duration_ms: number
  total_cost_usd?: number
  session_id: string
}

export type ClaudeEvent =
  | SystemInitEvent
  | MessageEvent
  | ResultEvent
  | { type: 'system'; subtype: string; [key: string]: unknown }

// Type guards
export function isTextContent(block: ContentBlock): block is TextContent {
  return block.type === 'text'
}

export function isToolUseContent(block: ContentBlock): block is ToolUseContent {
  return block.type === 'tool_use'
}

export function isToolResultContent(block: ContentBlock): block is ToolResultContent {
  return block.type === 'tool_result'
}

export function isMessageEvent(event: ClaudeEvent): event is MessageEvent {
  return event.type === 'assistant' || event.type === 'user'
}

export function isResultEvent(event: ClaudeEvent): event is ResultEvent {
  return event.type === 'result'
}

// WebSocket message types
export interface ClaudeWsEvent {
  type: 'claude.event'
  sessionId: string
  event: ClaudeEvent
}

export interface ClaudeWsCreated {
  type: 'claude.created'
  requestId: string
  sessionId: string
}

export interface ClaudeWsExit {
  type: 'claude.exit'
  sessionId: string
  exitCode: number
}

export type ClaudeWsMessage = ClaudeWsEvent | ClaudeWsCreated | ClaudeWsExit
