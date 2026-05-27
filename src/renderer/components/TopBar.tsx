import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  ChevronDown,
  TramFront,
  Download,
  ArrowDownToLine,
  ArrowUpFromLine,
  GitBranch,
  Archive,
  Settings,
  Layers,
  Maximize2,
  RotateCcw,
  Home
} from 'lucide-react'
import { useRepo, type MetroViewTab } from '../store/useRepo'
import type { FileEntry } from '@shared/types'

const TABS: { id: MetroViewTab; label: string }[] = [
  { id: 'history', label: 'History' },
  { id: 'flow', label: 'Flow' },
  { id: 'risk', label: 'Risk' },
  { id: 'ownership', label: 'Ownership' }
]

export function TopBar(): JSX.Element {
  const activeRepo = useRepo((s) => s.activeRepo)
  const recents = useRepo((s) => s.recents)
  const status = useRepo((s) => s.status)
  const refs = useRepo((s) => s.refs)
  const stashes = useRepo((s) => s.stashes)
  const busy = useRepo((s) => s.busy)
  const setBusy = useRepo((s) => s.setBusy)
  const setActiveRepo = useRepo((s) => s.setActiveRepo)
  const setRecents = useRepo((s) => s.setRecents)
  const pushToast = useRepo((s) => s.pushToast)
  const refreshSignal = useRepo((s) => s.refreshSignal)
  const searchQuery = useRepo((s) => s.searchQuery)
  const setSearchQuery = useRepo((s) => s.setSearchQuery)
  const metroViewTab = useRepo((s) => s.metroViewTab)
  const setMetroViewTab = useRepo((s) => s.setMetroViewTab)
  const highlightedBranchId = useRepo((s) => s.highlightedBranchId)
  const setHighlightedBranchId = useRepo((s) => s.setHighlightedBranchId)

  const [repoMenuOpen, setRepoMenuOpen] = useState(false)
  const [branchFilterOpen, setBranchFilterOpen] = useState(false)
  const [newBranchOpen, setNewBranchOpen] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [stashOpen, setStashOpen] = useState(false)
  const [stashMessage, setStashMessage] = useState('')
  const [stashSelected, setStashSelected] = useState<Set<string>>(new Set())
  const [confirmReset, setConfirmReset] = useState(false)

  const branch = status?.branch
  const branchName = branch?.detached ? 'DETACHED' : branch?.current ?? '...'
  const onMain = branchName === 'main' || branchName === 'master'

  const changedFiles = useMemo<FileEntry[]>(() => {
    if (!status) return []
    return [...status.unstaged, ...status.untracked, ...status.staged]
  }, [status])

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

  const openPicker = async (): Promise<void> => {
    setRepoMenuOpen(false)
    const res = await window.git.repo.pick()
    if (!res.ok) { pushToast('error', res.stderr); return }
    if (!res.data) return
    setActiveRepo(res.data)
    const r = await window.git.repo.recents()
    if (r.ok) setRecents(r.data)
  }
  const openExisting = async (path: string): Promise<void> => {
    setRepoMenuOpen(false)
    const res = await window.git.repo.open(path)
    if (!res.ok) { pushToast('error', res.stderr); return }
    setActiveRepo(res.data)
    const r = await window.git.repo.recents()
    if (r.ok) setRecents(r.data)
  }

  const fetchAll = (): Promise<void> =>
    runWithBusy('Fetch', () => window.git.remote.fetch(activeRepo!.path))
  const pull = (): Promise<void> =>
    runWithBusy('Pull', () => window.git.remote.pull(activeRepo!.path, {}))
  const push = (): Promise<void> =>
    runWithBusy('Push', () => window.git.remote.push(activeRepo!.path, {}))

  const switchToMain = async (): Promise<void> => {
    const mainBranch = refs.local.find((r) => r.name === 'main' || r.name === 'master')
    const target = mainBranch?.name ?? 'main'
    await runWithBusy(`Switch to ${target}`, () =>
      window.git.branch.checkout(activeRepo!.path, target)
    )
  }

  const resetToRemote = async (): Promise<void> => {
    if (!confirmReset) {
      setConfirmReset(true)
      setTimeout(() => setConfirmReset(false), 4000)
      return
    }
    setConfirmReset(false)
    await runWithBusy('Reset to remote', () =>
      window.git.branch.resetToRemote(activeRepo!.path)
    )
  }

  const submitNewBranch = async (): Promise<void> => {
    const name = newBranchName.trim()
    if (!name) return
    setNewBranchOpen(false)
    setNewBranchName('')
    await runWithBusy(`Create branch ${name}`, () =>
      window.git.branch.create(activeRepo!.path, name, { checkout: true })
    )
  }

  const openStashDialog = (preselected?: string[]): void => {
    if (!activeRepo) return
    const allPaths = changedFiles.map((f) => f.path)
    const pre = preselected && preselected.length > 0
      ? new Set(preselected.filter((p) => allPaths.includes(p)))
      : new Set(allPaths)
    setStashSelected(pre)
    setStashMessage('')
    setStashOpen(true)
  }

  // Allow other components (e.g. file context menu) to request opening the
  // stash dialog with a specific set of files preselected.
  useEffect(() => {
    const onStashFiles = (e: Event): void => {
      const detail = (e as CustomEvent<{ paths?: string[] }>).detail
      openStashDialog(detail?.paths)
    }
    window.addEventListener('gitmetro:stash-files', onStashFiles as EventListener)
    return () =>
      window.removeEventListener('gitmetro:stash-files', onStashFiles as EventListener)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRepo, changedFiles])

  const submitStash = async (): Promise<void> => {
    if (!activeRepo) return
    setStashOpen(false)
    const message = stashMessage.trim()
    const paths = [...stashSelected]
    const hasUntracked = changedFiles
      .filter((f) => stashSelected.has(f.path))
      .some((f) => f.changeType === 'untracked')
    const subset = paths.length > 0 && paths.length < changedFiles.length
    await runWithBusy('Stash', () =>
      window.git.stash.push(activeRepo!.path, {
        message: message || undefined,
        includeUntracked: hasUntracked,
        paths: subset ? paths : undefined
      })
    )
    setStashMessage('')
  }

  const popStash = async (): Promise<void> => {
    if (stashes.length === 0) {
      pushToast('info', 'No stashes to pop')
      return
    }
    await runWithBusy('Pop stash', () => window.git.stash.pop(activeRepo!.path, 0))
  }

  const ahead = branch?.ahead ?? 0
  const behind = branch?.behind ?? 0

  const allBranches = [
    { fullName: 'ALL', name: 'All Branches', current: false },
    ...refs.local.map((r) => ({
      fullName: r.fullName,
      name: r.name,
      current: !!r.current
    }))
  ]
  const selectedBranchLabel =
    allBranches.find((b) => b.fullName === (highlightedBranchId ?? 'ALL'))?.name ?? 'All Branches'

  return (
    <div className="titlebar-drag h-12 bg-bg-subtle border-b border-line flex items-center px-3 gap-2 shrink-0">
      {/* Wordmark */}
      <div className="flex items-center gap-2 pl-2 mr-1 pr-3 border-r border-line shrink-0">
        <div className="w-7 h-7 rounded-md bg-accent/15 border border-accent/40 flex items-center justify-center text-accent">
          <TramFront size={16} strokeWidth={2.25} />
        </div>
        <span className="font-semibold text-base text-text">Git Metro</span>
      </div>

      {/* Repo picker */}
      <Popover
        open={repoMenuOpen}
        onOpenChange={setRepoMenuOpen}
        trigger={
          <button className="titlebar-nodrag px-2.5 py-1.5 rounded-md bg-bg-panel hover:bg-line text-sm flex items-center gap-2 max-w-[260px] shrink-0">
            <span className="truncate font-medium">
              {activeRepo ? activeRepo.name : 'Open repository…'}
            </span>
            <ChevronDown size={12} />
          </button>
        }
        content={
          <div className="w-72 max-h-80 overflow-y-auto">
            <button
              onClick={openPicker}
              className="w-full text-left px-3 py-2 hover:bg-line text-sm border-b border-line"
            >
              Open repository…
            </button>
            {recents.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted">No recent repositories.</div>
            ) : (
              <>
                <div className="px-3 pt-2 pb-1 text-xs uppercase tracking-wide text-muted">Recent</div>
                {recents.map((r) => (
                  <button
                    key={r.path}
                    onClick={() => openExisting(r.path)}
                    className={
                      'block w-full text-left px-3 py-1.5 hover:bg-line text-sm ' +
                      (r.path === activeRepo?.path ? 'text-accent' : '')
                    }
                    title={r.path}
                  >
                    <div className="truncate font-medium">{r.name}</div>
                    <div className="truncate text-xs text-muted">{r.path}</div>
                  </button>
                ))}
              </>
            )}
          </div>
        }
      />

      {/* Search */}
      <div className="titlebar-nodrag relative flex-1 max-w-[440px]">
        <Search
          size={13}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
        />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search commits, branches, authors…"
          className="w-full pl-8 pr-12 py-1.5 bg-bg-panel border border-line rounded-md text-sm focus:outline-none focus:border-accent placeholder:text-muted"
        />
        <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted bg-bg-subtle border border-line rounded px-1.5 py-0.5 font-mono">
          ⌘K
        </kbd>
      </div>

      {/* Branch filter */}
      <Popover
        open={branchFilterOpen}
        onOpenChange={setBranchFilterOpen}
        trigger={
          <button className="titlebar-nodrag px-2.5 py-1.5 rounded-md bg-bg-panel hover:bg-line text-sm flex items-center gap-2 shrink-0">
            <GitBranch size={13} className="text-muted" />
            <span className="font-medium truncate max-w-[140px]">{selectedBranchLabel}</span>
            <ChevronDown size={12} />
          </button>
        }
        content={
          <div className="w-56 max-h-80 overflow-y-auto py-1">
            {allBranches.map((b) => {
              const selected =
                b.fullName === (highlightedBranchId ?? 'ALL') ||
                (highlightedBranchId === null && b.fullName === 'ALL')
              return (
                <button
                  key={b.fullName}
                  onClick={() => {
                    setHighlightedBranchId(b.fullName === 'ALL' ? null : b.fullName)
                    setBranchFilterOpen(false)
                  }}
                  className={
                    'block w-full text-left px-3 py-1.5 hover:bg-line text-sm ' +
                    (selected ? 'text-accent font-medium' : '')
                  }
                >
                  {b.name}
                  {b.current && <span className="ml-2 text-xs text-muted">current</span>}
                </button>
              )
            })}
          </div>
        }
      />

      {/* View tabs */}
      <div className="titlebar-nodrag flex items-center rounded-md overflow-hidden border border-line text-xs shrink-0 ml-1">
        {TABS.map((t) => {
          const active = metroViewTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setMetroViewTab(t.id)}
              className={
                'px-3 py-1.5 ' +
                (active
                  ? 'bg-accent text-white font-medium'
                  : 'bg-bg-panel text-muted hover:bg-line hover:text-text')
              }
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Branch ahead/behind */}
      {activeRepo && branch && (
        <div className="flex items-center gap-1 text-xs shrink-0">
          {ahead > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-success/15 text-success font-mono">
              ↑{ahead}
            </span>
          )}
          {behind > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-warn/15 text-warn font-mono">
              ↓{behind}
            </span>
          )}
        </div>
      )}

      {/* Right action buttons */}
      <div className="ml-auto flex items-center gap-1 titlebar-nodrag shrink-0">
        {activeRepo && (
          <>
            {!onMain && (
              <ToolIconButton
                onClick={switchToMain}
                disabled={busy}
                title="Switch to main / master"
                icon={<Home size={14} />}
              />
            )}
            <ToolIconButton
              onClick={fetchAll}
              disabled={busy}
              title="Fetch all remotes"
              icon={<Download size={14} />}
            />
            <ToolIconButton
              onClick={pull}
              disabled={busy}
              title="Pull (fast-forward)"
              icon={<ArrowDownToLine size={14} />}
            />
            <ToolIconButton
              onClick={push}
              disabled={busy}
              title="Push"
              icon={<ArrowUpFromLine size={14} />}
              primary
            />
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
                  'p-1.5 rounded-md disabled:opacity-40 flex items-center gap-1 ' +
                  (confirmReset
                    ? 'bg-danger text-white animate-pulse'
                    : 'bg-bg-panel hover:bg-line text-warn')
                }
              >
                <RotateCcw size={14} />
                {confirmReset && <span className="text-xs font-medium pr-1">Confirm?</span>}
              </button>
            )}
            <Divider />
            <ToolIconButton
              onClick={() => setNewBranchOpen(true)}
              disabled={busy}
              title={`New branch from ${branchName}`}
              icon={<GitBranch size={14} />}
            />
            <ToolIconButton
              onClick={() => openStashDialog()}
              disabled={busy || changedFiles.length === 0}
              title="Stash changes"
              icon={<Archive size={14} />}
            />
            <ToolIconButton
              onClick={popStash}
              disabled={busy || stashes.length === 0}
              title="Pop most recent stash"
              icon={<Layers size={14} />}
            />
            <Divider />
          </>
        )}

        <ToolIconButton
          onClick={() => {
            window.dispatchEvent(new CustomEvent('gitmetro:fit'))
          }}
          title="Fit map"
          icon={<Maximize2 size={14} />}
        />
        <ToolIconButton
          onClick={() => undefined}
          title="Settings"
          icon={<Settings size={14} />}
        />
      </div>

      {newBranchOpen && (
        <Modal title={`New branch from ${branchName}`} onClose={() => setNewBranchOpen(false)}>
          <input
            autoFocus
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitNewBranch()
              if (e.key === 'Escape') setNewBranchOpen(false)
            }}
            placeholder="new-branch-name"
            className="w-full px-2 py-1.5 bg-bg-subtle border border-line rounded text-sm focus:outline-none focus:border-accent"
          />
          <ModalActions
            onCancel={() => setNewBranchOpen(false)}
            onSubmit={submitNewBranch}
            submitLabel="Create & checkout"
          />
        </Modal>
      )}

      {stashOpen && (
        <StashDialog
          files={changedFiles}
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
            setStashSelected((prev) =>
              prev.size === changedFiles.length
                ? new Set()
                : new Set(changedFiles.map((f) => f.path))
            )
          }
          onMessageChange={setStashMessage}
          onConfirm={submitStash}
          onCancel={() => setStashOpen(false)}
        />
      )}
    </div>
  )
}

interface ToolIconButtonProps {
  onClick: () => void | Promise<void>
  icon: JSX.Element
  title: string
  disabled?: boolean
  primary?: boolean
}
function ToolIconButton({
  onClick,
  icon,
  title,
  disabled,
  primary
}: ToolIconButtonProps): JSX.Element {
  const cls = primary
    ? 'bg-accent hover:bg-accent-hover text-white'
    : 'bg-bg-panel hover:bg-line text-text'
  return (
    <button
      onClick={() => void onClick()}
      disabled={disabled}
      title={title}
      className={'p-1.5 rounded-md disabled:opacity-40 ' + cls}
    >
      {icon}
    </button>
  )
}

function Divider(): JSX.Element {
  return <div className="w-px h-5 bg-line mx-0.5" />
}

interface PopoverProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  trigger: JSX.Element
  content: JSX.Element
}

function Popover({ open, onOpenChange, trigger, content }: PopoverProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) onOpenChange(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, onOpenChange])
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => onOpenChange(!open)}>{trigger}</div>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-bg-panel border border-line rounded-md shadow-xl z-40">
          {content}
        </div>
      )}
    </div>
  )
}

interface ModalProps {
  title: string
  onClose: () => void
  children: React.ReactNode
}

function Modal({ title, onClose, children }: ModalProps): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-bg-panel border border-line rounded-md p-4 w-96 shadow-xl titlebar-nodrag"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold mb-3">{title}</div>
        {children}
      </div>
    </div>
  )
}

interface ModalActionsProps {
  onCancel: () => void
  onSubmit: () => void | Promise<void>
  submitLabel: string
}

function ModalActions({ onCancel, onSubmit, submitLabel }: ModalActionsProps): JSX.Element {
  return (
    <div className="mt-4 flex justify-end gap-2">
      <button
        onClick={onCancel}
        className="px-3 py-1.5 rounded bg-bg-subtle hover:bg-line text-sm"
      >
        Cancel
      </button>
      <button
        onClick={() => void onSubmit()}
        className="px-3 py-1.5 rounded bg-accent hover:bg-accent-hover text-white text-sm"
      >
        {submitLabel}
      </button>
    </div>
  )
}

interface StashDialogProps {
  files: FileEntry[]
  selected: Set<string>
  message: string
  onToggleFile: (path: string) => void
  onToggleAll: () => void
  onMessageChange: (v: string) => void
  onConfirm: () => void
  onCancel: () => void
}

function changeBadge(entry: FileEntry): { label: string; cls: string } {
  switch (entry.changeType) {
    case 'added': return { label: 'A', cls: 'text-success' }
    case 'modified': return { label: 'M', cls: 'text-accent' }
    case 'deleted': return { label: 'D', cls: 'text-danger' }
    case 'renamed': return { label: 'R', cls: 'text-warn' }
    case 'copied': return { label: 'C', cls: 'text-warn' }
    case 'untracked': return { label: '?', cls: 'text-muted' }
    default: return { label: ' ', cls: 'text-muted' }
  }
}

function StashDialog({
  files,
  selected,
  message,
  onToggleFile,
  onToggleAll,
  onMessageChange,
  onConfirm,
  onCancel
}: StashDialogProps): JSX.Element {
  const allSelected = selected.size === files.length && files.length > 0
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
      <div className="relative bg-bg-panel border border-line rounded-lg shadow-2xl w-[420px] max-h-[520px] flex flex-col titlebar-nodrag">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
          <span className="font-semibold text-sm">Stash Changes</span>
          <button onClick={onCancel} className="text-muted hover:text-text text-lg leading-none">✕</button>
        </div>

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
