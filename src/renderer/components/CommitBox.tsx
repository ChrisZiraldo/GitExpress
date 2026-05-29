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
  const pushUndoEntry = useRepo((s) => s.pushUndoEntry)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [bodyOpen, setBodyOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [amend, setAmend] = useState(false)

  // Track whether the user has stored a Cursor API key
  const [apiKeySet, setApiKeySet] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await window.git.settings.get()
      if (cancelled) return
      if (res.ok) setApiKeySet(res.data.cursorApiKeySet)
    })()
    return () => { cancelled = true }
  }, [refreshVersion])

  // When amend is toggled on, prefill message from HEAD
  useEffect(() => {
    if (!amend || !activeRepo) return
    let cancelled = false
    void (async () => {
      const res = await window.git.commitInspect.show(activeRepo.path, 'HEAD')
      if (cancelled || !res.ok) return
      setSubject(res.data.subject)
      if (res.data.body) { setBody(res.data.body); setBodyOpen(true) }
    })()
    return () => { cancelled = true }
  }, [amend, activeRepo])

  if (!activeRepo) return <></>

  const stagedCount = status?.staged.length ?? 0
  const branch = status?.branch
  const headPushed = !!(branch?.upstream && branch.ahead === 0)
  const canAmend = !headPushed // warn if already pushed

  const canCommit = (amend || stagedCount > 0) && subject.trim().length > 0 && !busy
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
      // Capture HEAD before amend for undo
      if (amend) {
        const shaRes = await window.git.gitUndo.headSha(activeRepo.path)
        if (shaRes.ok) {
          const beforeSha = shaRes.data
          pushUndoEntry({ label: 'Amend commit', beforeSha })
        }
      }
      const res = await window.git.commit.create(activeRepo.path, {
        message: subject.trim(),
        description: body.trim() || undefined,
        amend
      })
      if (!res.ok) {
        pushToast('error', `Commit failed: ${res.stderr}`)
        return
      }
      pushToast('success', push ? 'Committed — pushing…' : amend ? 'Commit amended' : 'Commit created')
      setSubject('')
      setBody('')
      setBodyOpen(false)
      setAmend(false)

      if (push) {
        const pr = await window.git.remote.push(activeRepo.path, amend ? { force: true } : {})
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
        <label
          className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
          title={headPushed ? 'HEAD is already pushed — amending will require a force push' : 'Amend the most recent commit instead of creating a new one'}
        >
          <input
            type="checkbox"
            checked={amend}
            onChange={(e) => {
              if (e.target.checked && !canAmend) {
                pushToast('info', 'HEAD is already pushed. Amending will rewrite history and require a force push.')
              }
              setAmend(e.target.checked)
              if (!e.target.checked) { setSubject(''); setBody(''); setBodyOpen(false) }
            }}
            className="accent-accent"
          />
          <span className={headPushed ? 'text-warn' : 'text-muted'}>Amend</span>
        </label>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => doCommit(false)}
            disabled={!canCommit}
            className="px-3 py-1.5 rounded-md bg-bg-panel hover:bg-line disabled:bg-line disabled:text-muted text-text text-sm"
            title={amend ? 'Amend last commit' : 'Commit only'}
          >
            {amend ? 'Amend' : 'Commit'}
          </button>
          <button
            onClick={() => doCommit(true)}
            disabled={!canCommit}
            className="px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover disabled:bg-line disabled:text-muted text-white text-sm font-medium whitespace-nowrap"
            title={amend ? 'Amend and force push (Cmd/Ctrl+Enter)' : 'Commit and push (Cmd/Ctrl+Enter)'}
          >
            {amend ? 'Amend & Push' : 'Commit & Push'}
          </button>
        </div>
      </div>
    </div>
  )
}
