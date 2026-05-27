import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  Flag,
  TramFront,
  CheckCircle2,
  XCircle,
  TriangleAlert,
  GitMerge,
  GitPullRequest,
  EyeOff,
  Map as MapIcon,
  LayoutGrid,
  Clock,
  Folder,
  Github,
  Archive
} from 'lucide-react'
import type { Ref, Stash, StashFileEntry } from '@shared/types'
import { useRepo } from '../store/useRepo'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { laneColor } from './metro/colors'

const MIN_WIDTH = 220
const MAX_WIDTH = 480
const DEFAULT_WIDTH = 280

type SidebarSection = 'repo' | 'branches' | 'filters' | 'viewModes' | 'legend' | 'stashes' | 'tags'

interface BranchLineStatus {
  ref: Ref
  laneIndex: number
  color: string
  commitCount: number
  status: 'passing' | 'open-pr' | 'stale' | 'conflict' | 'failing' | 'neutral'
}

export function RefsSidebar(): JSX.Element {
  const activeRepo = useRepo((s) => s.activeRepo)
  const status = useRepo((s) => s.status)
  const refs = useRepo((s) => s.refs)
  const graph = useRepo((s) => s.graph)
  const stashes = useRepo((s) => s.stashes)
  const busy = useRepo((s) => s.busy)
  const selectedCommit = useRepo((s) => s.selectedCommit)
  const setSelectedCommit = useRepo((s) => s.setSelectedCommit)
  const setStashView = useRepo((s) => s.setStashView)
  const setBusy = useRepo((s) => s.setBusy)
  const pushToast = useRepo((s) => s.pushToast)
  const refreshSignal = useRepo((s) => s.refreshSignal)
  const highlightedBranchId = useRepo((s) => s.highlightedBranchId)
  const setHighlightedBranchId = useRepo((s) => s.setHighlightedBranchId)
  const metroFilters = useRepo((s) => s.metroFilters)
  const setMetroFilters = useRepo((s) => s.setMetroFilters)

  // Resize
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.startX
      setSidebarWidth(
        Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, dragRef.current.startWidth + dx))
      )
    }
    const onUp = (): void => {
      dragRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const startDrag = (e: React.MouseEvent): void => {
    dragRef.current = { startX: e.clientX, startWidth: sidebarWidth }
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
  }

  const [open, setOpen] = useState<Record<SidebarSection, boolean>>({
    repo: true,
    branches: true,
    filters: false,
    viewModes: false,
    legend: false,
    stashes: true,
    tags: false
  })
  const toggle = (key: SidebarSection): void =>
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }))

  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [tagDeleteConfirm, setTagDeleteConfirm] = useState<string | null>(null)
  const [checkoutConfirm, setCheckoutConfirm] = useState<{
    label: string
    action: () => Promise<void>
  } | null>(null)

  const wipCount = useMemo(() => {
    if (!status) return 0
    return (
      status.staged.length +
      status.unstaged.length +
      status.untracked.length +
      status.conflicted.length
    )
  }, [status])

  // Compute branch lines with derived status
  const branchLines: BranchLineStatus[] = useMemo(() => {
    if (!graph.length) return []
    // Estimate lane index per local branch by finding the row of the branch tip
    const tipToRow = new Map<string, number>()
    graph.forEach((c, i) => {
      if (!tipToRow.has(c.hash)) tipToRow.set(c.hash, i)
    })
    return refs.local.map((r, idx) => {
      const laneIndex = idx // lane fallback: ordinal — used only for color hint
      const color = laneColor(laneIndex)
      // Naive commit count for now: commits where the branch's tip is found ahead-of-main
      const commitCount = graph.length > 0 ? Math.max(1, Math.min(20, graph.length - (tipToRow.get(r.hash) ?? 0))) : 0
      let st: BranchLineStatus['status'] = 'neutral'
      if (r.current) st = 'passing'
      else if (r.upstream) st = 'open-pr'
      return { ref: r, laneIndex, color, commitCount, status: st }
    })
  }, [refs.local, graph])

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

  const doCheckoutLocal = (name: string): Promise<void> =>
    runWithBusy(`Checkout ${name}`, () =>
      window.git.branch.checkout(activeRepo.path, name)
    )
  const doCheckoutRemote = (name: string): Promise<void> =>
    runWithBusy(`Checkout ${name}`, () =>
      window.git.branch.checkoutRemote(activeRepo.path, name)
    )
  const checkoutLocal = (ref: { name: string; current?: boolean }): void => {
    if (ref.current) return
    if (wipCount > 0) {
      setCheckoutConfirm({ label: ref.name, action: () => doCheckoutLocal(ref.name) })
    } else {
      void doCheckoutLocal(ref.name)
    }
  }
  const checkoutRemote = (name: string): void => {
    if (wipCount > 0) {
      setCheckoutConfirm({ label: name, action: () => doCheckoutRemote(name) })
    } else {
      void doCheckoutRemote(name)
    }
  }

  const onBranchLineContext = (e: React.MouseEvent, ref: Ref): void => {
    e.preventDefault()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Checkout', onClick: () => checkoutLocal(ref), disabled: !!ref.current },
        { label: 'Highlight on map', onClick: () => setHighlightedBranchId(ref.fullName) },
        { label: 'Clear highlight', onClick: () => setHighlightedBranchId(null), disabled: highlightedBranchId !== ref.fullName },
        { type: 'separator' },
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

  const onLineClick = (ref: Ref): void => {
    // Click toggles highlight (sidebar interaction). Double-click checks out.
    if (highlightedBranchId === ref.fullName) setHighlightedBranchId(null)
    else setHighlightedBranchId(ref.fullName)
  }

  const popStash = (idx: number): Promise<void> =>
    runWithBusy(`Pop stash@{${idx}}`, () => window.git.stash.pop(activeRepo.path, idx))
  const applyStash = (idx: number): Promise<void> =>
    runWithBusy(`Apply stash@{${idx}}`, () => window.git.stash.apply(activeRepo.path, idx))
  const dropStash = (idx: number): Promise<void> =>
    runWithBusy(`Drop stash@{${idx}}`, () => window.git.stash.drop(activeRepo.path, idx))

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

  const repoHost = activeRepo.path.split('/').slice(-2).join('/')

  return (
    <aside
      className="bg-bg-subtle border-r border-line flex flex-row shrink-0"
      style={{ width: sidebarWidth }}
    >
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {/* Repository */}
          <Section
            title="Repository"
            open={open.repo}
            onToggle={() => toggle('repo')}
          >
            <div className="px-3 py-2 flex items-start gap-2">
              <div className="w-7 h-7 rounded bg-accent/10 border border-accent/30 text-accent flex items-center justify-center shrink-0">
                <Folder size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate" title={activeRepo.path}>
                  {activeRepo.name}
                </div>
                <div className="text-[11px] text-muted truncate" title={activeRepo.path}>
                  {repoHost}
                </div>
              </div>
            </div>
          </Section>

          {/* Working copy / WIP node */}
          <div
            onClick={() => setSelectedCommit(null)}
            className={
              'cursor-pointer px-3 py-2 border-b border-line flex items-center justify-between ' +
              (selectedCommit === null ? 'bg-accent/15' : 'hover:bg-bg-panel')
            }
          >
            <div className="flex items-center gap-2 min-w-0">
              <CircleDot size={14} className={wipCount > 0 ? 'text-warn' : 'text-success'} />
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium">//WIP</span>
                <span className="text-[11px] text-muted">
                  {wipCount === 0 ? 'working tree clean' : `${wipCount} uncommitted change${wipCount === 1 ? '' : 's'}`}
                </span>
              </div>
            </div>
            {wipCount > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-warn/20 text-warn font-mono">
                {wipCount}
              </span>
            )}
          </div>

          {/* Branch Lines */}
          <Section
            title="Branch Lines"
            open={open.branches}
            onToggle={() => toggle('branches')}
            count={branchLines.length}
          >
            {branchLines.length === 0 ? (
              <Empty text="No local branches" />
            ) : (
              branchLines.map((line) => (
                <BranchLineRow
                  key={line.ref.fullName}
                  line={line}
                  highlighted={highlightedBranchId === line.ref.fullName}
                  anyHighlighted={highlightedBranchId !== null}
                  onClick={() => onLineClick(line.ref)}
                  onDoubleClick={() => checkoutLocal(line.ref)}
                  onContextMenu={(e) => onBranchLineContext(e, line.ref)}
                  onCheckout={() => checkoutLocal(line.ref)}
                />
              ))
            )}

            {refs.remote.length > 0 && (
              <div className="pt-1 pb-2 border-t border-line/60 mt-1">
                <div className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-wide text-muted">
                  Remote
                </div>
                {refs.remote.map((r, idx) => {
                  const localName = r.name.includes('/') ? r.name.slice(r.name.indexOf('/') + 1) : r.name
                  return (
                    <RemoteRow
                      key={r.fullName}
                      refData={r}
                      color={laneColor(idx + branchLines.length)}
                      displayName={localName}
                      onCheckout={() => checkoutRemote(r.name)}
                    />
                  )
                })}
              </div>
            )}
          </Section>

          {/* Filters */}
          <Section
            title="Filters"
            open={open.filters}
            onToggle={() => toggle('filters')}
          >
            <ToggleRow
              label="Show merged"
              checked={metroFilters.showMerged}
              onChange={(v) => setMetroFilters({ showMerged: v })}
            />
            <ToggleRow
              label="Show stale"
              checked={metroFilters.showStale}
              onChange={(v) => setMetroFilters({ showStale: v })}
            />
            <PlaceholderDropdown label="CI Status" placeholder="All" />
            <PlaceholderDropdown label="Author" placeholder="All" />
            <PlaceholderDropdown label="Date Range" placeholder="All time" />
          </Section>

          {/* View Modes */}
          <Section
            title="View Modes"
            open={open.viewModes}
            onToggle={() => toggle('viewModes')}
          >
            <div className="flex items-center gap-1 px-3 py-1.5">
              <ViewModeButton icon={<MapIcon size={14} />} label="Map" active />
              <ViewModeButton icon={<LayoutGrid size={14} />} label="Schematic" />
              <ViewModeButton icon={<Clock size={14} />} label="Timeline" />
            </div>
          </Section>

          {/* Legend */}
          <Section
            title="Legend"
            open={open.legend}
            onToggle={() => toggle('legend')}
          >
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 px-3 py-2 text-[11px] text-muted">
              <LegendItem icon={<Circle size={11} className="text-accent" />} label="Commit" />
              <LegendItem icon={<GitMerge size={11} className="text-accent" />} label="Interchange" />
              <LegendItem icon={<Flag size={11} className="text-warn" />} label="Tag / Release" />
              <LegendItem icon={<TramFront size={11} className="text-accent" />} label="Open PR" />
              <LegendItem icon={<CheckCircle2 size={11} className="text-success" />} label="CI Passing" />
              <LegendItem icon={<XCircle size={11} className="text-danger" />} label="CI Failing" />
              <LegendItem icon={<TriangleAlert size={11} className="text-warn" />} label="Conflict" />
              <LegendItem icon={<EyeOff size={11} className="text-muted" />} label="Stale" />
            </div>
          </Section>

          {/* Stashes */}
          <Section
            title="Stashes"
            open={open.stashes}
            onToggle={() => toggle('stashes')}
            count={stashes.length}
          >
            {stashes.length === 0 ? (
              <Empty text="No stashes" />
            ) : (
              stashes.map((s) => (
                <StashRow
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

          {/* Tags */}
          <Section
            title="Tags"
            open={open.tags}
            onToggle={() => toggle('tags')}
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
                  <Flag size={11} className="text-warn shrink-0" />
                  <span className="truncate text-sm flex-1 font-mono">{t.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleDeleteTag(t.name)
                    }}
                    className={
                      'opacity-0 group-hover:opacity-100 text-xs ' +
                      (tagDeleteConfirm === t.name
                        ? 'text-danger font-semibold animate-pulse'
                        : 'text-muted hover:text-danger')
                    }
                    title={tagDeleteConfirm === t.name ? 'Click again to confirm' : 'Delete tag'}
                  >
                    {tagDeleteConfirm === t.name ? 'Confirm?' : '✕'}
                  </button>
                </div>
              ))
            )}
          </Section>

          {/* Repo footer link */}
          <div className="px-3 py-3 border-t border-line">
            <button className="w-full px-3 py-2 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-medium flex items-center justify-center gap-2">
              <Github size={13} />
              <span>View on GitHub</span>
            </button>
          </div>
        </div>

        {menu && (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            items={menu.items}
            onClose={() => setMenu(null)}
          />
        )}

        {checkoutConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-bg-panel border border-line rounded-lg shadow-xl p-5 w-[340px] flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold">Checkout with uncommitted changes?</span>
                <span className="text-xs text-muted">
                  You have {wipCount} uncommitted change{wipCount === 1 ? '' : 's'}.
                  Switching to <span className="font-mono text-text">{checkoutConfirm.label}</span> may
                  overwrite or discard them.
                </span>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setCheckoutConfirm(null)}
                  className="px-3 py-1.5 rounded text-sm border border-line hover:bg-bg-subtle"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const action = checkoutConfirm.action
                    setCheckoutConfirm(null)
                    void action()
                  }}
                  className="px-3 py-1.5 rounded text-sm bg-accent text-white hover:bg-accent-hover"
                >
                  Checkout anyway
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={startDrag}
        className="w-1 cursor-ew-resize hover:bg-accent/40 active:bg-accent/60 shrink-0"
        title="Drag to resize"
      />
    </aside>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

interface SectionProps {
  title: string
  open: boolean
  onToggle: () => void
  count?: number
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
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span className="text-[11px] uppercase tracking-wider text-muted font-medium">{title}</span>
        </div>
        {count !== undefined && <span className="text-[11px] text-muted">{count}</span>}
      </button>
      {open && <div className="pb-1.5">{children}</div>}
    </div>
  )
}

interface BranchLineRowProps {
  line: BranchLineStatus
  highlighted: boolean
  anyHighlighted: boolean
  onClick: () => void
  onDoubleClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onCheckout: () => void
}

function BranchLineRow({
  line,
  highlighted,
  anyHighlighted,
  onClick,
  onDoubleClick,
  onContextMenu,
  onCheckout
}: BranchLineRowProps): JSX.Element {
  const { ref, color, commitCount, status } = line
  const dim = anyHighlighted && !highlighted
  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className={
        'group px-3 py-1 cursor-pointer flex items-center gap-2 ' +
        (highlighted ? 'bg-accent/15' : 'hover:bg-bg-panel')
      }
      style={{ opacity: dim ? 0.45 : 1 }}
      title={ref.fullName}
    >
      {/* Color line swatch */}
      <span
        className="w-1 h-5 rounded-sm shrink-0"
        style={{ backgroundColor: color }}
      />
      <span
        className={
          'truncate text-sm flex-1 font-mono text-[12px] ' +
          (ref.current ? 'text-text font-semibold' : 'text-text')
        }
        style={{ color: highlighted ? color : undefined }}
      >
        {ref.name}
      </span>
      <span className="text-[10px] font-mono px-1 rounded bg-bg-panel text-muted shrink-0">
        {commitCount}
      </span>
      <StatusIcon status={status} />
      {!ref.current && (
        <button
          onClick={(e) => { e.stopPropagation(); onCheckout() }}
          className="opacity-0 group-hover:opacity-100 text-[10px] text-accent hover:text-accent-hover shrink-0"
        >
          Checkout
        </button>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: BranchLineStatus['status'] }): JSX.Element {
  switch (status) {
    case 'passing':
      return <CheckCircle2 size={11} className="text-success shrink-0" />
    case 'failing':
      return <XCircle size={11} className="text-danger shrink-0" />
    case 'open-pr':
      return <TramFront size={11} className="text-accent shrink-0" />
    case 'stale':
      return <EyeOff size={11} className="text-muted shrink-0" />
    case 'conflict':
      return <TriangleAlert size={11} className="text-warn shrink-0" />
    default:
      return <Circle size={11} className="text-muted shrink-0" />
  }
}

interface RemoteRowProps {
  refData: Ref
  color: string
  displayName: string
  onCheckout: () => void
}

function RemoteRow({ refData, color, displayName, onCheckout }: RemoteRowProps): JSX.Element {
  return (
    <div
      className="group px-3 py-1 hover:bg-bg-panel cursor-pointer flex items-center gap-2"
      title={refData.fullName}
      onDoubleClick={onCheckout}
    >
      <span
        className="w-1 h-5 rounded-sm shrink-0 opacity-50"
        style={{ backgroundColor: color }}
      />
      <GitPullRequest size={11} className="text-muted shrink-0" />
      <span className="truncate text-[12px] flex-1 font-mono text-muted">{displayName}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onCheckout() }}
        className="opacity-0 group-hover:opacity-100 text-[10px] text-accent hover:text-accent-hover shrink-0"
      >
        Checkout
      </button>
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <label className="flex items-center justify-between gap-2 px-3 py-1 cursor-pointer hover:bg-bg-panel text-[12px]">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={
          'w-7 h-4 rounded-full transition-colors relative ' +
          (checked ? 'bg-accent' : 'bg-line')
        }
      >
        <span
          className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform"
          style={{ transform: checked ? 'translateX(14px)' : 'translateX(2px)' }}
        />
      </button>
    </label>
  )
}

function PlaceholderDropdown({
  label,
  placeholder
}: {
  label: string
  placeholder: string
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1 text-[12px]">
      <span className="text-muted">{label}</span>
      <button
        disabled
        className="px-2 py-0.5 rounded bg-bg-panel border border-line text-[11px] text-muted disabled:opacity-70"
      >
        {placeholder}
      </button>
    </div>
  )
}

interface ViewModeButtonProps {
  icon: JSX.Element
  label: string
  active?: boolean
}

function ViewModeButton({ icon, label, active }: ViewModeButtonProps): JSX.Element {
  return (
    <button
      disabled={!active}
      className={
        'flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md border text-[10px] ' +
        (active
          ? 'border-accent/50 bg-accent/10 text-accent'
          : 'border-line bg-bg-panel/40 text-muted opacity-60')
      }
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function LegendItem({ icon, label }: { icon: JSX.Element; label: string }): JSX.Element {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span>{label}</span>
    </div>
  )
}

function Empty({ text }: { text: string }): JSX.Element {
  return <div className="px-3 py-1.5 text-[11px] text-muted italic">{text}</div>
}

// ── Stashes (preserved from previous sidebar) ──────────────────────────────

interface StashRowProps {
  stash: Stash
  cwd: string
  onPop: () => void
  onApply: () => void
  onDrop: () => void
  onSelectFile: (path: string) => void
  onApplyFile: (path: string) => Promise<void>
}

function StashRow({
  stash, cwd, onPop, onApply, onDrop, onSelectFile, onApplyFile
}: StashRowProps): JSX.Element {
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
      <div
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setRowMenu({ x: e.clientX, y: e.clientY }) }}
        className="group px-2 py-1.5 hover:bg-bg-panel cursor-default flex items-center gap-1.5"
        title={`stash@{${stash.index}} · ${stash.relativeDate}`}
      >
        <button onClick={toggleExpand} className="text-muted hover:text-text text-xs shrink-0 w-3">
          {expanded ? '▾' : '▸'}
        </button>
        <Archive className="shrink-0 text-muted" size={11} />
        <div className="min-w-0 flex-1 cursor-pointer" onClick={toggleExpand}>
          <div className="truncate text-[12px]">{stash.message || `stash@{${stash.index}}`}</div>
          <div className="text-[10px] text-muted truncate">
            {stash.branch ? `on ${stash.branch} · ` : ''}{stash.relativeDate}
          </div>
        </div>
        <div className="opacity-0 group-hover:opacity-100 flex gap-1 shrink-0">
          <button onClick={onPop} className="text-[10px] text-accent hover:text-accent-hover">Pop</button>
          <button onClick={onDrop} className="text-[10px] text-danger hover:opacity-80">Drop</button>
        </div>
      </div>

      {expanded && (
        <div className="pb-1">
          {filesLoading ? (
            <div className="pl-8 py-1 text-[10px] text-muted italic">Loading...</div>
          ) : files.length === 0 ? (
            <div className="pl-8 py-1 text-[10px] text-muted italic">No files</div>
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
                    'flex items-center gap-1.5 pl-8 pr-2 py-0.5 text-[11px] cursor-pointer ' +
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
