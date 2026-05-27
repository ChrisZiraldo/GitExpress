import { useEffect, useMemo, useCallback } from 'react'
import { html as diff2htmlHtml } from 'diff2html'
import { useRepo } from '../store/useRepo'

interface DiffViewerProps {
  onClose?: () => void
}

export function DiffViewer({ onClose }: DiffViewerProps = {}): JSX.Element {
  const activeRepo = useRepo((s) => s.activeRepo)
  const selectedFile = useRepo((s) => s.selectedFile)
  const stashView = useRepo((s) => s.stashView)
  const diff = useRepo((s) => s.diff)
  const diffLoading = useRepo((s) => s.diffLoading)
  const setDiff = useRepo((s) => s.setDiff)
  const setDiffLoading = useRepo((s) => s.setDiffLoading)
  const pushToast = useRepo((s) => s.pushToast)
  const setBusy = useRepo((s) => s.setBusy)
  const refreshSignal = useRepo((s) => s.refreshSignal)
  const status = useRepo((s) => s.status)

  // Source of truth: a stash view takes precedence over a working-tree file.
  const isStash = stashView !== null
  const headerPath = isStash ? stashView!.filePath : selectedFile?.path ?? null

  useEffect(() => {
    if (!activeRepo) {
      setDiff('')
      return
    }
    let cancelled = false

    const fetchDiff = async (): Promise<void> => {
      setDiffLoading(true)
      try {
        let res: { ok: true; data: string } | { ok: false; stderr: string }
        if (isStash && stashView) {
          res = await window.git.stash.fileDiff(
            activeRepo.path,
            stashView.stashIndex,
            stashView.filePath
          )
        } else if (selectedFile) {
          res = await window.git.diff.file(activeRepo.path, {
            path: selectedFile.path,
            staged: selectedFile.staged
          })
        } else {
          setDiff('')
          return
        }
        if (cancelled) return
        if (res.ok) setDiff(res.data)
        else {
          setDiff('')
          pushToast('error', `Diff failed: ${res.stderr}`)
        }
      } finally {
        if (!cancelled) setDiffLoading(false)
      }
    }

    void fetchDiff()
    return () => {
      cancelled = true
    }
  }, [activeRepo, selectedFile, stashView, isStash, status, setDiff, setDiffLoading, pushToast])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (!onClose) return
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, handleKeyDown])

  const rendered = useMemo(() => {
    if (!diff) return ''
    return diff2htmlHtml(diff, {
      drawFileList: false,
      matching: 'lines',
      outputFormat: 'line-by-line'
    })
  }, [diff])

  const applyStashFile = async (): Promise<void> => {
    if (!activeRepo || !stashView) return
    setBusy(true)
    try {
      const res = await window.git.stash.applyFile(
        activeRepo.path,
        stashView.stashIndex,
        stashView.filePath
      )
      if (res.ok) {
        pushToast('success', `Applied ${stashView.filePath} from stash`)
        refreshSignal()
      } else {
        pushToast('error', `Apply failed: ${res.stderr}`)
      }
    } finally {
      setBusy(false)
    }
  }

  if (!headerPath) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-muted text-sm">
        Select a file to view its diff
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="h-8 px-3 flex items-center bg-bg-subtle border-b border-line text-xs gap-2">
        {isStash && stashView ? (
          <>
            <span className="text-muted shrink-0">📦 stash@{'{' + stashView.stashIndex + '}'}</span>
            <span className="text-line shrink-0">·</span>
            <span className="font-mono truncate flex-1">{stashView.filePath}</span>
            <button
              onClick={applyStashFile}
              className="shrink-0 px-2 py-0.5 rounded bg-accent/20 text-accent hover:bg-accent/30 text-xs"
              title="Apply this file to working tree"
            >
              Apply this file
            </button>
          </>
        ) : (
          selectedFile && (
            <>
              <span className="font-mono truncate flex-1">{selectedFile.path}</span>
              <span className="text-muted shrink-0">
                {selectedFile.staged ? 'staged' : 'working tree'}
              </span>
            </>
          )
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="shrink-0 ml-1 text-muted hover:text-text text-base leading-none"
            title="Close diff (Escape)"
          >
            ✕
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto diff-target">
        {diffLoading ? (
          <div className="p-4 text-muted text-sm">Loading diff...</div>
        ) : diff.trim() === '' ? (
          <div className="p-4 text-muted text-sm italic">No textual diff available.</div>
        ) : (
          <div className="p-3" dangerouslySetInnerHTML={{ __html: rendered }} />
        )}
      </div>
    </div>
  )
}
