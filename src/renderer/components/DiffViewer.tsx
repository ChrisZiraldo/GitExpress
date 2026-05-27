import { useEffect, useMemo } from 'react'
import { html as diff2htmlHtml } from 'diff2html'
import { useRepo } from '../store/useRepo'

export function DiffViewer(): JSX.Element {
  const activeRepo = useRepo((s) => s.activeRepo)
  const selectedFile = useRepo((s) => s.selectedFile)
  const diff = useRepo((s) => s.diff)
  const diffLoading = useRepo((s) => s.diffLoading)
  const setDiff = useRepo((s) => s.setDiff)
  const setDiffLoading = useRepo((s) => s.setDiffLoading)
  const pushToast = useRepo((s) => s.pushToast)
  const status = useRepo((s) => s.status)

  useEffect(() => {
    if (!activeRepo || !selectedFile) {
      setDiff('')
      return
    }
    let cancelled = false
    setDiffLoading(true)
    void window.git.diff
      .file(activeRepo.path, { path: selectedFile.path, staged: selectedFile.staged })
      .then((res) => {
        if (cancelled) return
        if (res.ok) setDiff(res.data)
        else {
          setDiff('')
          pushToast('error', `Diff failed: ${res.stderr}`)
        }
      })
      .finally(() => {
        if (!cancelled) setDiffLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeRepo, selectedFile, status, setDiff, setDiffLoading, pushToast])

  const rendered = useMemo(() => {
    if (!diff) return ''
    return diff2htmlHtml(diff, {
      drawFileList: false,
      matching: 'lines',
      outputFormat: 'line-by-line'
    })
  }, [diff])

  if (!selectedFile) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-muted text-sm">
        Select a file to view its diff
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="h-7 px-3 flex items-center bg-bg-subtle border-b border-line text-xs">
        <span className="font-mono truncate">{selectedFile.path}</span>
        <span className="ml-2 text-muted">
          {selectedFile.staged ? '(staged)' : '(working tree)'}
        </span>
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
