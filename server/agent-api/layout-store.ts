import { resolveTarget } from './target-resolver.js'

type UiSnapshot = {
  tabs: Array<{ id: string; title?: string }>
  activeTabId?: string | null
  layouts: Record<string, any>
  activePane: Record<string, string>
  paneTitles?: Record<string, Record<string, string>>
  timestamp?: number
}

type Leaf = { id: string; content?: { kind?: string; terminalId?: string } }

export class LayoutStore {
  private snapshot: UiSnapshot | null = null
  private sourceConnectionId: string | null = null

  updateFromUi(snapshot: UiSnapshot, connectionId: string) {
    this.snapshot = snapshot
    this.sourceConnectionId = connectionId
  }

  listTabs() {
    if (!this.snapshot) return []
    return this.snapshot.tabs.map((t) => ({
      id: t.id,
      title: t.title || t.id,
      activePaneId: this.snapshot?.activePane?.[t.id],
    }))
  }

  listPanes(tabId?: string) {
    if (!this.snapshot || !tabId) return []
    const root = this.snapshot.layouts?.[tabId]
    if (!root) return []
    const leaves: Leaf[] = []
    const walk = (node: any) => {
      if (node?.type === 'leaf') leaves.push(node as Leaf)
      if (node?.type === 'split') { walk(node.children[0]); walk(node.children[1]) }
    }
    walk(root)
    return leaves.map((leaf, idx) => ({
      id: leaf.id,
      index: idx,
      kind: leaf.content?.kind,
      terminalId: leaf.content?.terminalId,
    }))
  }

  resolveTarget(target: string) {
    if (!this.snapshot) return { message: 'no layout snapshot' }
    return resolveTarget(target, this.snapshot)
  }
}
