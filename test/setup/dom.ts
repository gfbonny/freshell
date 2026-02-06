import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'
import { enableMapSet } from 'immer'

enableMapSet()

const clipboardMock = {
  writeText: vi.fn().mockResolvedValue(undefined),
  readText: vi.fn().mockResolvedValue(''),
}

Object.defineProperty(globalThis.navigator, 'clipboard', {
  value: clipboardMock,
  configurable: true,
})
