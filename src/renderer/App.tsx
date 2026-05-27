import { useEffect, useState } from 'react'
import { useRepo } from './store/useRepo'
import { useGitStatus } from './hooks/useGitStatus'
import { RefsSidebar } from './components/RefsSidebar'
import { Toast } from './components/Toast'
import { EmptyState } from './components/EmptyState'
import { SimpleView } from './components/SimpleView'
import { StatusPanel } from './components/StatusPanel'
import { CommitBox } from './components/CommitBox'
import { DiffViewer } from './components/DiffViewer'
import { TopBar } from './components/TopBar'
import { MetroMap } from './components/metro/MetroMap'
import { StationDetailsPanel } from './components/StationDetailsPanel'

const SIMPLE_W = 900
const SIMPLE_H = 600
const ADVANCED_W = 1380
const ADVANCED_H = 860

export function App(): JSX.Element {
  const activeRepo = useRepo((s) => s.activeRepo)
  const viewMode = useRepo((s) => s.viewMode)
  const setViewMode = useRepo((s) => s.setViewMode)
  const setActiveRepo = useRepo((s) => s.setActiveRepo)
  const setRecents = useRepo((s) => s.setRecents)
  const pushToast = useRepo((s) => s.pushToast)
  const refreshSignal = useRepo((s) => s.refreshSignal)
  const selectedFile = useRepo((s) => s.selectedFile)
  const setSelectedFile = useRepo((s) => s.setSelectedFile)
  const selectedCommit = useRepo((s) => s.selectedCommit)
  const stashView = useRepo((s) => s.stashView)
  const metroViewTab = useRepo((s) => s.metroViewTab)
  useGitStatus()

  const [dryRun, setDryRun] = useState<{ active: boolean; logPath: string } | null>(null)
  useEffect(() => {
    void window.git.dryRun.status().then(setDryRun)
  }, [])

  useEffect(() => {
    void (async () => {
      const [recentsRes, lastRes] = await Promise.all([
        window.git.repo.recents(),
        window.git.repo.getLast()
      ])
      if (recentsRes.ok) setRecents(recentsRes.data)
      else pushToast('error', recentsRes.stderr)

      if (lastRes.ok && lastRes.data) {
        const openRes = await window.git.repo.open(lastRes.data)
        if (openRes.ok) {
          setActiveRepo(openRes.data)
          if (recentsRes.ok) {
            const fresh = await window.git.repo.recents()
            if (fresh.ok) setRecents(fresh.data)
          }
        }
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const unsubOpen = window.git.appMenu.onOpenRepo(async (path) => {
      if (path === '__clear_recents__') return
      const res = await window.git.repo.open(path)
      if (res.ok) {
        setActiveRepo(res.data)
        const fresh = await window.git.repo.recents()
        if (fresh.ok) setRecents(fresh.data)
      } else {
        pushToast('error', res.stderr)
      }
    })
    const unsubClose = window.git.appMenu.onCloseRepo(() => {
      setActiveRepo(null)
    })
    return () => {
      unsubOpen()
      unsubClose()
    }
  }, [setActiveRepo, setRecents, pushToast])

  useEffect(() => {
    if (viewMode === 'simple') {
      void window.git.appWindow.resize(SIMPLE_W, SIMPLE_H)
    } else {
      void window.git.appWindow.resize(ADVANCED_W, ADVANCED_H)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = async (): Promise<void> => {
    refreshSignal()
  }

  const dryRunBanner = dryRun?.active ? (
    <div className="w-full px-3 py-1 bg-warn text-black text-xs font-semibold flex items-center gap-2 z-50 shrink-0">
      <span>⚠ DRY-RUN MODE — git write commands are logged, not executed.</span>
      <span className="font-mono font-normal truncate opacity-70">{dryRun.logPath}</span>
    </div>
  ) : null

  if (viewMode === 'simple') {
    return (
      <>
        {dryRunBanner}
        <SimpleView />
        <Toast />
      </>
    )
  }

  // ── Metro view ─────────────────────────────────────────────────────────────

  const switchToSimple = async (): Promise<void> => {
    setViewMode('simple')
    await window.git.appWindow.resize(SIMPLE_W, SIMPLE_H)
  }

  return (
    <div className="h-full w-full flex flex-col bg-bg text-text">
      {dryRunBanner}
      <TopBar onSwitchSimple={switchToSimple} />
      <div className="flex-1 min-h-0 flex flex-col">
        {activeRepo ? (
          <div className="flex-1 min-h-0 flex">
            <RefsSidebar />

            {/* Center: metro map with diff overlay */}
            <div className="flex-1 min-w-0 flex flex-col relative overflow-hidden">
              {metroViewTab === 'history' ? (
                <MetroMap />
              ) : (
                <TabPlaceholder tab={metroViewTab} />
              )}
              {selectedFile && (
                <div className="absolute inset-0 z-20 bg-bg flex flex-col">
                  <DiffViewer onClose={() => setSelectedFile(null)} />
                </div>
              )}
            </div>

            {/* Right context panel */}
            <div className="w-[340px] min-w-[300px] border-l border-line flex flex-col bg-bg shrink-0">
              {selectedCommit && !stashView ? (
                <StationDetailsPanel />
              ) : (
                <>
                  <StatusPanel onRefresh={refresh} />
                  <CommitBox onRefresh={refresh} />
                </>
              )}
            </div>
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
      <Toast />
    </div>
  )
}

function TabPlaceholder({ tab }: { tab: string }): JSX.Element {
  const titles: Record<string, { title: string; body: string }> = {
    flow: {
      title: 'Flow view',
      body: 'Visualize PR throughput and review velocity. Coming soon.'
    },
    risk: {
      title: 'Risk view',
      body: 'Highlight CI failures, conflicts, and stale lines. Coming soon.'
    },
    ownership: {
      title: 'Ownership view',
      body: 'Color the map by code owner. Coming soon.'
    }
  }
  const info = titles[tab] ?? { title: tab, body: 'Coming soon.' }
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2">
      <span className="text-xs uppercase tracking-wider text-muted">{tab}</span>
      <h2 className="text-lg font-semibold text-text">{info.title}</h2>
      <p className="text-sm text-muted max-w-sm">{info.body}</p>
    </div>
  )
}
