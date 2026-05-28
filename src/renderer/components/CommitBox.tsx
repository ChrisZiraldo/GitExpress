import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
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
  const refreshSignal = useRepo((s) => s.refreshSignal)
  const refreshVersion = useRepo((s) => s.refreshVersion)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [bodyOpen, setBodyOpen] = useState(false)
  const [generating, setGenerating] = useState(false)

  // Track whether the user has stored a Cursor API key, so we can disable
  // the Generate button (and tell them to open Settings) when they haven't.
  const [apiKeySet, setApiKeySet] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await window.git.settings.get()
      if (cancelled) return
      if (res.ok) setApiKeySet(res.data.cursorApiKeySet)
    })()
    return () => {
      cancelled = true
    }
    // Refresh when the user saves new settings (refreshSignal increments).
  }, [refreshVersion])

  if (!activeRepo) return <></>

  const stagedCount = status?.staged.length ?? 0
  const canCommit = stagedCount > 0 && subject.trim().length > 0 && !busy
  const canGenerate = stagedCount > 0 && !busy && !generating

  const generateMessage = async (): Promise<void> => {
    if (!canGenerate) return
    if (!apiKeySet) {
      pushToast(
        'error',
        'Add your Cursor API key in Settings to generate commit messages.'
      )
      return
    }
    setGenerating(true)
    setBusy(true)
    try {
      const res = await window.git.ai.generateCommitMessage(activeRepo.path)
      if (!res.ok) {
        pushToast('error', `Generate failed: ${res.stderr}`)
        return
      }
      setSubject(res.data.subject)
      if (res.data.body) {
        setBody(res.data.body)
        setBodyOpen(true)
      }
      pushToast('success', 'Commit message generated')
    } finally {
      setGenerating(false)
      setBusy(false)
    }
  }

  const doCommit = async (push: boolean): Promise<void> => {
    if (!canCommit) return
    setBusy(true)
    try {
      const res = await window.git.commit.create(activeRepo.path, {
        message: subject.trim(),
        description: body.trim() || undefined
      })
      if (!res.ok) {
        pushToast('error', `Commit failed: ${res.stderr}`)
        return
      }
      pushToast('success', push ? 'Committed — pushing…' : 'Commit created')
      setSubject('')
      setBody('')
      setBodyOpen(false)

      if (push) {
        const pr = await window.git.remote.push(activeRepo.path, {})
        if (pr.ok) pushToast('success', 'Pushed successfully')
        else pushToast('error', `Push failed: ${pr.stderr}`)
      }
      refreshSignal()
      await onRefresh()
    } finally {
      setBusy(false)
    }
  }

  const generateTitle = !apiKeySet
    ? 'Add a Cursor API key in Settings to enable'
    : stagedCount === 0
      ? 'Stage changes first'
      : 'Generate a commit message from staged changes (Cursor)'

  return (
    <div className="border-t border-line bg-bg-subtle p-3 flex flex-col gap-2">
      <div className="flex items-stretch gap-2">
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void doCommit(true)
          }}
          placeholder={
            generating
              ? 'Generating commit message…'
              : stagedCount === 0
                ? 'Stage changes to commit'
                : 'Commit subject (required)'
          }
          disabled={stagedCount === 0 || busy || generating}
          className="flex-1 px-2 py-1.5 bg-bg-panel border border-line rounded-md text-sm focus:outline-none focus:border-accent disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void generateMessage()}
          disabled={!canGenerate || !apiKeySet}
          title={generateTitle}
          className={
            'shrink-0 px-2.5 rounded-md text-xs flex items-center gap-1.5 border ' +
            (apiKeySet && canGenerate
              ? 'bg-accent/10 hover:bg-accent/20 border-accent/40 text-accent'
              : 'bg-bg-panel border-line text-muted cursor-not-allowed')
          }
        >
          <Sparkles size={13} className={generating ? 'animate-pulse' : undefined} />
          <span>{generating ? 'Generating…' : 'Generate'}</span>
        </button>
      </div>
      {bodyOpen ? (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Extended description (optional)"
          rows={3}
          disabled={generating}
          className="px-2 py-1.5 bg-bg-panel border border-line rounded-md text-sm font-mono focus:outline-none focus:border-accent resize-none disabled:opacity-50"
        />
      ) : (
        <button
          onClick={() => setBodyOpen(true)}
          className="self-start text-xs text-accent hover:text-accent-hover"
        >
          + add description
        </button>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted shrink-0">
          {stagedCount} file{stagedCount === 1 ? '' : 's'} staged
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => doCommit(false)}
            disabled={!canCommit}
            className="px-3 py-1.5 rounded-md bg-bg-panel hover:bg-line disabled:bg-line disabled:text-muted text-text text-sm"
            title="Commit only"
          >
            Commit
          </button>
          <button
            onClick={() => doCommit(true)}
            disabled={!canCommit}
            className="px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover disabled:bg-line disabled:text-muted text-white text-sm font-medium whitespace-nowrap"
            title="Commit and push (Cmd/Ctrl+Enter)"
          >
            Commit & Push
          </button>
        </div>
      </div>
    </div>
  )
}
