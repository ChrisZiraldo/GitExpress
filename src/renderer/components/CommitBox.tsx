import { useState } from 'react'
import { useRepo } from '../store/useRepo'

interface Props {
  onRefresh: () => Promise<void>
}

export function CommitBox({ onRefresh }: Props): JSX.Element {
  const activeRepo = useRepo((s) => s.activeRepo)
  const status = useRepo((s) => s.status)
  const busy = useRepo((s) => s.busy)
  const setBusy = useRepo((s) => s.setBusy)
  const pushToast = useRepo((s) => s.pushToast)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [bodyOpen, setBodyOpen] = useState(false)

  if (!activeRepo) return <></>

  const stagedCount = status?.staged.length ?? 0
  const canCommit = stagedCount > 0 && subject.trim().length > 0 && !busy

  const commit = async (): Promise<void> => {
    if (!canCommit) return
    setBusy(true)
    try {
      const res = await window.git.commit.create(activeRepo.path, {
        message: subject.trim(),
        description: body.trim() || undefined
      })
      if (res.ok) {
        pushToast('success', 'Commit created')
        setSubject('')
        setBody('')
        setBodyOpen(false)
      } else {
        pushToast('error', `Commit failed: ${res.stderr}`)
      }
      await onRefresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-t border-line bg-bg-subtle p-3 flex flex-col gap-2">
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void commit()
        }}
        placeholder={
          stagedCount === 0 ? 'Stage changes to commit' : 'Commit subject (required)'
        }
        disabled={stagedCount === 0 || busy}
        className="px-2 py-1.5 bg-bg-panel border border-line rounded-md text-sm focus:outline-none focus:border-accent disabled:opacity-50"
      />
      {bodyOpen ? (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Extended description (optional)"
          rows={3}
          className="px-2 py-1.5 bg-bg-panel border border-line rounded-md text-sm font-mono focus:outline-none focus:border-accent resize-none"
        />
      ) : (
        <button
          onClick={() => setBodyOpen(true)}
          className="self-start text-xs text-accent hover:text-accent-hover"
        >
          + add description
        </button>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">
          {stagedCount} file{stagedCount === 1 ? '' : 's'} staged
        </span>
        <button
          onClick={commit}
          disabled={!canCommit}
          className="px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover disabled:bg-line disabled:text-muted text-white text-sm font-medium"
          title="Commit (Cmd/Ctrl+Enter)"
        >
          Commit
        </button>
      </div>
    </div>
  )
}
