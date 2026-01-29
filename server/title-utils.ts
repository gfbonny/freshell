/**
 * Extracts a display title from user message content.
 * Used for auto-naming tabs and sessions based on the first user prompt.
 * Returns cleaned, whitespace-normalized text truncated to maxLen.
 */
export function extractTitleFromMessage(content: string, maxLen = 50): string {
  // Clean up: collapse whitespace, trim
  const cleaned = content.trim().replace(/\s+/g, ' ')

  if (cleaned.length <= maxLen) {
    return cleaned
  }

  // Truncate to maxLen (UI can add ellipsis via CSS if needed)
  return cleaned.slice(0, maxLen)
}

/**
 * Extracts title from a JSONL line object.
 * Matches the logic in parseSessionContent but for a single parsed object.
 */
export function extractTitleFromJsonlObject(obj: any, maxLen = 50): string | undefined {
  // Check explicit title fields first
  const explicitTitle = obj?.title || obj?.sessionTitle
  if (typeof explicitTitle === 'string' && explicitTitle.trim()) {
    return extractTitleFromMessage(explicitTitle, maxLen)
  }

  // Check for user message content
  const userContent =
    (obj?.role === 'user' && typeof obj?.content === 'string' ? obj.content : undefined) ||
    (obj?.message?.role === 'user' && typeof obj?.message?.content === 'string' ? obj.message.content : undefined)

  if (typeof userContent === 'string' && userContent.trim()) {
    return extractTitleFromMessage(userContent, maxLen)
  }

  return undefined
}
