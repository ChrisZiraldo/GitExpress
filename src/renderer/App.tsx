import { useEffect, useState } from 'react'
import { useRepo } from './store/useRepo'
import { useGitStatus } from './hooks/useGitStatus'
import { Toolbar } from './components/Toolbar'
import { RefsSidebar } from './components/RefsSidebar'
import { CommitGraph } from './components/CommitGraph'
import { BottomDrawer } from './components/BottomDrawer'
import { Toast } from './components/Toast'
import { EmptyState } from './components/EmptyState'
import { SimpleView } from './components/SimpleView'
import { StatusPanel } from './components/StatusPanel'
import { CommitBox } from './components/CommitBox'
import { DiffViewer } from './components/DiffViewer'

const SIMPLE_W = 900
const SIMPLE_H = 600
const ADVANCED_W = 1280
const ADVANCED_H = 820

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
  useGitStatus()

  const [dryRun, setDryRun] = useState<{ active: boolean; logPath: string } | null>(null)
  useEffect(() => {
    void window.git.dryRun.status().then(setDryRun)
  }, [])

  // Load recents and auto-open last repo on mount
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
            // Re-fetch recents since open() updates them
            const fresh = await window.git.repo.recents()
            if (fresh.ok) setRecents(fresh.data)
          }
        }
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Listen for File-menu open/close events from the main process
  useEffect(() => {
    const unsubOpen = window.git.appMenu.onOpenRepo(async (path) => {
      if (path === '__clear_recents__') {
        // handled by renderer: just refresh recents display — removal is per-item
        return
      }
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

  // Resize window to match the view when first loading
  useEffect(() => {
    if (viewMode === 'simple') {
      void window.git.appWindow.resize(SIMPLE_W, SIMPLE_H)
    } else {
      void window.git.appWindow.resize(ADVANCED_W, ADVANCED_H)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // ── Advanced view ──────────────────────────────────────────────────────────
  const refresh = async (): Promise<void> => { refreshSignal() }

  return (
    <div className="h-full w-full flex flex-col bg-bg text-text">
      {dryRunBanner}
      <AdvancedTitleBar
        onSwitchSimple={async () => {
          setViewMode('simple')
          await window.git.appWindow.resize(SIMPLE_W, SIMPLE_H)
        }}
      />
      <Toolbar />
      <div className="flex-1 min-h-0 flex flex-col">
        {activeRepo ? (
          <>
            <div className="flex-1 min-h-0 flex">
              <RefsSidebar />

              {/* Center: commit graph with diff overlay */}
              <div className="flex-1 min-w-0 flex flex-col relative overflow-hidden">
                <CommitGraph />
                {selectedFile && (
                  <div className="absolute inset-0 z-20 bg-bg flex flex-col">
                    <DiffViewer onClose={() => setSelectedFile(null)} />
                  </div>
                )}
              </div>

              {/* Right: staging panel */}
              <div className="w-[280px] min-w-[240px] border-l border-line flex flex-col bg-bg">
                <StatusPanel onRefresh={refresh} />
                <CommitBox onRefresh={refresh} />
              </div>
            </div>
            <BottomDrawer />
          </>
        ) : (
          <EmptyState />
        )}
      </div>
      <Toast />
    </div>
  )
}

interface AdvancedTitleBarProps {
  onSwitchSimple: () => Promise<void>
}

function AdvancedTitleBar({ onSwitchSimple }: AdvancedTitleBarProps): JSX.Element {
  const activeRepo = useRepo((s) => s.activeRepo)
  return (
    <div className="titlebar-drag h-8 bg-bg-subtle border-b border-line flex items-center px-4 gap-2 text-xs shrink-0">
      <span className="font-semibold text-text">SimpleGit</span>
      {activeRepo && (
        <span className="text-muted truncate max-w-[320px]" title={activeRepo.path}>
          {activeRepo.path}
        </span>
      )}
      <div className="ml-auto titlebar-nodrag">
        <div className="flex items-center rounded-md overflow-hidden border border-line">
          <button
            onClick={onSwitchSimple}
            className="px-2.5 py-0.5 bg-bg-panel hover:bg-line text-muted hover:text-text"
          >
            Simple
          </button>
          <span className="px-2.5 py-0.5 bg-accent text-white font-medium">Advanced</span>
        </div>
      </div>
    </div>
  )
}
