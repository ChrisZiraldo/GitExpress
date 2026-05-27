import { useEffect, useMemo } from 'react'
import { html as diff2htmlHtml } from 'diff2html'
import type { CommitFileStatus } from '@shared/types'
import { useRepo } from '../store/useRepo'
import { Avatar } from './Avatar'

function statusBadge(status: CommitFileStatus): { label: string; cls: string } {
  switch (status) {
    case 'added':
      return { label: 'A', cls: 'text-success' }
    case 'modified':
      return { label: 'M', cls: 'text-accent' }
    case 'deleted':
      return { label: 'D', cls: 'text-danger' }
    case 'renamed':
      return { label: 'R', cls: 'text-warn' }
    case 'copied':
      return { label: 'C', cls: 'text-warn' }
    default:
      return { label: ' ', cls: 'text-muted' }
  }
}

export function CommitDetail(): JSX.Element {
  const activeRepo = useRepo((s) => s.activeRepo)
  const selectedCommit = useRepo((s) => s.selectedCommit)
  const commitDetail = useRepo((s) => s.commitDetail)
  const selectedCommitFile = useRepo((s) => s.selectedCommitFile)
  const setCommitDetail = useRepo((s) => s.setCommitDetail)
  const setSelectedCommitFile = useRepo((s) => s.setSelectedCommitFile)
  const setDiff = useRepo((s) => s.setDiff)
  const setDiffLoading = useRepo((s) => s.setDiffLoading)
  const diff = useRepo((s) => s.diff)
  const diffLoading = useRepo((s) => s.diffLoading)
  const pushToast = useRepo((s) => s.pushToast)

  useEffect(() => {
    if (!activeRepo || !selectedCommit) {
      setCommitDetail(null)
      setSelectedCommitFile(null)
      setDiff('')
      return
    }
    let cancelled = false
    void window.git.commitInspect.show(activeRepo.path, selectedCommit).then((res) => {
      if (cancelled) return
      if (res.ok) {
        setCommitDetail(res.data)
        if (res.data.files.length > 0) {
          setSelectedCommitFile(res.data.files[0].path)
        } else {
          setSelectedCommitFile(null)
          setDiff('')
        }
      } else {
        pushToast('error', `Failed to load commit: ${res.stderr}`)
      }
    })
    return () => {
      cancelled = true
    }
  }, [
    activeRepo,
    selectedCommit,
    setCommitDetail,
    setSelectedCommitFile,
    setDiff,
    pushToast
  ])

  useEffect(() => {
    if (!activeRepo || !selectedCommit || !selectedCommitFile) {
      setDiff('')
      return
    }
    let cancelled = false
    setDiffLoading(true)
    void window.git.commitInspect
      .showFileDiff(activeRepo.path, selectedCommit, selectedCommitFile)
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
  }, [
    activeRepo,
    selectedCommit,
    selectedCommitFile,
    setDiff,
    setDiffLoading,
    pushToast
  ])

  const renderedDiff = useMemo(() => {
    if (!diff) return ''
    return diff2htmlHtml(diff, {
      drawFileList: false,
      matching: 'lines',
      outputFormat: 'line-by-line'
    })
  }, [diff])

  if (!selectedCommit) return <></>

  if (!commitDetail) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted text-sm">
        Loading commit...
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-3 py-2 bg-bg-subtle border-b border-line">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-mono text-muted">{commitDetail.shortHash}</span>
          <span className="font-medium truncate">{commitDetail.subject}</span>
        </div>
        <div className="text-xs text-muted mt-0.5 flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <Avatar email={commitDetail.email} author={commitDetail.author} size={20} />
            {commitDetail.author} &lt;{commitDetail.email}&gt;
          </span>
          <span>{commitDetail.relativeDate}</span>
          {commitDetail.parents.length > 0 && (
            <span>
              parents:{' '}
              {commitDetail.parents.map((p, i) => (
                <span key={p}>
                  <button
                    onClick={() => useRepo.getState().setSelectedCommit(p)}
                    className="font-mono hover:text-accent"
                  >
                    {p.slice(0, 7)}
                  </button>
                  {i < commitDetail.parents.length - 1 ? ', ' : ''}
                </span>
              ))}
            </span>
          )}
        </div>
        {commitDetail.body.trim() && (
          <pre className="mt-2 text-xs text-muted whitespace-pre-wrap font-mono">
            {commitDetail.body.trim()}
          </pre>
        )}
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="w-[280px] min-w-[220px] border-r border-line overflow-y-auto">
          <div className="px-3 py-1 text-xs uppercase tracking-wide text-muted bg-bg-subtle border-b border-line">
            Files ({commitDetail.files.length})
          </div>
          {commitDetail.files.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted italic">
              No file changes
            </div>
          ) : (
            commitDetail.files.map((f) => {
              const badge = statusBadge(f.status)
              const selected = selectedCommitFile === f.path
              return (
                <div
                  key={f.path}
                  onClick={() => setSelectedCommitFile(f.path)}
                  className={
                    'flex items-center px-3 py-1 text-sm cursor-pointer ' +
                    (selected ? 'bg-accent/20' : 'hover:bg-bg-panel')
                  }
                  title={f.path}
                >
                  <span className={`font-mono w-4 text-xs ${badge.cls}`}>
                    {badge.label}
                  </span>
                  <span className="ml-2 flex-1 truncate">{f.path}</span>
                </div>
              )
            })
          )}
        </div>

        <div className="flex-1 min-w-0 overflow-auto diff-target">
          {!selectedCommitFile ? (
            <div className="p-4 text-muted text-sm italic">Select a file to view its diff</div>
          ) : diffLoading ? (
            <div className="p-4 text-muted text-sm">Loading diff...</div>
          ) : diff.trim() === '' ? (
            <div className="p-4 text-muted text-sm italic">No textual diff available.</div>
          ) : (
            <div className="p-3" dangerouslySetInnerHTML={{ __html: renderedDiff }} />
          )}
        </div>
      </div>
    </div>
  )
}
