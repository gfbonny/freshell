// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { IDisposable } from '@xterm/xterm'
import { createTerminalRuntime } from '@/components/terminal/terminal-runtime'

const fitSpy = vi.fn()
const findNextSpy = vi.fn()
const findPreviousSpy = vi.fn()
const webglDisposeSpy = vi.fn()

let contextLossHandler: (() => void) | null = null
let throwWebglLoad = false

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = fitSpy
  },
}))

vi.mock('@xterm/addon-search', () => ({
  SearchAddon: class {
    findNext = findNextSpy
    findPrevious = findPreviousSpy
  },
}))

vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: class {
    dispose = webglDisposeSpy

    onContextLoss(handler: () => void): IDisposable {
      contextLossHandler = handler
      return { dispose: vi.fn() }
    }
  },
}))

describe('terminal runtime', () => {
  beforeEach(() => {
    contextLossHandler = null
    throwWebglLoad = false
    fitSpy.mockClear()
    findNextSpy.mockClear()
    findPreviousSpy.mockClear()
    webglDisposeSpy.mockClear()
  })

  it('loads fit and search addons', () => {
    const terminal = {
      loadAddon: vi.fn((addon: unknown) => {
        if (throwWebglLoad && typeof addon === 'object' && addon && 'onContextLoss' in addon) {
          throw new Error('webgl failure')
        }
      }),
    }

    const runtime = createTerminalRuntime({ terminal: terminal as any, enableWebgl: false })
    runtime.attachAddons()

    expect(terminal.loadAddon).toHaveBeenCalledTimes(2)
  })

  it('starts with webgl inactive and enables it asynchronously', async () => {
    const terminal = {
      loadAddon: vi.fn(),
    }

    const runtime = createTerminalRuntime({ terminal: terminal as any, enableWebgl: true })
    runtime.attachAddons()

    expect(runtime.webglActive()).toBe(false)
    await vi.waitFor(() => {
      expect(runtime.webglActive()).toBe(true)
    })
  })

  it('attempts webgl and continues when addon load throws', () => {
    throwWebglLoad = true
    const terminal = {
      loadAddon: vi.fn((addon: unknown) => {
        if (typeof addon === 'object' && addon && 'onContextLoss' in addon) {
          throw new Error('webgl failure')
        }
      }),
    }

    const runtime = createTerminalRuntime({ terminal: terminal as any, enableWebgl: true })
    expect(() => runtime.attachAddons()).not.toThrow()
    expect(runtime.webglActive()).toBe(false)
    throwWebglLoad = false
  })

  it('marks runtime as non-webgl on context loss and stays usable', async () => {
    const terminal = {
      loadAddon: vi.fn(),
    }

    const runtime = createTerminalRuntime({ terminal: terminal as any, enableWebgl: true })
    runtime.attachAddons()

    await vi.waitFor(() => {
      expect(runtime.webglActive()).toBe(true)
    })
    expect(contextLossHandler).not.toBeNull()
    contextLossHandler?.()
    expect(runtime.webglActive()).toBe(false)

    runtime.fit()
    expect(fitSpy).toHaveBeenCalled()
  })
})
