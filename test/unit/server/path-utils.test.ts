import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  convertWindowsPathToWslPath,
  detectUserPathFlavor,
  normalizeUserPath,
  toFilesystemPath,
  toFilesystemPathSync,
} from '../../../server/path-utils'

describe('server/path-utils cross-platform path handling', () => {
  const originalPlatform = process.platform
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      writable: true,
      configurable: true,
    })
    process.env = { ...originalEnv }
  })

  it('detects Windows paths by drive letter and UNC prefix', () => {
    expect(detectUserPathFlavor(String.raw`D:\users\words with spaces`)).toBe('windows')
    expect(detectUserPathFlavor(String.raw`\\server\share`)).toBe('windows')
  })

  it('normalizes wrapped Windows paths and preserves Windows flavor', () => {
    const normalized = normalizeUserPath(String.raw`"D:\users\words with spaces"`)
    expect(normalized.flavor).toBe('windows')
    expect(normalized.normalizedPath).toBe(String.raw`D:\users\words with spaces`)
  })

  it('converts Windows drive paths to WSL mount paths with custom mount roots', () => {
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      writable: true,
      configurable: true,
    })
    process.env.WSL_DISTRO_NAME = 'Ubuntu'
    process.env.WSL_WINDOWS_SYS32 = '/custom-mount/c/X/System32'

    expect(convertWindowsPathToWslPath(String.raw`D:\users\words with spaces`)).toBe('/custom-mount/d/users/words with spaces')
  })

  it('maps Windows flavor paths to host filesystem paths when running in WSL', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      writable: true,
      configurable: true,
    })
    process.env.WSL_DISTRO_NAME = 'Ubuntu'
    process.env.WSL_WINDOWS_SYS32 = '/custom-mount/c/Windows/System32'

    const fsPath = await toFilesystemPath(String.raw`D:\projects\app`, 'windows')
    expect(fsPath).toBe('/custom-mount/d/projects/app')
  })

  it('maps /mnt drive paths to Windows paths when running on Windows', () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      writable: true,
      configurable: true,
    })

    const fsPath = toFilesystemPathSync('/mnt/d/projects/app', 'posix')
    expect(fsPath).toBe(String.raw`D:\projects\app`)
  })
})
