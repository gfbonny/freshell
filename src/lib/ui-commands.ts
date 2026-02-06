import { addTab, setActiveTab, removeTab, updateTab } from '@/store/tabsSlice'
import { initLayout, splitPane, closePane, setActivePane, updatePaneContent, resizePanes, swapPanes } from '@/store/panesSlice'

export function handleUiCommand(msg: any, dispatch: (action: any) => void) {
  if (msg?.type !== 'ui.command') return
  switch (msg.command) {
    case 'tab.create':
      dispatch(addTab({
        id: msg.payload.id,
        title: msg.payload.title,
        mode: msg.payload.mode,
        shell: msg.payload.shell,
        terminalId: msg.payload.terminalId,
        initialCwd: msg.payload.initialCwd,
        resumeSessionId: msg.payload.resumeSessionId,
        status: msg.payload.status,
      }))
      if (msg.payload.paneId && msg.payload.paneContent) {
        return dispatch(initLayout({ tabId: msg.payload.id, paneId: msg.payload.paneId, content: msg.payload.paneContent }))
      }
      return
    case 'tab.select':
      return dispatch(setActiveTab(msg.payload.id))
    case 'tab.rename':
      return dispatch(updateTab({ id: msg.payload.id, updates: { title: msg.payload.title } }))
    case 'tab.close':
      return dispatch(removeTab(msg.payload.id))
    case 'pane.split':
      return dispatch(splitPane({
        tabId: msg.payload.tabId,
        paneId: msg.payload.paneId,
        direction: msg.payload.direction,
        newContent: msg.payload.newContent,
        newPaneId: msg.payload.newPaneId,
      }))
    case 'pane.close':
      return dispatch(closePane({ tabId: msg.payload.tabId, paneId: msg.payload.paneId }))
    case 'pane.select':
      return dispatch(setActivePane({ tabId: msg.payload.tabId, paneId: msg.payload.paneId }))
    case 'pane.attach':
      return dispatch(updatePaneContent({ tabId: msg.payload.tabId, paneId: msg.payload.paneId, content: msg.payload.content }))
    case 'pane.resize':
      return dispatch(resizePanes({ tabId: msg.payload.tabId, splitId: msg.payload.splitId, sizes: msg.payload.sizes }))
    case 'pane.swap':
      return dispatch(swapPanes({ tabId: msg.payload.tabId, paneId: msg.payload.paneId, otherId: msg.payload.otherId }))
  }
}
