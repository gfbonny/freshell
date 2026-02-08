import path from 'path'
import os from 'os'
import fsp from 'fs/promises'

/**
 * Resolve a working directory to its git repo root, collapsing worktree paths
 * to their parent repository. Submodules are left as independent repos.
 *
 * Algorithm:
 * 1. Normalize input (expand ~, resolve relative paths)
 * 2. Walk up from cwd looking for .git entry
 * 3. If .git is a directory → regular repo root
 * 4. If .git is a file → parse gitdir: line
 *    - /worktrees/ in gitdir → read commondir to find shared .git dir
 *    - /modules/ in gitdir → submodule, keep as independent repo
 * 5. No .git found → return original cwd
 * 6. On any error → return original cwd
 */

const repoRootCache = new Map<string, string>()

export function clearRepoRootCache(): void {
  repoRootCache.clear()
}

export async function resolveGitRepoRoot(cwd: string): Promise<string> {
  if (!cwd) return cwd

  // Only process absolute paths and tilde paths. Relative paths (., ..)
  // cannot be resolved correctly because we'd resolve against the server's
  // cwd, not the original CLI session's cwd. Return them as-is.
  let normalized: string
  if (cwd.startsWith('~')) {
    normalized = path.resolve(os.homedir(), cwd.slice(cwd.startsWith('~/') ? 2 : 1))
  } else if (path.isAbsolute(cwd)) {
    normalized = path.resolve(cwd)
  } else {
    return cwd
  }

  const cached = repoRootCache.get(normalized)
  if (cached !== undefined) return cached

  try {
    const result = await walkForGitRoot(normalized)
    repoRootCache.set(normalized, result)
    return result
  } catch {
    repoRootCache.set(normalized, normalized)
    return normalized
  }
}

async function walkForGitRoot(startDir: string): Promise<string> {
  let current = startDir

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const gitPath = path.join(current, '.git')

    try {
      const stat = await fsp.lstat(gitPath)

      if (stat.isDirectory()) {
        // Regular repo root
        return current
      }

      if (stat.isFile()) {
        // .git file — could be worktree or submodule
        const content = await fsp.readFile(gitPath, 'utf-8')
        const match = content.match(/^gitdir:\s*(.+)/m)
        if (match) {
          const gitdir = path.resolve(path.dirname(gitPath), match[1].trim())
          return resolveFromGitFile(current, gitdir)
        }
        // Malformed .git file — treat this directory as the root
        return current
      }
    } catch {
      // .git doesn't exist at this level — keep walking up
    }

    const parent = path.dirname(current)
    if (parent === current) break // filesystem root
    current = parent
  }

  // No .git found anywhere
  return startDir
}

async function resolveFromGitFile(dotGitDir: string, gitdir: string): Promise<string> {
  // Submodule: gitdir contains /.git/modules/ — keep as independent repo
  // Anchored to /.git/modules/ to avoid false positives when the repo path
  // itself contains a "modules" segment (e.g. /home/user/modules/repo)
  if (gitdir.includes('/.git/modules/') || gitdir.includes('\\.git\\modules\\')) {
    return dotGitDir
  }

  // Worktree: gitdir contains /.git/worktrees/
  // Also anchored to /.git/worktrees/ for the same reason
  if (gitdir.includes('/.git/worktrees/') || gitdir.includes('\\.git\\worktrees\\')) {
    return resolveWorktreeRoot(dotGitDir, gitdir)
  }

  // Unknown layout — treat as repo root
  return dotGitDir
}

async function resolveWorktreeRoot(dotGitDir: string, gitdir: string): Promise<string> {
  // Try reading commondir first (canonical approach)
  try {
    const commondirContent = await fsp.readFile(path.join(gitdir, 'commondir'), 'utf-8')
    const commonDir = path.resolve(gitdir, commondirContent.trim())
    // commonDir is the shared .git directory — repo root is its parent
    return path.dirname(commonDir)
  } catch {
    // commondir missing — fall back to heuristic
  }

  // Heuristic: gitdir matches .../.git/worktrees/<name>
  // Walk up 3 levels: <name> → worktrees → .git → repo root
  const parts = gitdir.split(path.sep)
  const worktreesIdx = parts.lastIndexOf('worktrees')
  if (worktreesIdx >= 2) {
    const gitDirParent = parts.slice(0, worktreesIdx - 1)
    if (parts[worktreesIdx - 1] === '.git') {
      return gitDirParent.join(path.sep) || path.sep
    }
  }

  return dotGitDir
}

/**
 * Check if a "user" message is actually system context injected by coding CLIs.
 * Both Claude and Codex inject system prompts as role:"user" messages:
 * - XML-wrapped context: <environment_context>, <user_instructions>, etc.
 * - Instruction file headers: "# AGENTS.md...", "# Instructions", "# System"
 * - Bracketed agent modes: [SUGGESTION MODE: ...], [REVIEW MODE: ...]
 * - IDE context format: "# Context from my IDE setup:"
 * - Pasted log/debug output: starts with digit + comma (e.g. "0, totalJsHeapSize...")
 * - Agent boilerplate: "You are an automated..." (but NOT "You are an expert/experienced")
 * - Pasted shell output: "> command" or "$ command"
 */
export function isSystemContext(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  // XML-wrapped system context: <system_context>, <environment_context>, <INSTRUCTIONS>, etc.
  if (/^<[a-zA-Z_][\w_-]*[>\s]/.test(trimmed)) return true
  // Instruction file headers: "# AGENTS.md instructions for...", "# System", "# Instructions"
  if (/^#\s*(AGENTS|Instructions?|System)/i.test(trimmed)) return true
  // Bracketed agent mode instructions: [SUGGESTION MODE: ...], [REVIEW MODE: ...]
  if (/^\[[A-Z][A-Z_ ]*:/.test(trimmed)) return true
  // IDE context format: "# Context from my IDE setup:"
  if (/^#\s*Context from my IDE setup:/i.test(trimmed)) return true
  // Pasted log/debug output: starts with digit + comma (heap stats, etc.)
  if (/^\d+,\s/.test(trimmed)) return true
  // Agent boilerplate: "You are an automated..." but NOT "You are an expert/experienced"
  if (/^You are an automated\b/i.test(trimmed)) return true
  // Pasted shell output: "> command" or "$ command" (shell prompt prefixes)
  // Must be followed by a non-space char that looks like a command (not a quote/prose)
  if (/^[>$]\s+[a-zA-Z.\/]/.test(trimmed)) {
    // Distinguish from prose: shell commands typically start with known command patterns
    const afterPrefix = trimmed.replace(/^[>$]\s+/, '')
    // If it looks like a filesystem path or common CLI command, it's shell output
    if (/^[a-z]/.test(afterPrefix) || afterPrefix.startsWith('./') || afterPrefix.startsWith('/')) {
      return true
    }
  }
  return false
}

/**
 * Extract the actual user request from IDE-formatted context messages.
 * IDE context messages follow this format:
 *   # Context from my IDE setup:
 *   ## My codebase
 *   ...
 *   ## My request for Codex:
 *   <actual user request>
 *
 * Returns the first non-empty line after "## My request for Codex:" or undefined.
 */
export function extractFromIdeContext(text: string): string | undefined {
  const lines = text.split('\n')
  let inRequestSection = false

  for (const line of lines) {
    if (/^##\s*My request for Codex:/i.test(line)) {
      inRequestSection = true
      continue
    }
    if (inRequestSection) {
      const trimmed = line.trim()
      if (trimmed) return trimmed
    }
  }

  return undefined
}

export function looksLikePath(s: string): boolean {
  // Reject URLs and protocol-based strings (contain :// before any path separator)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) {
    return false
  }

  // Accept special directory references
  if (s === '~' || s === '.' || s === '..') {
    return true
  }

  // Accept paths with separators or Windows drive letters
  return s.includes('/') || s.includes('\\') || /^[A-Za-z]:\\/.test(s)
}
