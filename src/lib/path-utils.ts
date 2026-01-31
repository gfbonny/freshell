export function isAbsolutePath(value: string): boolean {
  if (!value) return false
  if (value.startsWith('/') || value.startsWith('\\') || value.startsWith('~')) return true
  if (/^[a-zA-Z]:[\\/]/.test(value)) return true
  if (value.startsWith('\\\\')) return true
  return false
}

export function joinPath(root: string, relativePath: string): string {
  const separator = root.includes('\\') ? '\\' : '/'
  const trimmedRoot = root.endsWith('/') || root.endsWith('\\') ? root.slice(0, -1) : root
  const trimmedRelative =
    relativePath.startsWith('/') || relativePath.startsWith('\\')
      ? relativePath.slice(1)
      : relativePath
  return `${trimmedRoot}${separator}${trimmedRelative}`
}
