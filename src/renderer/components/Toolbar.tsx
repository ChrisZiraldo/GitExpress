import { useEffect, useRef, useState } from 'react'
import { useRepo } from '../store/useRepo'
import {
  IconBranch,
  IconChevronDown,
  IconFetch,
  IconPop,
  IconPull,
  IconPush,
  IconRepo,
  IconStash
} from './Icons'

export function Toolbar(): JSX.Element {
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

  const [repoMenuOpen, setRepoMenuOpen] = useState(false)
  const [branchMenuOpen, setBranchMenuOpen] = useState(false)
  const [pullMenuOpen, setPullMenuOpen] = useState(false)
  const [newBranchOpen, setNewBranchOpen] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [stashOpen, setStashOpen] = useState(false)
  const [stashMessage, setStashMessage] = useState('')
  const [includeUntracked, setIncludeUntracked] = useState(() => {
    try {
      return localStorage.getItem('simplegit.stashUntracked') === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('simplegit.stashUntracked', includeUntracked ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [includeUntracked])

  if (!activeRepo) {
    return (
      <div className="titlebar-drag h-11 bg-bg-subtle border-b border-line flex items-center px-4 text-xs text-muted">
        <span className="font-semibold text-text">SimpleGit</span>
      </div>
    )
  }

  const branch = status?.branch
  const branchName = branch?.detached ? 'DETACHED' : branch?.current ?? '...'

  const localBranches = refs.local

  const runWithBusy = async (
    label: string,
    fn: () => Promise<{ ok: true } | { ok: false; stderr: string }>
  ): Promise<void> => {
    if (busy) return
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
    if (!res.ok) {
      pushToast('error', res.stderr)
      return
    }
    if (!res.data) return
    setActiveRepo(res.data)
    const r = await window.git.repo.recents()
    if (r.ok) setRecents(r.data)
  }

  const openExisting = async (path: string): Promise<void> => {
    setRepoMenuOpen(false)
    const res = await window.git.repo.open(path)
    if (!res.ok) {
      pushToast('error', res.stderr)
      const r = await window.git.repo.recents()
      if (r.ok) setRecents(r.data)
      return
    }
    setActiveRepo(res.data)
    const r = await window.git.repo.recents()
    if (r.ok) setRecents(r.data)
  }

  const fetchAll = (): Promise<void> =>
    runWithBusy('Fetch', () => window.git.remote.fetch(activeRepo.path))

  const pull = (rebase: boolean): Promise<void> =>
    runWithBusy(rebase ? 'Pull (rebase)' : 'Pull', () =>
      window.git.remote.pull(activeRepo.path, { rebase })
    )

  const push = (): Promise<void> =>
    runWithBusy('Push', () => window.git.remote.push(activeRepo.path, {}))

  const checkout = async (name: string): Promise<void> => {
    setBranchMenuOpen(false)
    await runWithBusy(`Checkout ${name}`, () =>
      window.git.branch.checkout(activeRepo.path, name)
    )
  }

  const submitNewBranch = async (): Promise<void> => {
    const name = newBranchName.trim()
    if (!name) return
    setNewBranchOpen(false)
    setNewBranchName('')
    await runWithBusy(`Create branch ${name}`, () =>
      window.git.branch.create(activeRepo.path, name, { checkout: true })
    )
  }

  const submitStash = async (): Promise<void> => {
    const message = stashMessage.trim()
    setStashOpen(false)
    setStashMessage('')
    await runWithBusy('Stash', () =>
      window.git.stash.push(activeRepo.path, {
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
    await runWithBusy('Pop stash', () =>
      window.git.stash.pop(activeRepo.path, 0)
    )
  }

  return (
    <div className="titlebar-drag h-11 bg-bg-subtle border-b border-line flex items-center px-3 gap-2">
      <span className="font-semibold text-text text-sm pr-2 mr-1 border-r border-line">
        SimpleGit
      </span>

      <Popover
        open={repoMenuOpen}
        onOpenChange={setRepoMenuOpen}
        trigger={
          <button className="titlebar-nodrag px-2 py-1.5 rounded-md bg-bg-panel hover:bg-line text-sm flex items-center gap-2 max-w-[260px]">
            <IconRepo size={14} className="shrink-0" />
            <span className="truncate font-medium">{activeRepo.name}</span>
            <IconChevronDown />
          </button>
        }
        content={
          <div className="w-72 max-h-80 overflow-y-auto">
            <button
              onClick={openPicker}
              className="w-full text-left px-3 py-2 hover:bg-line text-sm border-b border-line"
            >
              Open repository...
            </button>
            {recents.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted">No recent repositories.</div>
            ) : (
              <>
                <div className="px-3 pt-2 pb-1 text-xs uppercase tracking-wide text-muted">
                  Recent
                </div>
                {recents.map((r) => (
                  <button
                    key={r.path}
                    onClick={() => openExisting(r.path)}
                    className={
                      'block w-full text-left px-3 py-1.5 hover:bg-line text-sm ' +
                      (r.path === activeRepo.path ? 'text-accent' : '')
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

      <Popover
        open={branchMenuOpen}
        onOpenChange={setBranchMenuOpen}
        trigger={
          <button className="titlebar-nodrag px-2 py-1.5 rounded-md bg-bg-panel hover:bg-line text-sm flex items-center gap-2">
            <IconBranch size={14} />
            <span className="font-medium truncate max-w-[160px]">{branchName}</span>
            {(branch?.ahead ?? 0) > 0 && (
              <span className="text-xs text-success">↑{branch?.ahead}</span>
            )}
            {(branch?.behind ?? 0) > 0 && (
              <span className="text-xs text-warn">↓{branch?.behind}</span>
            )}
            <IconChevronDown />
          </button>
        }
        content={
          <div className="w-72 max-h-80 overflow-y-auto">
            {localBranches.length === 0 ? (
              <div className="px-3 py-3 text-sm text-muted">No local branches</div>
            ) : (
              localBranches.map((b) => (
                <button
                  key={b.fullName}
                  onClick={() => checkout(b.name)}
                  className={
                    'block w-full text-left px-3 py-1.5 hover:bg-line text-sm flex justify-between ' +
                    (b.current ? 'text-accent' : 'text-text')
                  }
                >
                  <span className="truncate">{b.name}</span>
                  {b.upstream && (
                    <span className="text-xs text-muted ml-2 truncate">{b.upstream}</span>
                  )}
                </button>
              ))
            )}
          </div>
        }
      />

      <div className="ml-auto flex items-center gap-1 titlebar-nodrag">
        <ToolButton onClick={fetchAll} disabled={busy} icon={<IconFetch />} label="Fetch" />
        <SplitButton
          disabled={busy}
          icon={<IconPull />}
          label="Pull"
          onClick={() => pull(false)}
          open={pullMenuOpen}
          setOpen={setPullMenuOpen}
          menuItems={[
            { label: 'Pull (FF only)', onClick: () => pull(false) },
            { label: 'Pull with rebase', onClick: () => pull(true) }
          ]}
        />
        <ToolButton onClick={push} disabled={busy} icon={<IconPush />} label="Push" primary />
        <Divider />
        <ToolButton
          onClick={() => setNewBranchOpen(true)}
          disabled={busy}
          icon={<IconBranch />}
          label="Branch"
        />
        <ToolButton
          onClick={() => setStashOpen(true)}
          disabled={busy}
          icon={<IconStash />}
          label="Stash"
        />
        <ToolButton
          onClick={popStash}
          disabled={busy || stashes.length === 0}
          icon={<IconPop />}
          label="Pop"
        />
      </div>

      {newBranchOpen && (
        <Modal title="New branch" onClose={() => setNewBranchOpen(false)}>
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
          <div className="mt-2 text-xs text-muted">
            Creates a branch from the current HEAD and checks it out.
          </div>
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

interface ToolButtonProps {
  onClick: () => void | Promise<void>
  icon: JSX.Element
  label: string
  disabled?: boolean
  primary?: boolean
}

function ToolButton({ onClick, icon, label, disabled, primary }: ToolButtonProps): JSX.Element {
  const base = 'px-2.5 py-1.5 rounded-md text-sm flex items-center gap-1.5 disabled:opacity-50 '
  const cls = primary
    ? 'bg-accent hover:bg-accent-hover text-white'
    : 'bg-bg-panel hover:bg-line text-text'
  return (
    <button onClick={() => void onClick()} disabled={disabled} className={base + cls}>
      {icon}
      <span>{label}</span>
    </button>
  )
}

interface SplitButtonProps {
  onClick: () => void | Promise<void>
  icon: JSX.Element
  label: string
  disabled?: boolean
  open: boolean
  setOpen: (v: boolean) => void
  menuItems: { label: string; onClick: () => void | Promise<void> }[]
}

function SplitButton({
  onClick,
  icon,
  label,
  disabled,
  open,
  setOpen,
  menuItems
}: SplitButtonProps): JSX.Element {
  return (
    <div className="relative flex">
      <button
        onClick={() => void onClick()}
        disabled={disabled}
        className="px-2.5 py-1.5 rounded-l-md bg-bg-panel hover:bg-line text-sm flex items-center gap-1.5 disabled:opacity-50"
      >
        {icon}
        <span>{label}</span>
      </button>
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className="px-1.5 py-1.5 rounded-r-md bg-bg-panel hover:bg-line text-sm border-l border-line disabled:opacity-50"
      >
        <IconChevronDown />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-1 w-48 bg-bg-panel border border-line rounded-md shadow-xl z-40">
            {menuItems.map((item, i) => (
              <button
                key={i}
                onClick={() => {
                  setOpen(false)
                  void item.onClick()
                }}
                className="block w-full text-left px-3 py-1.5 hover:bg-line text-sm"
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Divider(): JSX.Element {
  return <div className="w-px h-6 bg-line mx-1" />
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
