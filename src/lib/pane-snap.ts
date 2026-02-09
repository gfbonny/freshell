import type { PaneNode } from '@/store/paneTypes'

/**
 * Compute the snapped position for a 1D divider drag.
 *
 * Algorithm:
 * 1. If shiftHeld or snapThreshold === 0, return currentPercent (bypass)
 * 2. Collect all snap targets: [originalPercent, ...collinearPositions]
 * 3. Find the closest target within snapThreshold
 * 4. If found, return that target; otherwise return currentPercent
 *
 * @param currentPercent - The divider's current position in %
 * @param originalPercent - Where the divider started before this drag
 * @param collinearPositions - Positions of other bars of the same orientation (in %)
 * @param snapThreshold - Snap distance in % of smallest container dimension
 * @param shiftHeld - If true, bypass all snapping
 * @returns The snapped position (same as currentPercent if no snap)
 */
export function snap1D(
  currentPercent: number,
  originalPercent: number,
  collinearPositions: number[],
  snapThreshold: number,
  shiftHeld: boolean,
): number {
  if (shiftHeld || snapThreshold === 0) {
    return currentPercent
  }

  const targets = [originalPercent, ...collinearPositions]

  let bestTarget: number | null = null
  let bestDistance = Infinity

  for (const target of targets) {
    const distance = Math.abs(currentPercent - target)
    if (distance <= snapThreshold && distance < bestDistance) {
      bestDistance = distance
      bestTarget = target
    }
  }

  return bestTarget !== null ? bestTarget : currentPercent
}

/**
 * Collect sizes[0] from all splits of the given orientation in the pane tree,
 * excluding the split being dragged. These serve as snap targets for 1D snapping.
 *
 * This traverses the entire tree and collects sizes[0] from every split node
 * whose direction matches the given orientation, except for the excluded split.
 * This means a horizontal bar at 60% will snap to ANY other horizontal bar
 * also near 60%, regardless of nesting depth - which is desirable behavior
 * for aligning bars across the layout.
 *
 * @param root - The root pane node of the layout tree
 * @param orientation - The orientation to match ('horizontal' or 'vertical')
 * @param excludeSplitId - The id of the split being dragged (to exclude from results)
 * @returns Array of sizes[0] values from matching splits
 */
export function collectSameOrientationSizes(
  root: PaneNode,
  orientation: 'horizontal' | 'vertical',
  excludeSplitId: string,
): number[] {
  const results: number[] = []
  collectRecursive(root, orientation, excludeSplitId, results)
  return results
}

function collectRecursive(
  node: PaneNode,
  orientation: 'horizontal' | 'vertical',
  excludeSplitId: string,
  results: number[],
): void {
  if (node.type === 'leaf') return

  if (node.direction === orientation && node.id !== excludeSplitId) {
    results.push(node.sizes[0])
  }

  collectRecursive(node.children[0], orientation, excludeSplitId, results)
  collectRecursive(node.children[1], orientation, excludeSplitId, results)
}
