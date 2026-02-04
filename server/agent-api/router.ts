import { Router } from 'express'
import { ok, approx, fail } from './response.js'

export function createAgentApiRouter({ layoutStore, registry, wsHandler }: { layoutStore: any; registry: any; wsHandler?: any }) {
  const router = Router()

  router.post('/tabs', (req, res) => {
    const { name, mode, shell, cwd, browser, editor } = req.body || {}
    const note = browser || editor ? 'browser/editor requested; created terminal tab' : 'tab created'

    try {
      const { tabId, paneId } = layoutStore.createTab({ title: name })
      const terminal = registry.create({
        mode: mode || 'shell',
        shell,
        cwd,
        envContext: { tabId, paneId },
      })

      layoutStore.attachPaneContent(tabId, paneId, { kind: 'terminal', terminalId: terminal.terminalId })

      wsHandler?.broadcastUiCommand({
        command: 'tab.create',
        payload: { id: tabId, title: name, mode: mode || 'shell', shell, terminalId: terminal.terminalId, initialCwd: cwd },
      })

      const responder = browser || editor ? approx : ok
      res.json(responder({ tabId, paneId, terminalId: terminal.terminalId }, note))
    } catch (err: any) {
      res.status(500).json(fail(err?.message || 'Failed to create tab'))
    }
  })

  router.post('/tabs/:id/select', (req, res) => {
    const result = layoutStore.selectTab(req.params.id)
    wsHandler?.broadcastUiCommand({ command: 'tab.select', payload: { id: req.params.id } })
    res.json(ok(result, result.message || 'tab selected'))
  })

  router.patch('/tabs/:id', (req, res) => {
    const result = layoutStore.renameTab(req.params.id, req.body?.name)
    wsHandler?.broadcastUiCommand({ command: 'tab.rename', payload: { id: req.params.id, title: req.body?.name } })
    res.json(ok(result, result.message || 'tab renamed'))
  })

  router.delete('/tabs/:id', (req, res) => {
    const result = layoutStore.closeTab(req.params.id)
    wsHandler?.broadcastUiCommand({ command: 'tab.close', payload: { id: req.params.id } })
    res.json(ok(result, result.message || 'tab closed'))
  })

  router.get('/tabs/has', (req, res) => {
    const target = (req.query.target as string | undefined) || ''
    const exists = target ? layoutStore.hasTab?.(target) : false
    res.json(ok({ exists }))
  })

  router.post('/tabs/next', (_req, res) => {
    const result = layoutStore.selectNextTab?.()
    if (result?.tabId) {
      wsHandler?.broadcastUiCommand({ command: 'tab.select', payload: { id: result.tabId } })
    }
    res.json(ok(result, result?.message || 'tab selected'))
  })

  router.post('/tabs/prev', (_req, res) => {
    const result = layoutStore.selectPrevTab?.()
    if (result?.tabId) {
      wsHandler?.broadcastUiCommand({ command: 'tab.select', payload: { id: result.tabId } })
    }
    res.json(ok(result, result?.message || 'tab selected'))
  })

  router.get('/tabs', (_req, res) => {
    const tabs = layoutStore.listTabs?.() || []
    res.json(ok({ tabs }))
  })

  router.get('/panes', (req, res) => {
    const tabId = req.query.tabId as string | undefined
    const panes = layoutStore.listPanes?.(tabId) || []
    res.json(ok({ panes }))
  })

  return router
}
