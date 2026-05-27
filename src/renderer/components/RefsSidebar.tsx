import { useMemo, useState } from 'react'
import type { Ref, Stash, StashFileEntry } from '@shared/types'
import { useRepo } from '../store/useRepo'
import { IconChevronDown, IconChevronRight, IconStash } from './Icons'
import { ContextMenu, type MenuItem } from './ContextMenu'

export function RefsSidebar(): JSX.Element {
  const activeRepo = useRepo((s) => s.activeRepo)
  const status = useRepo((s) => s.status)
  const refs = useRepo((s) => s.refs)
  const stashes = useRepo((s) => s.stashes)
  const busy = useRepo((s) => s.busy)
  const selectedCommit = useRepo((s) => s.selectedCommit)
  const setSelectedCommit = useRepo((s) => s.setSelectedCommit)
  const setStashView = useRepo((s) => s.setStashView)
  const setBusy = useRepo((s) => s.setBusy)
  const pushToast = useRepo((s) => s.pushToast)
  const refreshSignal = useRepo((s) => s.refreshSignal)

  const [localOpen, setLocalOpen] = useState(true)
  const [remoteOpen, setRemoteOpen] = useState(false)
  const [stashOpen, setStashOpen] = useState(true)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [tagDeleteConfirm, setTagDeleteConfirm] = useState<string | null>(null)

  const wipCount = useMemo(() => {
    if (!status) return 0
    return (
      status.staged.length +
      status.unstaged.length +
      status.untracked.length +
      status.conflicted.length
    )
  }, [status])

  if (!activeRepo) return <></>

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

  const checkoutLocal = (name: string): Promise<void> =>
    runWithBusy(`Checkout ${name}`, () =>
      window.git.branch.checkout(activeRepo.path, name)
    )

  const checkoutRemote = (name: string): Promise<void> =>
    runWithBusy(`Checkout ${name}`, () =>
      window.git.branch.checkoutRemote(activeRepo.path, name)
    )

  const onLocalContext = (e: React.MouseEvent, ref: Ref): void => {
    e.preventDefault()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: 'Checkout',
          onClick: () => checkoutLocal(ref.name),
          disabled: !!ref.current
        },
        {
          label: 'Copy name',
          onClick: () => {
            navigator.clipboard?.writeText(ref.name)
            pushToast('success', 'Name copied')
          }
        }
      ]
    })
  }

  const onRemoteContext = (e: React.MouseEvent, ref: Ref): void => {
    e.preventDefault()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: 'Checkout as new local branch',
          onClick: () => checkoutRemote(ref.name)
        },
        {
          label: 'Copy name',
          onClick: () => {
            navigator.clipboard?.writeText(ref.name)
            pushToast('success', 'Name copied')
          }
        }
      ]
    })
  }

  const popStash = (idx: number): Promise<void> =>
    runWithBusy(`Pop stash@{${idx}}`, () =>
      window.git.stash.pop(activeRepo.path, idx)
    )
  const applyStash = (idx: number): Promise<void> =>
    runWithBusy(`Apply stash@{${idx}}`, () =>
      window.git.stash.apply(activeRepo.path, idx)
    )
  const dropStash = (idx: number): Promise<void> =>
    runWithBusy(`Drop stash@{${idx}}`, () =>
      window.git.stash.drop(activeRepo.path, idx)
    )

  const checkoutTag = (hash: string): Promise<void> =>
    runWithBusy('Checkout tag', () =>
      window.git.branch.checkoutDetached(activeRepo.path, hash)
    )

  const handleDeleteTag = async (name: string): Promise<void> => {
    if (tagDeleteConfirm !== name) {
      setTagDeleteConfirm(name)
      setTimeout(() => setTagDeleteConfirm((c) => (c === name ? null : c)), 3000)
      return
    }
    setTagDeleteConfirm(null)
    await runWithBusy(`Delete tag ${name}`, () =>
      window.git.tag.delete(activeRepo.path, name)
    )
  }

  const onTagContext = (e: React.MouseEvent, ref: Ref): void => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Checkout (detached)', onClick: () => checkoutTag(ref.hash) },
        {
          label: 'Copy name',
          onClick: () => {
            navigator.clipboard?.writeText(ref.name)
            pushToast('success', 'Name copied')
          }
        },
        { type: 'separator' },
        {
          label: tagDeleteConfirm === ref.name ? 'Confirm delete?' : 'Delete tag',
          danger: true,
          onClick: () => handleDeleteTag(ref.name)
        }
      ]
    })
  }

  const remoteGroups = useMemo(() => {
    const groups = new Map<string, Ref[]>()
    for (const r of refs.remote) {
      const slash = r.name.indexOf('/')
      const remoteName = slash > 0 ? r.name.slice(0, slash) : 'origin'
      const list = groups.get(remoteName) ?? []
      list.push(r)
      groups.set(remoteName, list)
    }
    return Array.from(groups.entries())
  }, [refs.remote])

  return (
    <aside className="w-[260px] min-w-[220px] bg-bg-subtle border-r border-line flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div
          onClick={() => setSelectedCommit(null)}
          className={
            'cursor-pointer px-3 py-2 border-b border-line flex items-center justify-between ' +
            (selectedCommit === null ? 'bg-accent/20' : 'hover:bg-bg-panel')
          }
        >
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium">Working copy</span>
            <span className="text-xs text-muted">
              {wipCount === 0 ? 'clean' : `${wipCount} change${wipCount === 1 ? '' : 's'}`}
            </span>
          </div>
          {wipCount > 0 && (
            <span className="px-1.5 py-0.5 rounded text-xs bg-warn/20 text-warn">
              {wipCount}
            </span>
          )}
        </div>

        <Section
          title="Local"
          open={localOpen}
          onToggle={() => setLocalOpen((v) => !v)}
          count={refs.local.length}
        >
          {refs.local.length === 0 ? (
            <Empty text="No local branches" />
          ) : (
            refs.local.map((r) => (
              <BranchRow
                key={r.fullName}
                refData={r}
                onClick={() => checkoutLocal(r.name)}
                onDoubleClick={() => checkoutLocal(r.name)}
                onContextMenu={(e) => onLocalContext(e, r)}
                hoverActionLabel={!r.current ? 'Checkout' : undefined}
                onHoverAction={!r.current ? () => checkoutLocal(r.name) : undefined}
              />
            ))
          )}
        </Section>

        <Section
          title="Remote"
          open={remoteOpen}
          onToggle={() => setRemoteOpen((v) => !v)}
          count={refs.remote.length}
        >
          {remoteGroups.length === 0 ? (
            <Empty text="No remotes" />
          ) : (
            remoteGroups.map(([remoteName, remoteRefs]) => (
              <div key={remoteName}>
                <div className="px-3 py-1 text-xs uppercase tracking-wide text-muted">
                  {remoteName}
                </div>
                {remoteRefs.map((r) => (
                  <BranchRow
                    key={r.fullName}
                    refData={r}
                    onClick={() => undefined}
                    onDoubleClick={() => checkoutRemote(r.name)}
                    onContextMenu={(e) => onRemoteContext(e, r)}
                    hoverActionLabel="Checkout"
                    onHoverAction={() => checkoutRemote(r.name)}
                    displayName={r.name.slice(remoteName.length + 1)}
                  />
                ))}
              </div>
            ))
          )}
        </Section>

        <Section
          title="Stashes"
          open={stashOpen}
          onToggle={() => setStashOpen((v) => !v)}
          count={stashes.length}
        >
          {stashes.length === 0 ? (
            <Empty text="No stashes" />
          ) : (
            stashes.map((s) => (
              <AdvancedStashRow
                key={s.index}
                stash={s}
                cwd={activeRepo.path}
                onPop={() => popStash(s.index)}
                onApply={() => applyStash(s.index)}
                onDrop={() => dropStash(s.index)}
                onSelectFile={(path) => setStashView({ stashIndex: s.index, filePath: path })}
                onApplyFile={async (path) => {
                  const res = await window.git.stash.applyFile(activeRepo.path, s.index, path)
                  if (res.ok) {
                    pushToast('success', `Applied ${path} from stash`)
                    refreshSignal()
                  } else {
                    pushToast('error', `Apply failed: ${res.stderr}`)
                  }
                }}
              />
            ))
          )}
        </Section>

        <Section
          title="Tags"
          open={tagsOpen}
          onToggle={() => setTagsOpen((v) => !v)}
          count={refs.tags.length}
        >
          {refs.tags.length === 0 ? (
            <Empty text="No tags" />
          ) : (
            refs.tags.map((t) => (
              <div
                key={t.fullName}
                onDoubleClick={() => checkoutTag(t.hash)}
                onContextMenu={(e) => onTagContext(e, t)}
                className="group px-3 py-1 hover:bg-bg-panel cursor-pointer flex items-center gap-2"
                title={t.fullName}
              >
                <span className="text-xs font-mono px-1 rounded bg-warn/20 text-warn shrink-0">tag</span>
                <span className="truncate text-sm flex-1">{t.name}</span>
                <div className="opacity-0 group-hover:opacity-100 flex gap-1 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); void checkoutTag(t.hash) }}
                    className="text-xs text-accent hover:text-accent-hover"
                  >
                    Checkout
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); void handleDeleteTag(t.name) }}
                    className={
                      'text-xs ' +
                      (tagDeleteConfirm === t.name
                        ? 'text-danger font-semibold animate-pulse'
                        : 'text-muted hover:text-danger')
                    }
                    title={tagDeleteConfirm === t.name ? 'Click again to confirm' : 'Delete tag'}
                  >
                    {tagDeleteConfirm === t.name ? 'Confirm?' : '✕'}
                  </button>
                </div>
              </div>
            ))
          )}
        </Section>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
    </aside>
  )
}

interface SectionProps {
  title: string
  open: boolean
  onToggle: () => void
  count: number
  children: React.ReactNode
}

function Section({ title, open, onToggle, count, children }: SectionProps): JSX.Element {
  return (
    <div className="border-b border-line">
      <button
        onClick={onToggle}
        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-bg-panel"
      >
        <div className="flex items-center gap-1.5">
          {open ? <IconChevronDown /> : <IconChevronRight />}
          <span className="text-xs uppercase tracking-wide text-muted">{title}</span>
        </div>
        <span className="text-xs text-muted">{count}</span>
      </button>
      {open && <div className="pb-1">{children}</div>}
    </div>
  )
}

interface BranchRowProps {
  refData: Ref
  onClick: () => void
  onDoubleClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  hoverActionLabel?: string
  onHoverAction?: () => void
  displayName?: string
}

function BranchRow({
  refData,
  onClick,
  onDoubleClick,
  onContextMenu,
  hoverActionLabel,
  onHoverAction,
  displayName
}: BranchRowProps): JSX.Element {
  const name = displayName ?? refData.name
  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className={
        'group px-3 py-1 hover:bg-bg-panel cursor-pointer flex items-center gap-2 ' +
        (refData.current ? 'text-accent' : 'text-text')
      }
      title={refData.fullName}
    >
      <span
        className="w-1 h-4 rounded shrink-0"
        style={{ backgroundColor: refData.current ? 'currentColor' : 'transparent' }}
      />
      <span className="truncate text-sm flex-1">{name}</span>
      {refData.upstream && !refData.current && (
        <span className="text-xs text-muted truncate max-w-[80px]" title={refData.upstream}>
          {refData.upstream}
        </span>
      )}
      {hoverActionLabel && onHoverAction && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onHoverAction()
          }}
          className="opacity-0 group-hover:opacity-100 text-xs text-accent hover:text-accent-hover shrink-0"
        >
          {hoverActionLabel}
        </button>
      )}
    </div>
  )
}

function Empty({ text }: { text: string }): JSX.Element {
  return <div className="px-3 py-2 text-xs text-muted italic">{text}</div>
}

interface AdvancedStashRowProps {
  stash: Stash
  cwd: string
  onPop: () => void
  onApply: () => void
  onDrop: () => void
  onSelectFile: (path: string) => void
  onApplyFile: (path: string) => Promise<void>
}

function AdvancedStashRow({
  stash, cwd, onPop, onApply, onDrop, onSelectFile, onApplyFile
}: AdvancedStashRowProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [files, setFiles] = useState<StashFileEntry[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [fileCtxMenu, setFileCtxMenu] = useState<{ x: number; y: number; path: string } | null>(null)
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number } | null>(null)

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
    <div className="border-b border-line/40 last:border-b-0">
      {/* Header */}
      <div
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setRowMenu({ x: e.clientX, y: e.clientY }) }}
        className="group px-2 py-1.5 hover:bg-bg-panel cursor-default flex items-center gap-1.5"
        title={`stash@{${stash.index}} · ${stash.relativeDate}`}
      >
        <button onClick={toggleExpand} className="text-muted hover:text-text text-xs shrink-0 w-3">
          {expanded ? '▾' : '▸'}
        </button>
        <IconStash size={11} className="shrink-0 text-muted" />
        <div className="min-w-0 flex-1 cursor-pointer" onClick={toggleExpand}>
          <div className="truncate text-sm">{stash.message || `stash@{${stash.index}}`}</div>
          <div className="text-xs text-muted truncate">
            {stash.branch ? `on ${stash.branch} · ` : ''}{stash.relativeDate}
          </div>
        </div>
        <div className="opacity-0 group-hover:opacity-100 flex gap-1 shrink-0">
          <button onClick={onPop} className="text-xs text-accent hover:text-accent-hover">Pop</button>
          <button onClick={onDrop} className="text-xs text-danger hover:opacity-80">Drop</button>
        </div>
      </div>

      {/* File list */}
      {expanded && (
        <div className="pb-1">
          {filesLoading ? (
            <div className="pl-8 py-1 text-xs text-muted italic">Loading...</div>
          ) : files.length === 0 ? (
            <div className="pl-8 py-1 text-xs text-muted italic">No files</div>
          ) : (
            files.map((f) => {
              const badge = statusBadge(f.status)
              return (
                <div
                  key={f.path}
                  onClick={() => { setActiveFile(f.path); onSelectFile(f.path) }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setFileCtxMenu({ x: e.clientX, y: e.clientY, path: f.path })
                  }}
                  className={
                    'flex items-center gap-1.5 pl-8 pr-2 py-0.5 text-xs cursor-pointer ' +
                    (activeFile === f.path ? 'bg-accent/20' : 'hover:bg-bg-panel')
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

      {/* Row context menu */}
      {rowMenu && (
        <ContextMenu
          x={rowMenu.x}
          y={rowMenu.y}
          items={[
            { label: 'Pop', onClick: onPop },
            { label: 'Apply', onClick: onApply },
            { type: 'separator' },
            { label: 'Drop', onClick: onDrop, danger: true }
          ]}
          onClose={() => setRowMenu(null)}
        />
      )}

      {/* File context menu */}
      {fileCtxMenu && (
        <ContextMenu
          x={fileCtxMenu.x}
          y={fileCtxMenu.y}
          items={[
            {
              label: 'Apply this file to working tree',
              onClick: () => { void onApplyFile(fileCtxMenu.path); setFileCtxMenu(null) }
            },
            { type: 'separator' },
            {
              label: 'Copy file path',
              onClick: () => navigator.clipboard.writeText(fileCtxMenu.path)
            }
          ]}
          onClose={() => setFileCtxMenu(null)}
        />
      )}
    </div>
  )
}
