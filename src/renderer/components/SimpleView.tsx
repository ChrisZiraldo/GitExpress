import { useEffect, useMemo, useRef, useState } from 'react'
import { html as diff2htmlHtml } from 'diff2html'
import type { FileChangeType, FileEntry, Stash, StashFileEntry } from '@shared/types'
import { useRepo } from '../store/useRepo'
import { useGitStatus } from '../hooks/useGitStatus'
import { IconBranch, IconChevronDown, IconFetch, IconPlus, IconPull, IconPush, IconStash } from './Icons'
import { ContextMenu, type MenuItem } from './ContextMenu'

const ADVANCED_W = 1280
const ADVANCED_H = 820

function changeBadge(entry: FileEntry): { label: string; cls: string } {
  switch (entry.changeType) {
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
    case 'untracked':
      return { label: '?', cls: 'text-muted' }
    default:
      return { label: ' ', cls: 'text-muted' }
  }
}

export function SimpleView(): JSX.Element {
  const activeRepo = useRepo((s) => s.activeRepo)
  const status = useRepo((s) => s.status)
  const refs = useRepo((s) => s.refs)
  const busy = useRepo((s) => s.busy)
  const setBusy = useRepo((s) => s.setBusy)
  const pushToast = useRepo((s) => s.pushToast)
  const refreshSignal = useRepo((s) => s.refreshSignal)
  const setViewMode = useRepo((s) => s.setViewMode)
  const setActiveRepo = useRepo((s) => s.setActiveRepo)
  const setRecents = useRepo((s) => s.setRecents)

  const { refresh } = useGitStatus()

  // local component state
  const [selectedFile, setSelectedFile] = useState<{ path: string; staged: boolean } | null>(null)
  const [diff, setDiff] = useState('')
  const [diffLoading, setDiffLoading] = useState(false)
  // active stash file selection (overrides selectedFile for the diff panel)
  const [stashFileSource, setStashFileSource] = useState<{ stashIndex: number; path: string } | null>(null)
  const [subject, setSubject] = useState('')
  const [newBranchOpen, setNewBranchOpen] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  // key = `${path}:${staged}`, arms a 3-s confirm window before discarding
  const [pendingDiscard, setPendingDiscard] = useState<string | null>(null)

  // Stash modal
  const [stashModalOpen, setStashModalOpen] = useState(false)
  const [stashMessage, setStashMessage] = useState('')
  const [stashSelected, setStashSelected] = useState<Set<string>>(new Set())

  // Stash list section
  const stashes = useRepo((s) => s.stashes)
  const [stashesExpanded, setStashesExpanded] = useState(true)

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)

  const branch = status?.branch
  const branchName = branch?.detached ? 'DETACHED' : (branch?.current ?? '...')
  const ahead = branch?.ahead ?? 0
  const behind = branch?.behind ?? 0
  const onMain = branchName === 'main' || branchName === 'master'

  const staged = status?.staged ?? []
  const unstaged = useMemo(
    () => [...(status?.unstaged ?? []), ...(status?.untracked ?? [])],
    [status]
  )
  const allChanged = [...unstaged, ...staged]
  const canCommit = staged.length > 0 && subject.trim().length > 0 && !busy

  // ── helpers ──────────────────────────────────────────────────────────────

  const runWithBusy = async (
    label: string,
    fn: () => Promise<{ ok: true } | { ok: false; stderr: string }>
  ): Promise<void> => {
    if (busy || !activeRepo) return
    setBusy(true)
    try {
      const res = await fn()
      if (res.ok) pushToast('success', `${label} succeeded`)
      else pushToast('error', `${label} failed: ${res.stderr}`)
      refreshSignal()
    } finally {
      setBusy(false)
    }
  }

  const selectFile = async (path: string, isStagedFile: boolean): Promise<void> => {
    if (!activeRepo) return
    setStashFileSource(null)
    setSelectedFile({ path, staged: isStagedFile })
    setDiffLoading(true)
    setDiff('')
    const res = await window.git.diff.file(activeRepo.path, { path, staged: isStagedFile })
    setDiffLoading(false)
    if (res.ok) setDiff(res.data)
    else pushToast('error', `Diff failed: ${res.stderr}`)
  }

  const stageFile = async (path: string): Promise<void> => {
    if (!activeRepo) return
    await window.git.stage.add(activeRepo.path, [path])
    await refresh()
  }

  const unstageFile = async (path: string): Promise<void> => {
    if (!activeRepo) return
    await window.git.stage.reset(activeRepo.path, [path])
    await refresh()
  }

  const toggleFile = async (entry: FileEntry): Promise<void> => {
    if (entry.staged) await unstageFile(entry.path)
    else await stageFile(entry.path)
  }

  const stageAll = async (): Promise<void> => {
    if (!activeRepo) return
    await window.git.stage.add(activeRepo.path, [])
    await refresh()
  }

  const unstageAll = async (): Promise<void> => {
    if (!activeRepo) return
    await window.git.stage.reset(activeRepo.path, [])
    await refresh()
  }

  const commit = async (): Promise<void> => {
    if (!canCommit || !activeRepo) return
    setBusy(true)
    try {
      const res = await window.git.commit.create(activeRepo.path, { message: subject.trim() })
      if (res.ok) {
        pushToast('success', 'Committed')
        setSubject('')
        setSelectedFile(null)
        setDiff('')
      } else {
        pushToast('error', `Commit failed: ${res.stderr}`)
      }
      refreshSignal()
    } finally {
      setBusy(false)
    }
  }

  const commitAndPush = async (): Promise<void> => {
    if (!canCommit || !activeRepo) return
    setBusy(true)
    try {
      const cr = await window.git.commit.create(activeRepo.path, { message: subject.trim() })
      if (!cr.ok) { pushToast('error', `Commit failed: ${cr.stderr}`); return }
      pushToast('success', 'Committed — pushing...')
      setSubject('')
      setSelectedFile(null)
      setDiff('')
      const pr = await window.git.remote.push(activeRepo.path, {})
      if (pr.ok) pushToast('success', 'Pushed successfully')
      else pushToast('error', `Push failed: ${pr.stderr}`)
      refreshSignal()
    } finally {
      setBusy(false)
    }
  }

  const switchToMain = async (): Promise<void> => {
    const mainBranch = refs.local.find((r) => r.name === 'main' || r.name === 'master')
    const target = mainBranch?.name ?? 'main'
    await runWithBusy(`Switch to ${target}`, () =>
      window.git.branch.checkout(activeRepo!.path, target)
    )
  }

  const checkoutBranch = async (name: string, type: 'local' | 'remote' | 'tag', hash?: string): Promise<void> => {
    if (type === 'remote') {
      await runWithBusy(`Checkout ${name}`, () =>
        window.git.branch.checkoutRemote(activeRepo!.path, name)
      )
    } else if (type === 'tag') {
      await runWithBusy(`Checkout tag ${name}`, () =>
        window.git.branch.checkoutDetached(activeRepo!.path, hash ?? name)
      )
    } else {
      await runWithBusy(`Checkout ${name}`, () =>
        window.git.branch.checkout(activeRepo!.path, name)
      )
    }
  }

  const submitNewBranch = async (): Promise<void> => {
    const name = newBranchName.trim()
    if (!name) { setNewBranchOpen(false); return }
    setNewBranchOpen(false)
    setNewBranchName('')
    await runWithBusy(`Create branch ${name}`, () =>
      window.git.branch.create(activeRepo!.path, name, { checkout: true })
    )
  }

  const fetch = (): Promise<void> =>
    runWithBusy('Fetch', () => window.git.remote.fetch(activeRepo!.path))

  const pull = (): Promise<void> =>
    runWithBusy('Pull', () => window.git.remote.pull(activeRepo!.path, {}))

  const [confirmReset, setConfirmReset] = useState(false)
  const resetToRemote = async (): Promise<void> => {
    if (!confirmReset) {
      setConfirmReset(true)
      setTimeout(() => setConfirmReset(false), 4000)
      return
    }
    setConfirmReset(false)
    await runWithBusy('Reset to remote', () => window.git.branch.resetToRemote(activeRepo!.path))
  }

  const push = (): Promise<void> =>
    runWithBusy('Push', () => window.git.remote.push(activeRepo!.path, {}))

  const discard = async (
    path: string,
    staged: boolean,
    changeType: FileChangeType
  ): Promise<void> => {
    const key = `${path}:${staged}`
    if (pendingDiscard !== key) {
      setPendingDiscard(key)
      setTimeout(() => setPendingDiscard((cur) => (cur === key ? null : cur)), 3000)
      return
    }
    setPendingDiscard(null)
    const res = await window.git.stage.discard(activeRepo!.path, path, staged, changeType)
    if (!res.ok) pushToast('error', `Discard failed: ${res.stderr}`)
    else pushToast('info', `Discarded ${path}`)
    if (selectedFile?.path === path) { setSelectedFile(null); setDiff('') }
    await refresh()
  }

  const openStashModal = (): void => {
    if (!activeRepo) return
    const allPaths = [...unstaged, ...staged].map((f) => f.path)
    setStashSelected(new Set(allPaths))
    setStashMessage('')
    setStashModalOpen(true)
  }

  const submitStash = async (): Promise<void> => {
    if (!activeRepo) return
    setStashModalOpen(false)
    const paths = [...stashSelected]
    const hasUntracked = [...unstaged, ...staged]
      .filter((f) => stashSelected.has(f.path))
      .some((f) => f.changeType === 'untracked')
    await runWithBusy('Stash', () =>
      window.git.stash.push(activeRepo!.path, {
        message: stashMessage.trim() || undefined,
        includeUntracked: hasUntracked,
        paths: paths.length < [...unstaged, ...staged].length ? paths : undefined
      })
    )
    setStashMessage('')
  }

  const popStash = async (index: number): Promise<void> =>
    runWithBusy('Pop stash', () => window.git.stash.pop(activeRepo!.path, index))

  const applyStash = async (index: number): Promise<void> =>
    runWithBusy('Apply stash', () => window.git.stash.apply(activeRepo!.path, index))

  const dropStash = async (index: number): Promise<void> =>
    runWithBusy('Drop stash', () => window.git.stash.drop(activeRepo!.path, index))

  const openFileContextMenu = (e: React.MouseEvent, entry: FileEntry): void => {
    e.preventDefault()
    e.stopPropagation()
    if (!activeRepo) return
    const fullPath = `${activeRepo.path}/${entry.path}`
    const items: MenuItem[] = [
      entry.staged
        ? { label: 'Unstage', onClick: () => unstageFile(entry.path) }
        : { label: 'Stage', onClick: () => stageFile(entry.path) },
      {
        label: entry.changeType === 'untracked' ? 'Delete file' : entry.staged ? 'Discard staged changes' : 'Discard changes',
        danger: true,
        onClick: () => discard(entry.path, entry.staged, entry.changeType)
      },
      { type: 'separator' },
      {
        label: 'Stash this file',
        disabled: entry.staged,
        onClick: () => {
          setStashSelected(new Set([entry.path]))
          setStashMessage('')
          setStashModalOpen(true)
        }
      },
      { type: 'separator' },
      {
        label: 'Open in editor',
        onClick: () => window.git.shell.openPath(fullPath)
      },
      {
        label: 'Show in Finder',
        onClick: () => window.git.shell.revealInFolder(fullPath)
      },
      { type: 'separator' },
      {
        label: 'Copy file path',
        onClick: () => navigator.clipboard.writeText(entry.path)
      },
      {
        label: 'Copy full path',
        onClick: () => navigator.clipboard.writeText(fullPath)
      }
    ]
    setCtxMenu({ x: e.clientX, y: e.clientY, items })
  }

  const selectStashFile = async (stashIndex: number, filePath: string): Promise<void> => {
    if (!activeRepo) return
    setSelectedFile(null)
    setStashFileSource({ stashIndex, path: filePath })
    setDiffLoading(true)
    setDiff('')
    const res = await window.git.stash.fileDiff(activeRepo.path, stashIndex, filePath)
    setDiffLoading(false)
    if (res.ok) setDiff(res.data)
    else pushToast('error', `Stash diff failed: ${res.stderr}`)
  }

  const applyStashFile = async (stashIndex: number, filePath: string): Promise<void> => {
    if (!activeRepo) return
    const res = await window.git.stash.applyFile(activeRepo.path, stashIndex, filePath)
    if (res.ok) {
      pushToast('success', `Applied ${filePath} from stash`)
      await refresh()
    } else {
      pushToast('error', `Apply failed: ${res.stderr}`)
    }
  }

  const switchToAdvanced = async (): Promise<void> => {
    setViewMode('advanced')
    await window.git.appWindow.resize(ADVANCED_W, ADVANCED_H)
  }

  const openRepo = async (): Promise<void> => {
    const res = await window.git.repo.pick()
    if (!res.ok || !res.data) return
    setActiveRepo(res.data)
    const r = await window.git.repo.recents()
    if (r.ok) setRecents(r.data)
  }

  const renderedDiff = useMemo(() => {
    if (!diff) return ''
    return diff2htmlHtml(diff, {
      drawFileList: false,
      matching: 'lines',
      outputFormat: 'line-by-line'
    })
  }, [diff])

  // ── render ────────────────────────────────────────────────────────────────

  if (!activeRepo) {
    return (
      <div className="h-full w-full flex flex-col bg-bg text-text">
        <TitleBar onSwitchAdvanced={switchToAdvanced} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <h1 className="text-xl font-semibold mb-1">Git Metro</h1>
            <p className="text-xs text-accent font-medium mb-3">Read your repo like a subway map</p>
            <p className="text-sm text-muted mb-5">
              Pick a repository to get started.
            </p>
            <button
              onClick={openRepo}
              className="px-4 py-2 rounded-md bg-accent hover:bg-accent-hover text-white font-medium text-sm"
            >
              Open repository...
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full flex flex-col bg-bg text-text">
      {/* ── Title bar ──────────────────────────────────────────────────── */}
      <TitleBar onSwitchAdvanced={switchToAdvanced} />

      {/* ── Branch bar ─────────────────────────────────────────────────── */}
      {/*
        Two-layer structure so the BranchPicker dropdown is never clipped:
        - Outer div: z-20 stacking context, no overflow (lets dropdown escape)
        - Inner scrollable div: overflow-x-auto only wraps the action buttons
      */}
      <div className="relative z-20 bg-bg-subtle border-b border-line flex items-center shrink-0">
        {/* Branch selector — self-stretch so top-full on the dropdown lands at the branch-bar bottom */}
        <div className="relative self-stretch shrink-0 flex items-center pl-3">
          <BranchPicker
            currentBranch={branchName}
            branches={[
              ...refs.local.map((r) => ({ name: r.name, current: r.current, type: 'local' as const, hash: r.hash })),
              ...refs.remote.map((r) => ({ name: r.name, current: false, type: 'remote' as const, hash: r.hash })),
              ...refs.tags.map((r) => ({ name: r.name, current: false, type: 'tag' as const, hash: r.hash }))
            ]}
            onCheckout={checkoutBranch}
          />
        </div>

        {/* Everything else can scroll horizontally without clipping the dropdown */}
        <div className="flex items-center gap-1.5 px-2 overflow-x-auto h-11 flex-1 min-w-0">

        {/* Quick → main */}
        {!onMain && (
          <button
            onClick={switchToMain}
            disabled={busy}
            className="px-2 py-1.5 rounded-md bg-bg-panel hover:bg-line text-sm text-muted hover:text-text disabled:opacity-50 whitespace-nowrap"
            title="Switch to main / master"
          >
            → main
          </button>
        )}

        {/* New branch */}
        {newBranchOpen ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitNewBranch()
                if (e.key === 'Escape') { setNewBranchOpen(false); setNewBranchName('') }
              }}
              placeholder="new-branch-name"
              className="px-2 py-1 bg-bg-panel border border-line rounded text-sm w-40 focus:outline-none focus:border-accent"
            />
            <button
              onClick={submitNewBranch}
              className="px-2 py-1 rounded bg-accent hover:bg-accent-hover text-white text-xs"
            >
              Create
            </button>
            <button
              onClick={() => { setNewBranchOpen(false); setNewBranchName('') }}
              className="text-xs text-muted hover:text-text px-1"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setNewBranchOpen(true)}
            disabled={busy}
            className="px-2 py-1.5 rounded-md bg-bg-panel hover:bg-line text-sm flex items-center gap-1 disabled:opacity-50 whitespace-nowrap"
            title="Create new branch"
          >
            <IconPlus size={13} />
            <span>New branch</span>
          </button>
        )}

        {/* Ahead / behind badges */}
        <div className="flex items-center gap-1 text-xs shrink-0">
          {ahead > 0 && <span className="px-1.5 py-0.5 rounded bg-success/15 text-success">↑{ahead}</span>}
          {behind > 0 && <span className="px-1.5 py-0.5 rounded bg-warn/15 text-warn">↓{behind}</span>}
        </div>

        {/* Spacer + action buttons */}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {/* Fetch — icon only */}
          <button
            onClick={fetch}
            disabled={busy}
            title="Fetch all remotes"
            className="p-1.5 rounded-md bg-bg-panel hover:bg-line disabled:opacity-50"
          >
            <IconFetch size={14} />
          </button>

          {/* Pull — icon only */}
          <button
            onClick={pull}
            disabled={busy}
            title="Pull (fast-forward only)"
            className="p-1.5 rounded-md bg-bg-panel hover:bg-line disabled:opacity-50"
          >
            <IconPull size={14} />
          </button>

          {/* Push — icon only, right beside Pull */}
          <button
            onClick={push}
            disabled={busy}
            title="Push"
            className="p-1.5 rounded-md bg-bg-panel hover:bg-line disabled:opacity-50"
          >
            <IconPush size={14} />
          </button>

          {/* Reset to remote */}
          {branch?.upstream && (
            <button
              onClick={resetToRemote}
              disabled={busy}
              title={
                confirmReset
                  ? 'Click again to confirm — discards local commits!'
                  : `Hard reset to ${branch.upstream}`
              }
              className={
                'px-2 py-1.5 rounded-md text-xs font-medium flex items-center gap-1 disabled:opacity-50 whitespace-nowrap ' +
                (confirmReset
                  ? 'bg-danger text-white animate-pulse'
                  : 'bg-bg-panel hover:bg-line text-warn')
              }
            >
              {confirmReset ? '⚠ Confirm?' : '→ remote'}
            </button>
          )}
          <button
            onClick={openStashModal}
            disabled={busy || allChanged.length === 0}
            className="px-2.5 py-1.5 rounded-md bg-bg-panel hover:bg-line text-sm flex items-center gap-1.5 disabled:opacity-50"
            title="Stash changes"
          >
            <IconStash size={14} />
            <span>Stash</span>
          </button>
        </div>
        </div>{/* end scrollable inner */}
      </div>{/* end branch bar */}

      {/* ── Middle: diff + file list ─────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex">
        {/* Diff */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {stashFileSource && (
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-line bg-bg-subtle text-xs text-muted shrink-0">
              <span>📦 stash@{'{' + stashFileSource.stashIndex + '}'}</span>
              <span className="text-line">·</span>
              <span className="font-mono">{stashFileSource.path}</span>
              <button
                onClick={() => applyStashFile(stashFileSource.stashIndex, stashFileSource.path)}
                className="ml-auto px-2 py-0.5 rounded bg-accent/20 text-accent hover:bg-accent/30 text-xs"
              >
                Apply this file
              </button>
            </div>
          )}
          <div className="flex-1 overflow-auto diff-target bg-bg">
            {!selectedFile && !stashFileSource ? (
              <div className="h-full flex items-center justify-center text-muted text-sm">
                Select a file to see its diff
              </div>
            ) : diffLoading ? (
              <div className="p-4 text-muted text-sm">Loading diff...</div>
            ) : diff.trim() === '' ? (
              <div className="p-4 text-muted text-sm italic">No textual diff available.</div>
            ) : (
              <div className="p-2" dangerouslySetInnerHTML={{ __html: renderedDiff }} />
            )}
          </div>
        </div>

        {/* File list */}
        <div className="w-[260px] shrink-0 border-l border-line flex flex-col overflow-hidden">
          {/* Changes (unstaged) */}
          <div className="border-b border-line">
            <div className="h-7 px-3 flex items-center justify-between bg-bg-subtle border-b border-line">
              <span className="text-xs uppercase tracking-wide text-muted">
                Changes ({unstaged.length})
              </span>
              {unstaged.length > 0 && (
                <button
                  onClick={stageAll}
                  className="text-xs text-accent hover:text-accent-hover"
                >
                  Stage all
                </button>
              )}
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 180 }}>
              {unstaged.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted italic">No changes</div>
              ) : (
                unstaged.map((f) => (
                  <FileRow
                    key={`u-${f.path}`}
                    entry={f}
                    checked={false}
                    selected={selectedFile?.path === f.path && !selectedFile?.staged}
                    onClick={() => selectFile(f.path, false)}
                    onToggle={() => toggleFile(f)}
                    confirming={pendingDiscard === `${f.path}:false`}
                    onDiscard={() => discard(f.path, false, f.changeType)}
                    onContextMenu={(e) => openFileContextMenu(e, f)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Staged */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="h-7 px-3 flex items-center justify-between bg-bg-subtle border-b border-line shrink-0">
              <span className="text-xs uppercase tracking-wide text-muted">
                Staged ({staged.length})
              </span>
              {staged.length > 0 && (
                <button
                  onClick={unstageAll}
                  className="text-xs text-accent hover:text-accent-hover"
                >
                  Unstage all
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {staged.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted italic">Nothing staged</div>
              ) : (
                staged.map((f) => (
                  <FileRow
                    key={`s-${f.path}`}
                    entry={f}
                    checked={true}
                    selected={selectedFile?.path === f.path && !!selectedFile?.staged}
                    onClick={() => selectFile(f.path, true)}
                    onToggle={() => toggleFile(f)}
                    confirming={pendingDiscard === `${f.path}:true`}
                    onDiscard={() => discard(f.path, true, f.changeType)}
                    onContextMenu={(e) => openFileContextMenu(e, f)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Tip when nothing changed */}
          {allChanged.length === 0 && staged.length === 0 && stashes.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted italic text-center">Working tree clean</div>
          )}

          {/* Stash list */}
          <div className="border-t border-line shrink-0">
            <button
              onClick={() => setStashesExpanded((v) => !v)}
              className="h-7 w-full px-3 flex items-center justify-between bg-bg-subtle hover:bg-line text-xs uppercase tracking-wide text-muted"
            >
              <span>Stashes ({stashes.length})</span>
              <span className="text-muted">{stashesExpanded ? '▲' : '▼'}</span>
            </button>
            {stashesExpanded && (
              <div className="overflow-y-auto" style={{ maxHeight: 160 }}>
                {stashes.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted italic">No stashes</div>
                ) : (
                  stashes.map((s) => (
                    <StashRow
                      key={s.index}
                      stash={s}
                      cwd={activeRepo!.path}
                      onPop={() => popStash(s.index)}
                      onApply={() => applyStash(s.index)}
                      onDrop={() => dropStash(s.index)}
                      onSelectFile={(path) => selectStashFile(s.index, path)}
                      onApplyFile={(path) => applyStashFile(s.index, path)}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── File context menu ────────────────────────────────────────────── */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* ── Stash modal ───────────────────────────────────────────────────── */}
      {stashModalOpen && (
        <StashModal
          files={[...unstaged, ...staged]}
          selected={stashSelected}
          message={stashMessage}
          onToggleFile={(path) =>
            setStashSelected((prev) => {
              const next = new Set(prev)
              if (next.has(path)) next.delete(path)
              else next.add(path)
              return next
            })
          }
          onToggleAll={() =>
            setStashSelected((prev) => {
              const allPaths = [...unstaged, ...staged].map((f) => f.path)
              return prev.size === allPaths.length ? new Set() : new Set(allPaths)
            })
          }
          onMessageChange={setStashMessage}
          onConfirm={submitStash}
          onCancel={() => setStashModalOpen(false)}
        />
      )}

      {/* ── Commit bar ─────────────────────────────────────────────────────── */}
      <div className="border-t border-line bg-bg-subtle shrink-0 px-3 py-2 flex items-center gap-2">
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void commitAndPush()
          }}
          placeholder={staged.length === 0 ? 'Stage files first…' : 'Commit message (required)'}
          disabled={staged.length === 0 || busy}
          className="flex-1 px-2.5 py-1.5 bg-bg-panel border border-line rounded-md text-sm focus:outline-none focus:border-accent disabled:opacity-50"
        />
        <button
          onClick={commit}
          disabled={!canCommit}
          className="px-3 py-1.5 rounded-md bg-bg-panel hover:bg-line text-sm disabled:opacity-40"
          title="Commit only"
        >
          Commit
        </button>
        <button
          onClick={commitAndPush}
          disabled={!canCommit}
          className="px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white text-sm font-medium disabled:opacity-40 whitespace-nowrap"
          title="Commit and push (Cmd/Ctrl+Enter)"
        >
          Commit & Push
        </button>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

interface TitleBarProps {
  onSwitchAdvanced: () => Promise<void>
}

function TitleBar({ onSwitchAdvanced }: TitleBarProps): JSX.Element {
  const activeRepo = useRepo((s) => s.activeRepo)
  const setActiveRepo = useRepo((s) => s.setActiveRepo)
  const setRecents = useRepo((s) => s.setRecents)
  const pushToast = useRepo((s) => s.pushToast)

  const openRepo = async (): Promise<void> => {
    const res = await window.git.repo.pick()
    if (!res.ok || !res.data) return
    setActiveRepo(res.data)
    const r = await window.git.repo.recents()
    if (r.ok) setRecents(r.data)
    else pushToast('error', r.stderr)
  }

  return (
    <div className="titlebar-drag h-9 bg-bg-subtle border-b border-line flex items-center gap-2 shrink-0 pl-[76px] pr-3">
      {activeRepo && (
        <>
          <button
            onClick={openRepo}
            className="titlebar-nodrag text-xs text-muted hover:text-text truncate max-w-[260px]"
            title={activeRepo.path}
          >
            {activeRepo.name}
          </button>
        </>
      )}
      <div className="ml-auto titlebar-nodrag">
        <ViewToggle onSwitch={onSwitchAdvanced} />
      </div>
    </div>
  )
}

interface ViewToggleProps {
  onSwitch: () => Promise<void>
}

function ViewToggle({ onSwitch }: ViewToggleProps): JSX.Element {
  return (
    <div className="flex items-center rounded-md overflow-hidden border border-line text-xs">
      <span className="px-2.5 py-1 bg-accent text-white font-medium">Simple</span>
      <button
        onClick={onSwitch}
        className="px-2.5 py-1 bg-bg-panel hover:bg-line text-muted hover:text-text"
      >
        Metro
      </button>
    </div>
  )
}

// ── BranchPicker ─────────────────────────────────────────────────────────────

/** Returns indices in `text` that match `query` characters in order. */
function fuzzyIndices(text: string, query: string): number[] {
  if (!query) return []
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  const indices: number[] = []
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) { indices.push(i); qi++ }
  }
  return qi === q.length ? indices : []
}

function fuzzyMatches(text: string, query: string): boolean {
  return !query || fuzzyIndices(text, query).length > 0
}

/** Renders branch name with matched characters highlighted */
function HighlightedBranch({ name, query }: { name: string; query: string }): JSX.Element {
  if (!query) return <span>{name}</span>
  const indices = new Set(fuzzyIndices(name, query))
  return (
    <span>
      {name.split('').map((ch, i) =>
        indices.has(i)
          ? <mark key={i} className="bg-transparent text-accent font-semibold">{ch}</mark>
          : <span key={i}>{ch}</span>
      )}
    </span>
  )
}

interface BranchItem {
  name: string
  current?: boolean
  type: 'local' | 'remote' | 'tag'
  hash?: string
}

interface BranchPickerProps {
  currentBranch: string
  branches: BranchItem[]
  onCheckout: (name: string, type: 'local' | 'remote' | 'tag', hash?: string) => void
}

function BranchPicker({ currentBranch, branches, onCheckout }: BranchPickerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(
    () => branches.filter((b) => fuzzyMatches(b.name, query)),
    [branches, query]
  )

  useEffect(() => { setActiveIdx(0) }, [query])

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>('[data-active="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const openPicker = (): void => {
    setQuery('')
    setActiveIdx(0)
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const close = (): void => {
    setOpen(false)
    setQuery('')
  }

  const select = (b: BranchItem): void => {
    close()
    onCheckout(b.name, b.type, b.hash)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (filtered[activeIdx]) select(filtered[activeIdx])
    } else if (e.key === 'Escape') {
      close()
    }
  }

  return (
    <div className="relative">
      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={close} />
          <div className="absolute top-full left-0 z-40 w-80 bg-bg-panel border border-accent rounded-md shadow-2xl flex flex-col">
            {/* Search input */}
            <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-line">
              <IconBranch size={13} className="text-muted shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Filter branches…"
                className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted"
              />
              {query && (
                <button onClick={() => setQuery('')} className="text-muted hover:text-text text-xs">✕</button>
              )}
            </div>
            {/* Branch list */}
            <div ref={listRef} className="overflow-y-auto max-h-72 py-0.5">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted italic">No matches</div>
              ) : (
                filtered.map((b, i) => (
                  <button
                    key={`${b.type}:${b.name}`}
                    data-active={i === activeIdx ? 'true' : undefined}
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => select(b)}
                    className={
                      'flex items-center w-full text-left px-2.5 py-1.5 text-sm gap-2 ' +
                      (i === activeIdx ? 'bg-accent/20' : 'hover:bg-bg-subtle') +
                      (b.current ? ' text-accent font-medium' : ' text-text')
                    }
                  >
                    <span className="shrink-0 text-base leading-none" title={b.type === 'local' ? 'Local' : b.type === 'remote' ? 'Remote' : 'Tag'}>
                      {b.type === 'local' ? '💻' : b.type === 'remote' ? '🌐' : '🏷'}
                    </span>
                    <span className="flex-1 truncate font-mono text-xs">
                      <HighlightedBranch name={b.name} query={query} />
                    </span>
                    {b.current && <span className="text-xs text-accent shrink-0">current</span>}
                  </button>
                ))
              )}
            </div>
            {/* Legend */}
            <div className="flex items-center gap-3 px-3 py-1.5 border-t border-line text-xs text-muted">
              <span>💻 local</span>
              <span>🌐 remote</span>
              <span>🏷 tag</span>
            </div>
          </div>
        </>
      ) : (
        <button
          onClick={openPicker}
          className="px-2.5 py-1.5 rounded-md bg-bg-panel hover:bg-line text-sm flex items-center gap-2 max-w-[220px]"
        >
          <IconBranch size={14} />
          <span className="font-medium truncate">{currentBranch}</span>
          <IconChevronDown />
        </button>
      )}
    </div>
  )
}

// ── StashModal ───────────────────────────────────────────────────────────────

interface StashModalProps {
  files: FileEntry[]
  selected: Set<string>
  message: string
  onToggleFile: (path: string) => void
  onToggleAll: () => void
  onMessageChange: (v: string) => void
  onConfirm: () => void
  onCancel: () => void
}

function StashModal({
  files,
  selected,
  message,
  onToggleFile,
  onToggleAll,
  onMessageChange,
  onConfirm,
  onCancel
}: StashModalProps): JSX.Element {
  const allSelected = selected.size === files.length && files.length > 0

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-bg-panel border border-line rounded-lg shadow-2xl w-[380px] max-h-[480px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
          <span className="font-semibold text-sm">Stash Changes</span>
          <button onClick={onCancel} className="text-muted hover:text-text text-lg leading-none">✕</button>
        </div>

        {/* Message */}
        <div className="px-4 pt-3 pb-2 shrink-0">
          <label className="block text-xs text-muted mb-1">Message (optional)</label>
          <input
            autoFocus
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && selected.size > 0) onConfirm() }}
            placeholder="WIP description…"
            className="w-full px-2.5 py-1.5 bg-bg border border-line rounded-md text-sm focus:outline-none focus:border-accent"
          />
        </div>

        {/* File list */}
        <div className="px-4 pb-1 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-muted">Files to stash</label>
            <button
              onClick={onToggleAll}
              className="text-xs text-accent hover:text-accent-hover"
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-3 min-h-0">
          {files.length === 0 ? (
            <div className="text-xs text-muted italic py-2">No changed files</div>
          ) : (
            files.map((f) => {
              const badge = changeBadge(f)
              return (
                <label
                  key={f.path}
                  className="flex items-center gap-2 py-1 cursor-pointer hover:bg-bg-subtle rounded px-1 -mx-1"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(f.path)}
                    onChange={() => onToggleFile(f.path)}
                    className="accent-[#5b8cff] shrink-0"
                  />
                  <span className={`font-mono text-xs w-4 shrink-0 ${badge.cls}`}>{badge.label}</span>
                  <span className="text-xs truncate flex-1">{f.path}</span>
                  {f.staged && <span className="text-xs text-muted shrink-0">staged</span>}
                </label>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-line shrink-0">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-md bg-bg-subtle hover:bg-line"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={selected.size === 0}
            className="px-3 py-1.5 text-sm rounded-md bg-accent hover:bg-accent-hover text-white font-medium disabled:opacity-40"
          >
            Stash {selected.size > 0 && selected.size < files.length ? `${selected.size} file${selected.size > 1 ? 's' : ''}` : 'all'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── StashRow ─────────────────────────────────────────────────────────────────

interface StashRowProps {
  stash: Stash
  cwd: string
  onPop: () => void
  onApply: () => void
  onDrop: () => void
  onSelectFile: (path: string) => void
  onApplyFile: (path: string) => void
}

function StashRow({
  stash, cwd, onPop, onApply, onDrop, onSelectFile, onApplyFile
}: StashRowProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [files, setFiles] = useState<StashFileEntry[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [fileCtx, setFileCtx] = useState<{ x: number; y: number; path: string } | null>(null)

  const toggleExpand = async (): Promise<void> => {
    if (!expanded && files.length === 0) {
      setFilesLoading(true)
      const res = await window.git.stash.files(cwd, stash.index)
      setFilesLoading(false)
      if (res.ok) setFiles(res.data)
    }
    setExpanded((v) => !v)
  }

  const statusBadge = (s: StashFileEntry['status']): { label: string; cls: string } => {
    switch (s) {
      case 'A': return { label: 'A', cls: 'text-success' }
      case 'D': return { label: 'D', cls: 'text-danger' }
      case 'R': return { label: 'R', cls: 'text-warn' }
      default:  return { label: 'M', cls: 'text-accent' }
    }
  }

  return (
    <div className="border-b border-line/50 last:border-b-0">
      {/* Header row */}
      <div className="group flex items-start gap-1.5 px-2 py-1.5 hover:bg-bg-panel text-xs">
        <button
          onClick={toggleExpand}
          className="shrink-0 text-muted hover:text-text mt-0.5"
          title={expanded ? 'Collapse' : 'Expand files'}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={toggleExpand}>
          <div className="truncate text-text" title={stash.message || stash.branch}>
            {stash.message || `WIP on ${stash.branch}`}
          </div>
          <div className="text-muted mt-0.5">
            {stash.branch && <span className="mr-1.5">{stash.branch}</span>}
            <span>{stash.relativeDate}</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100">
          <button
            onClick={onPop}
            className="px-1.5 py-0.5 rounded hover:bg-accent/20 text-accent"
            title="Pop (apply + drop)"
          >
            Pop
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="px-1 py-0.5 rounded hover:bg-line text-muted"
              title="More options"
            >
              ···
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 bg-bg-panel border border-line rounded shadow-lg z-50 w-28">
                  <button
                    onClick={() => { setMenuOpen(false); onApply() }}
                    className="block w-full text-left px-3 py-1.5 hover:bg-line text-xs"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); onDrop() }}
                    className="block w-full text-left px-3 py-1.5 hover:bg-line text-xs text-danger"
                  >
                    Drop
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* File list */}
      {expanded && (
        <div className="pb-1">
          {filesLoading ? (
            <div className="px-6 py-1 text-xs text-muted italic">Loading...</div>
          ) : files.length === 0 ? (
            <div className="px-6 py-1 text-xs text-muted italic">No files</div>
          ) : (
            files.map((f) => {
              const badge = statusBadge(f.status)
              const isActive = activeFile === f.path
              return (
                <div
                  key={f.path}
                  onClick={() => { setActiveFile(f.path); onSelectFile(f.path) }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setFileCtx({ x: e.clientX, y: e.clientY, path: f.path })
                  }}
                  className={
                    'flex items-center gap-1.5 pl-6 pr-2 py-0.5 text-xs cursor-pointer ' +
                    (isActive ? 'bg-accent/20' : 'hover:bg-bg-panel')
                  }
                  title={f.path}
                >
                  <span className={`font-mono w-3 shrink-0 ${badge.cls}`}>{badge.label}</span>
                  <span className="flex-1 truncate font-mono">{f.path}</span>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Per-file context menu */}
      {fileCtx && (
        <ContextMenu
          x={fileCtx.x}
          y={fileCtx.y}
          items={[
            {
              label: 'Apply this file to working tree',
              onClick: () => { onApplyFile(fileCtx.path); setFileCtx(null) }
            },
            { type: 'separator' },
            {
              label: 'Copy file path',
              onClick: () => navigator.clipboard.writeText(fileCtx.path)
            }
          ]}
          onClose={() => setFileCtx(null)}
        />
      )}
    </div>
  )
}

interface FileRowProps {
  entry: FileEntry
  checked: boolean
  selected: boolean
  onClick: () => void
  onToggle: () => void
  confirming: boolean
  onDiscard: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

function FileRow({
  entry,
  checked,
  selected,
  onClick,
  onToggle,
  confirming,
  onDiscard,
  onContextMenu
}: FileRowProps): JSX.Element {
  const badge = changeBadge(entry)
  const discardTitle = confirming
    ? 'Click again to permanently discard'
    : entry.changeType === 'untracked'
      ? 'Delete this file'
      : entry.staged
        ? 'Discard staged changes (restores to HEAD)'
        : 'Discard changes (restores to HEAD)'
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={
        'group flex items-center px-2 py-1 text-sm cursor-pointer ' +
        (selected ? 'bg-accent/20' : 'hover:bg-bg-panel')
      }
      title={entry.path}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => { e.stopPropagation(); onToggle() }}
        onClick={(e) => e.stopPropagation()}
        className="mr-2 shrink-0 accent-[#5b8cff]"
      />
      <span className={`font-mono w-4 text-xs shrink-0 ${badge.cls}`}>{badge.label}</span>
      <span className="ml-1.5 flex-1 truncate">{entry.path}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onDiscard() }}
        className={
          'ml-1 shrink-0 text-xs ' +
          (confirming
            ? 'opacity-100 text-danger font-semibold animate-pulse'
            : 'opacity-0 group-hover:opacity-100 text-muted hover:text-danger')
        }
        title={discardTitle}
      >
        {confirming ? 'Confirm?' : '✕'}
      </button>
    </div>
  )
}
