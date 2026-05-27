import { useEffect, useMemo, useRef, useState } from 'react'
import { html as diff2htmlHtml } from 'diff2html'
import { useRepo } from '../store/useRepo'
import { CommitDetail } from './CommitDetail'

const MIN_HEIGHT = 160
const MAX_HEIGHT_RATIO = 0.75

export function BottomDrawer(): JSX.Element {
  const selectedCommit = useRepo((s) => s.selectedCommit)
  const stashView = useRepo((s) => s.stashView)
  const drawerHeight = useRepo((s) => s.drawerHeight)
  const setDrawerHeight = useRepo((s) => s.setDrawerHeight)

  const isVisible = selectedCommit !== null || stashView !== null

  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!dragRef.current) return
      const dy = dragRef.current.startY - e.clientY
      const max = Math.floor(window.innerHeight * MAX_HEIGHT_RATIO)
      const next = Math.max(
        MIN_HEIGHT,
        Math.min(max, dragRef.current.startHeight + dy)
      )
      setDrawerHeight(next)
    }
    const onUp = (): void => {
      dragRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [setDrawerHeight])

  const startDrag = (e: React.MouseEvent): void => {
    dragRef.current = { startY: e.clientY, startHeight: drawerHeight }
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
  }

  if (!isVisible) return <></>

  return (
    <div
      className="border-t border-line bg-bg flex flex-col"
      style={{ height: drawerHeight, minHeight: MIN_HEIGHT }}
    >
      <div
        onMouseDown={startDrag}
        className="h-1.5 cursor-ns-resize bg-bg-subtle hover:bg-accent/40 border-b border-line"
        title="Drag to resize"
      />
      <div className="flex-1 min-h-0 flex flex-col">
        {selectedCommit !== null ? (
          <CommitDetail />
        ) : (
          <StashDiffPanel />
        )}
      </div>
    </div>
  )
}

function StashDiffPanel(): JSX.Element {
  const activeRepo = useRepo((s) => s.activeRepo)
  const stashView = useRepo((s) => s.stashView)
  const setStashView = useRepo((s) => s.setStashView)
  const pushToast = useRepo((s) => s.pushToast)
  const refreshSignal = useRepo((s) => s.refreshSignal)

  const [diff, setDiff] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!activeRepo || !stashView) { setDiff(''); return }
    let cancelled = false
    setLoading(true)
    setDiff('')
    window.git.stash
      .fileDiff(activeRepo.path, stashView.stashIndex, stashView.filePath)
      .then((res) => {
        if (cancelled) return
        if (res.ok) setDiff(res.data)
        else pushToast('error', `Stash diff failed: ${res.stderr}`)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [activeRepo, stashView, pushToast])

  const rendered = useMemo(() => {
    if (!diff) return ''
    return diff2htmlHtml(diff, { drawFileList: false, matching: 'lines', outputFormat: 'line-by-line' })
  }, [diff])

  const applyFile = async (): Promise<void> => {
    if (!activeRepo || !stashView) return
    const res = await window.git.stash.applyFile(activeRepo.path, stashView.stashIndex, stashView.filePath)
    if (res.ok) {
      pushToast('success', `Applied ${stashView.filePath} from stash`)
      refreshSignal()
    } else {
      pushToast('error', `Apply failed: ${res.stderr}`)
    }
  }

  if (!stashView) return <></>

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="h-7 px-3 flex items-center gap-2 bg-bg-subtle border-b border-line text-xs shrink-0">
        <span className="text-muted">📦 stash@{'{' + stashView.stashIndex + '}'}</span>
        <span className="text-line">·</span>
        <span className="font-mono truncate flex-1">{stashView.filePath}</span>
        <button
          onClick={applyFile}
          className="px-2 py-0.5 rounded bg-accent/20 text-accent hover:bg-accent/30 shrink-0"
        >
          Apply this file
        </button>
        <button
          onClick={() => setStashView(null)}
          className="text-muted hover:text-text ml-1"
          title="Close"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto diff-target p-3">
        {loading ? (
          <div className="text-muted text-sm">Loading diff...</div>
        ) : diff.trim() === '' ? (
          <div className="text-muted text-sm italic">No textual diff available.</div>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: rendered }} />
        )}
      </div>
    </div>
  )
}

