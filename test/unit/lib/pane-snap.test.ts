import { describe, it, expect } from 'vitest'
import { snap1D, collectSameOrientationSizes } from '../../../src/lib/pane-snap'
import type { PaneNode } from '../../../src/store/paneTypes'

// Helper to create a leaf node
function leaf(id: string): PaneNode {
  return {
    type: 'leaf',
    id,
    content: { kind: 'picker' },
  }
}

describe('snap1D', () => {
  it('returns currentPercent when no snap targets are nearby', () => {
    expect(snap1D(65, 50, [], 4, false)).toBe(65)
  })

  it('snaps to original position when within threshold', () => {
    expect(snap1D(52, 50, [], 4, false)).toBe(50)
  })

  it('does not snap to original when outside threshold', () => {
    expect(snap1D(55, 50, [], 4, false)).toBe(55)
  })

  it('snaps to collinear seam when within threshold', () => {
    expect(snap1D(68, 50, [70], 4, false)).toBe(70)
  })

  it('does not snap to collinear seam when outside threshold', () => {
    expect(snap1D(60, 50, [70], 4, false)).toBe(60)
  })

  it('prefers nearest target when both original and collinear are in range', () => {
    // original=50, collinear=52, current=51 → original is 1 away, collinear is 1 away
    // tie goes to... let's test with unequal distances
    expect(snap1D(51, 50, [53], 4, false)).toBe(50) // original is 1 away, collinear is 2 away
  })

  it('prefers collinear when it is closer than original', () => {
    expect(snap1D(52, 50, [53], 4, false)).toBe(53) // original is 2 away, collinear is 1 away
  })

  it('bypasses all snapping when shift is held', () => {
    expect(snap1D(52, 50, [53], 4, true)).toBe(52)
  })

  it('returns currentPercent when threshold is 0 (snapping disabled)', () => {
    expect(snap1D(52, 50, [53], 0, false)).toBe(52)
  })

  it('snaps to nearest target when multiple collinear positions are in range', () => {
    // current=46, original=50 (4 away = at threshold), collinear=45 (1 away)
    expect(snap1D(46, 50, [45], 4, false)).toBe(45) // collinear is closer
  })

  it('handles exact threshold boundary (snaps at exactly threshold distance)', () => {
    // current=54, original=50, threshold=4 → distance is exactly 4
    expect(snap1D(54, 50, [], 4, false)).toBe(50)
  })

  it('does not snap when distance is just beyond threshold', () => {
    // current=54.1, original=50, threshold=4 → distance is 4.1
    expect(snap1D(54.1, 50, [], 4, false)).toBe(54.1)
  })

  it('works with multiple collinear targets, picking the closest', () => {
    // current=62, targets at 60, 65, 70; threshold=4
    expect(snap1D(62, 50, [60, 65, 70], 4, false)).toBe(60) // 60 is 2 away, 65 is 3 away
  })
})

describe('collectSameOrientationSizes', () => {
  it('returns empty array for a leaf node', () => {
    expect(collectSameOrientationSizes(leaf('a'), 'horizontal', 'x')).toEqual([])
  })

  it('returns empty when the only split of matching orientation is excluded', () => {
    const root: PaneNode = {
      type: 'split',
      id: 's1',
      direction: 'horizontal',
      sizes: [60, 40],
      children: [leaf('a'), leaf('b')],
    }
    expect(collectSameOrientationSizes(root, 'horizontal', 's1')).toEqual([])
  })

  it('collects sizes from splits of the same orientation, excluding the dragged one', () => {
    // V-split(H-split(A, B), H-split(C, D))
    const topH: PaneNode = {
      type: 'split',
      id: 'top',
      direction: 'horizontal',
      sizes: [60, 40],
      children: [leaf('a'), leaf('b')],
    }
    const botH: PaneNode = {
      type: 'split',
      id: 'bot',
      direction: 'horizontal',
      sizes: [30, 70],
      children: [leaf('c'), leaf('d')],
    }
    const root: PaneNode = {
      type: 'split',
      id: 'root',
      direction: 'vertical',
      sizes: [50, 50],
      children: [topH, botH],
    }
    // Dragging 'top' bar: should see bot's size (30)
    expect(collectSameOrientationSizes(root, 'horizontal', 'top')).toEqual([30])
  })

  it('excludes splits of different orientation', () => {
    const root: PaneNode = {
      type: 'split',
      id: 's1',
      direction: 'vertical',
      sizes: [50, 50],
      children: [leaf('a'), leaf('b')],
    }
    expect(collectSameOrientationSizes(root, 'horizontal', 'x')).toEqual([])
  })

  it('collects from deeply nested splits of matching orientation', () => {
    // H-split(V-split(H-split(A,B), C), D)
    const innerH: PaneNode = {
      type: 'split',
      id: 'inner-h',
      direction: 'horizontal',
      sizes: [40, 60],
      children: [leaf('a'), leaf('b')],
    }
    const innerV: PaneNode = {
      type: 'split',
      id: 'inner-v',
      direction: 'vertical',
      sizes: [50, 50],
      children: [innerH, leaf('c')],
    }
    const root: PaneNode = {
      type: 'split',
      id: 'root-h',
      direction: 'horizontal',
      sizes: [70, 30],
      children: [innerV, leaf('d')],
    }
    // Dragging root-h: should see inner-h's size (40)
    expect(collectSameOrientationSizes(root, 'horizontal', 'root-h')).toEqual([40])
    // Dragging inner-h: should see root-h's size (70)
    expect(collectSameOrientationSizes(root, 'horizontal', 'inner-h')).toEqual([70])
  })

  it('collects multiple sizes from several same-orientation splits', () => {
    // V(H(A,B), V(H(C,D), H(E,F)))
    const h1: PaneNode = {
      type: 'split',
      id: 'h1',
      direction: 'horizontal',
      sizes: [30, 70],
      children: [leaf('a'), leaf('b')],
    }
    const h2: PaneNode = {
      type: 'split',
      id: 'h2',
      direction: 'horizontal',
      sizes: [60, 40],
      children: [leaf('c'), leaf('d')],
    }
    const h3: PaneNode = {
      type: 'split',
      id: 'h3',
      direction: 'horizontal',
      sizes: [50, 50],
      children: [leaf('e'), leaf('f')],
    }
    const innerV: PaneNode = {
      type: 'split',
      id: 'inner-v',
      direction: 'vertical',
      sizes: [50, 50],
      children: [h2, h3],
    }
    const root: PaneNode = {
      type: 'split',
      id: 'root-v',
      direction: 'vertical',
      sizes: [50, 50],
      children: [h1, innerV],
    }
    // Dragging h1: should see h2 (60) and h3 (50)
    const result = collectSameOrientationSizes(root, 'horizontal', 'h1')
    expect(result).toEqual(expect.arrayContaining([60, 50]))
    expect(result).toHaveLength(2)
  })
})
