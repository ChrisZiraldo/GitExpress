import { useEffect, useRef, useState } from 'react'
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
  Maximize2
} from 'lucide-react'
import { useRepo, type MetroViewTab } from '../store/useRepo'

const TABS: { id: MetroViewTab; label: string }[] = [
  { id: 'history', label: 'History' },
  { id: 'flow', label: 'Flow' },
  { id: 'risk', label: 'Risk' },
  { id: 'ownership', label: 'Ownership' }
]

interface TopBarProps {
  onSwitchSimple: () => Promise<void>
}

export function TopBar({ onSwitchSimple }: TopBarProps): JSX.Element {
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
  const [includeUntracked, setIncludeUntracked] = useState(() => {
    try {
      return (
        localStorage.getItem('gitmetro.stashUntracked') === '1' ||
        localStorage.getItem('gitexpress.stashUntracked') === '1' ||
        localStorage.getItem('simplegit.stashUntracked') === '1'
      )
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('gitmetro.stashUntracked', includeUntracked ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [includeUntracked])

  const branch = status?.branch
  const branchName = branch?.detached ? 'DETACHED' : branch?.current ?? '...'

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

  const submitNewBranch = async (): Promise<void> => {
    const name = newBranchName.trim()
    if (!name) return
    setNewBranchOpen(false)
    setNewBranchName('')
    await runWithBusy(`Create branch ${name}`, () =>
      window.git.branch.create(activeRepo!.path, name, { checkout: true })
    )
  }

  const submitStash = async (): Promise<void> => {
    const message = stashMessage.trim()
    setStashOpen(false)
    setStashMessage('')
    await runWithBusy('Stash', () =>
      window.git.stash.push(activeRepo!.path, {
        message: message || undefined,
        includeUntracked
      })
    )
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
            <Divider />
            <ToolIconButton
              onClick={() => setNewBranchOpen(true)}
              disabled={busy}
              title={`New branch from ${branchName}`}
              icon={<GitBranch size={14} />}
            />
            <ToolIconButton
              onClick={() => setStashOpen(true)}
              disabled={busy}
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

        <button
          onClick={onSwitchSimple}
          title="Switch to Simple view"
          className="px-2 py-1 rounded-md bg-bg-panel hover:bg-line text-xs text-muted hover:text-text border border-line"
        >
          Simple
        </button>
        <span className="px-2 py-1 rounded-md bg-accent text-white text-xs font-medium border border-accent">
          Metro
        </span>
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
        <Modal title="Stash changes" onClose={() => setStashOpen(false)}>
          <input
            autoFocus
            value={stashMessage}
            onChange={(e) => setStashMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitStash()
              if (e.key === 'Escape') setStashOpen(false)
            }}
            placeholder="Stash message (optional)"
            className="w-full px-2 py-1.5 bg-bg-subtle border border-line rounded text-sm focus:outline-none focus:border-accent"
          />
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeUntracked}
              onChange={(e) => setIncludeUntracked(e.target.checked)}
            />
            Include untracked files
          </label>
          <ModalActions
            onCancel={() => setStashOpen(false)}
            onSubmit={submitStash}
            submitLabel="Stash"
          />
        </Modal>
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
