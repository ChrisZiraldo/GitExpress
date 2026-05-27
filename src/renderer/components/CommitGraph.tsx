import { useMemo, useRef, useState } from 'react'
import type { GraphCommit, Ref } from '@shared/types'
import { useRepo } from '../store/useRepo'
import { computeLanes, laneColor, type GraphRow } from './graph/computeLanes'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { Avatar } from './Avatar'

const ROW_HEIGHT = 28
const LANE_WIDTH = 16
const LEFT_PAD = 12
const DOT_RADIUS = 4
const REFS_COL_WIDTH = 220

export function CommitGraph(): JSX.Element {
  const activeRepo = useRepo((s) => s.activeRepo)
  const graph = useRepo((s) => s.graph)
  const refs = useRepo((s) => s.refs)
  const status = useRepo((s) => s.status)
  const selectedCommit = useRepo((s) => s.selectedCommit)
  const setSelectedCommit = useRepo((s) => s.setSelectedCommit)
  const pushToast = useRepo((s) => s.pushToast)
  const setBusy = useRepo((s) => s.setBusy)
  const busy = useRepo((s) => s.busy)

  const [menu, setMenu] = useState<{
    x: number
    y: number
    items: MenuItem[]
  } | null>(null)
  const [branchPrompt, setBranchPrompt] = useState<{
    hash: string
    value: string
  } | null>(null)
  const [tagPrompt, setTagPrompt] = useState<{
    hash: string
    name: string
    message: string
  } | null>(null)
  const [resetConfirmHash, setResetConfirmHash] = useState<string | null>(null)

  const layout = useMemo(() => computeLanes(graph), [graph])

  const refsByCommit = useMemo(() => {
    const map = new Map<string, Ref[]>()
    const push = (r: Ref): void => {
      const list = map.get(r.hash) ?? []
      list.push(r)
      map.set(r.hash, list)
    }
    refs.local.forEach(push)
    refs.remote.forEach(push)
    refs.tags.forEach(push)
    return map
  }, [refs])

  const containerRef = useRef<HTMLDivElement>(null)

  const dirty =
    !!status &&
    status.staged.length +
      status.unstaged.length +
      status.untracked.length +
      status.conflicted.length >
      0

  // Find the lane index of HEAD for WIP anchoring
  const headLane = useMemo(() => {
    if (layout.rows.length === 0) return 0
    const firstRow = layout.rows[0]
    // First row's commit IS HEAD, so its lane is the HEAD lane
    return firstRow.lane
  }, [layout.rows])

  const currentBranchRef = useMemo(() => {
    if (!status?.branch.current) return null
    return refs.local.find((r) => r.name === status.branch.current) ?? null
  }, [refs.local, status?.branch.current])

  const [wipConfirmDiscard, setWipConfirmDiscard] = useState(false)

  const onSelectWip = (): void => setSelectedCommit(null)

  const onSelectCommit = (hash: string): void => setSelectedCommit(hash)

  const onWipContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    if (!activeRepo) return
    const items: MenuItem[] = [
      {
        label: 'Stash all changes...',
        onClick: () => {
          const msg = window.prompt('Stash message (optional):') ?? ''
          void runWithBusy('Stash', () =>
            window.git.stash.push(activeRepo.path, { message: msg || undefined, includeUntracked: true })
          ).then(() => refreshAfter())
        }
      },
      {
        label: wipConfirmDiscard ? 'Confirm discard all?' : 'Discard all changes',
        danger: true,
        onClick: () => {
          if (!wipConfirmDiscard) {
            setWipConfirmDiscard(true)
            setTimeout(() => setWipConfirmDiscard(false), 3000)
            return
          }
          setWipConfirmDiscard(false)
          if (!status) return
          const allFiles = [
            ...status.staged.map((f) => ({ path: f.path, staged: true, changeType: f.changeType })),
            ...status.unstaged.map((f) => ({ path: f.path, staged: false, changeType: f.changeType })),
            ...status.untracked.map((f) => ({ path: f.path, staged: false, changeType: 'untracked' as const }))
          ]
          void Promise.all(
            allFiles.map((f) =>
              window.git.stage.discard(activeRepo.path, f.path, f.staged, f.changeType as never)
            )
          ).then(() => refreshAfter())
        }
      },
      { type: 'separator' },
      { label: 'Refresh', onClick: () => refreshAfter() }
    ]
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

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
    } finally {
      setBusy(false)
    }
  }

  const refreshAfter = useRepo.getState().refreshSignal

  const checkoutDetached = (hash: string) => async (): Promise<void> => {
    if (!activeRepo) return
    await runWithBusy('Checkout (detached)', () =>
      window.git.branch.checkoutDetached(activeRepo.path, hash)
    )
    refreshAfter()
  }

  const promptBranchFrom = (hash: string) => (): void => {
    setBranchPrompt({ hash, value: '' })
  }

  const submitBranchPrompt = async (): Promise<void> => {
    if (!branchPrompt || !activeRepo) return
    const name = branchPrompt.value.trim()
    if (!name) {
      setBranchPrompt(null)
      return
    }
    const hash = branchPrompt.hash
    setBranchPrompt(null)
    await runWithBusy(`Create branch ${name}`, () =>
      window.git.branch.createFromCommit(activeRepo.path, name, hash, {
        checkout: true
      })
    )
    refreshAfter()
  }

  const copyHash = (hash: string) => (): void => {
    navigator.clipboard?.writeText(hash).then(
      () => pushToast('success', 'Hash copied to clipboard'),
      () => pushToast('error', 'Failed to copy')
    )
  }

  const onRowContextMenu = (
    e: React.MouseEvent,
    commit: GraphCommit
  ): void => {
    e.preventDefault()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: 'Cherry-pick this commit',
          onClick: () => {
            if (!activeRepo) return
            void runWithBusy(`Cherry-pick ${commit.shortHash}`, () =>
              window.git.commitOps.cherryPick(activeRepo.path, commit.hash)
            ).then(() => refreshAfter())
          }
        },
        {
          label: 'Revert this commit',
          onClick: () => {
            if (!activeRepo) return
            void runWithBusy(`Revert ${commit.shortHash}`, () =>
              window.git.commitOps.revert(activeRepo.path, commit.hash)
            ).then(() => refreshAfter())
          }
        },
        {
          label: resetConfirmHash === commit.hash ? 'Reset: Soft?' : 'Reset current branch here → Soft',
          onClick: () => {
            if (!activeRepo) return
            void runWithBusy(`Soft reset to ${commit.shortHash}`, () =>
              window.git.commitOps.reset(activeRepo.path, commit.hash, 'soft')
            ).then(() => refreshAfter())
          }
        },
        {
          label: 'Reset current branch here → Mixed',
          onClick: () => {
            if (!activeRepo) return
            void runWithBusy(`Mixed reset to ${commit.shortHash}`, () =>
              window.git.commitOps.reset(activeRepo.path, commit.hash, 'mixed')
            ).then(() => refreshAfter())
          }
        },
        {
          label: resetConfirmHash === commit.hash ? 'Confirm hard reset?' : 'Reset current branch here → Hard',
          danger: resetConfirmHash === commit.hash,
          onClick: () => {
            if (!activeRepo) return
            if (resetConfirmHash !== commit.hash) {
              setResetConfirmHash(commit.hash)
              setTimeout(() => setResetConfirmHash((h) => (h === commit.hash ? null : h)), 3000)
              pushToast('info', 'Click again to confirm hard reset')
              return
            }
            setResetConfirmHash(null)
            void runWithBusy(`Hard reset to ${commit.shortHash}`, () =>
              window.git.commitOps.reset(activeRepo.path, commit.hash, 'hard')
            ).then(() => refreshAfter())
          }
        },
        { type: 'separator' },
        {
          label: 'Create tag here...',
          onClick: () => setTagPrompt({ hash: commit.hash, name: '', message: '' })
        },
        { label: 'Checkout (detached)', onClick: checkoutDetached(commit.hash) },
        {
          label: 'Create branch from here...',
          onClick: promptBranchFrom(commit.hash)
        },
        { type: 'separator' },
        { label: 'Copy hash', onClick: copyHash(commit.hash) },
        {
          label: 'Copy short hash',
          onClick: () => {
            navigator.clipboard?.writeText(commit.shortHash).then(
              () => pushToast('success', 'Short hash copied'),
              () => pushToast('error', 'Failed to copy')
            )
          }
        },
        {
          label: 'Copy subject',
          onClick: () => {
            navigator.clipboard?.writeText(commit.subject).then(
              () => pushToast('success', 'Subject copied'),
              () => pushToast('error', 'Failed to copy')
            )
          }
        }
      ]
    })
  }

  const checkoutLocalRef = (name: string) => async (): Promise<void> => {
    if (!activeRepo) return
    await runWithBusy(`Checkout ${name}`, () =>
      window.git.branch.checkout(activeRepo.path, name)
    )
    refreshAfter()
  }

  const checkoutRemoteRef = (name: string) => async (): Promise<void> => {
    if (!activeRepo) return
    await runWithBusy(`Checkout ${name}`, () =>
      window.git.branch.checkoutRemote(activeRepo.path, name)
    )
    refreshAfter()
  }

  const onRefContextMenu = (e: React.MouseEvent, ref: Ref): void => {
    e.preventDefault()
    e.stopPropagation()
    const isRemote = ref.fullName.startsWith('refs/remotes/')
    const isTag = ref.fullName.startsWith('refs/tags/')
    const items: MenuItem[] = []
    if (!isTag && !isRemote) {
      items.push({ label: 'Checkout', onClick: checkoutLocalRef(ref.name) })
    } else if (isRemote) {
      items.push({
        label: 'Checkout as new local branch',
        onClick: checkoutRemoteRef(ref.name)
      })
    }
    items.push({
      label: 'Copy name',
      onClick: () => {
        navigator.clipboard?.writeText(ref.name)
        pushToast('success', 'Name copied')
      }
    })
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  const onRefDoubleClick = (ref: Ref): void => {
    if (ref.fullName.startsWith('refs/remotes/')) {
      void checkoutRemoteRef(ref.name)()
    } else if (ref.fullName.startsWith('refs/heads/')) {
      void checkoutLocalRef(ref.name)()
    }
  }

  if (!activeRepo) return <></>

  const graphWidth = LEFT_PAD + Math.max(1, layout.width) * LANE_WIDTH

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-bg">
      <div className="h-7 px-3 flex items-center bg-bg-subtle border-b border-line text-xs text-muted">
        <span>Commit graph</span>
        <span className="ml-auto">{graph.length} commits</span>
      </div>

      <div ref={containerRef} className="flex-1 min-h-0 overflow-auto">
        <table className="text-sm border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            <col style={{ width: REFS_COL_WIDTH }} />
            <col style={{ width: graphWidth }} />
            <col style={{ width: '100%' }} />
            <col style={{ width: 120, minWidth: 80 }} />
            <col style={{ width: 130, minWidth: 100 }} />
          </colgroup>
          <tbody>
            <tr
              onClick={onSelectWip}
              onContextMenu={onWipContextMenu}
              className={
                'cursor-pointer ' +
                (selectedCommit === null ? 'bg-accent/20' : 'hover:bg-bg-subtle')
              }
              style={{ height: ROW_HEIGHT }}
            >
              {/* refs cell for WIP row – show current branch chip */}
              <td className="align-middle p-0 overflow-hidden">
                {currentBranchRef && (
                  <div className="flex items-center gap-1 px-2 overflow-hidden">
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono truncate max-w-[180px]"
                      style={{ background: laneColor(headLane) + '33', color: laneColor(headLane), border: `1px solid ${laneColor(headLane)}66` }}
                      title={currentBranchRef.name}
                    >
                      {currentBranchRef.name}
                    </span>
                  </div>
                )}
              </td>
              <td
                className="align-middle p-0"
                style={{ width: graphWidth, minWidth: graphWidth }}
              >
                <WipMarker dirty={dirty} width={graphWidth} headLane={headLane} />
              </td>
              <td className="align-middle px-2 py-0">
                <span className="font-medium">Working copy</span>
                {dirty ? (
                  <span className="ml-2 text-xs text-warn">uncommitted changes</span>
                ) : (
                  <span className="ml-2 text-xs text-muted">clean</span>
                )}
              </td>
              <td className="align-middle px-2 py-0 text-xs text-muted whitespace-nowrap">
                WIP
              </td>
              <td className="align-middle px-2 py-0 text-xs text-muted whitespace-nowrap">
                now
              </td>
            </tr>

            {layout.rows.map((row, i) => (
              <CommitRow
                key={row.commit.hash}
                row={row}
                next={layout.rows[i + 1] ?? null}
                width={graphWidth}
                refs={refsByCommit.get(row.commit.hash) ?? []}
                selected={selectedCommit === row.commit.hash}
                onSelect={() => onSelectCommit(row.commit.hash)}
                onContextMenu={(e) => onRowContextMenu(e, row.commit)}
                onRefContextMenu={onRefContextMenu}
                onRefDoubleClick={onRefDoubleClick}
              />
            ))}
          </tbody>
        </table>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}

      {branchPrompt && (
        <BranchPromptOverlay
          value={branchPrompt.value}
          hash={branchPrompt.hash}
          onChange={(v) => setBranchPrompt({ ...branchPrompt, value: v })}
          onCancel={() => setBranchPrompt(null)}
          onSubmit={submitBranchPrompt}
        />
      )}

      {tagPrompt && (
        <TagPromptOverlay
          hash={tagPrompt.hash}
          name={tagPrompt.name}
          message={tagPrompt.message}
          onChangeName={(n) => setTagPrompt({ ...tagPrompt, name: n })}
          onChangeMessage={(m) => setTagPrompt({ ...tagPrompt, message: m })}
          onCancel={() => setTagPrompt(null)}
          onSubmit={async () => {
            if (!activeRepo || !tagPrompt) return
            const name = tagPrompt.name.trim()
            if (!name) { setTagPrompt(null); return }
            const hash = tagPrompt.hash
            const msg = tagPrompt.message.trim()
            setTagPrompt(null)
            await runWithBusy(`Create tag ${name}`, () =>
              window.git.tag.create(activeRepo.path, name, hash, msg || undefined)
            )
            refreshAfter()
          }}
        />
      )}
    </div>
  )
}

interface CommitRowProps {
  row: GraphRow
  next: GraphRow | null
  width: number
  refs: Ref[]
  selected: boolean
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onRefContextMenu: (e: React.MouseEvent, ref: Ref) => void
  onRefDoubleClick: (ref: Ref) => void
}

function CommitRow({
  row,
  next,
  width,
  refs,
  selected,
  onSelect,
  onContextMenu,
  onRefContextMenu,
  onRefDoubleClick
}: CommitRowProps): JSX.Element {
  const { commit, lane, parentLanes, liveLanes } = row

  const cx = (l: number): number => LEFT_PAD + l * LANE_WIDTH + LANE_WIDTH / 2
  const top = 0
  const mid = ROW_HEIGHT / 2
  const bot = ROW_HEIGHT

  const incoming = next ? next.liveLanes : []

  const lines: JSX.Element[] = []

  for (let l = 0; l < liveLanes.length; l++) {
    const hashAtLane = liveLanes[l]
    if (hashAtLane === null) continue
    if (l === lane && commit.parents.length > 0) continue
    lines.push(
      <line
        key={`v-${l}`}
        x1={cx(l)}
        y1={top}
        x2={cx(l)}
        y2={bot}
        stroke={laneColor(l)}
        strokeWidth={1.5}
      />
    )
  }

  for (let l = 0; l < incoming.length; l++) {
    if (incoming[l] === null) continue
    let isParentLink = false
    for (let pi = 0; pi < parentLanes.length; pi++) {
      if (parentLanes[pi] === l && incoming[l] === commit.parents[pi]) {
        isParentLink = true
        break
      }
    }
    if (isParentLink) continue
    lines.push(
      <line
        key={`vd-${l}`}
        x1={cx(l)}
        y1={mid}
        x2={cx(l)}
        y2={bot}
        stroke={laneColor(l)}
        strokeWidth={1.5}
      />
    )
  }

  for (let pi = 0; pi < parentLanes.length; pi++) {
    const pl = parentLanes[pi]
    if (pl < 0) continue
    if (pl === lane) {
      lines.push(
        <line
          key={`p-${pi}`}
          x1={cx(lane)}
          y1={mid}
          x2={cx(lane)}
          y2={bot}
          stroke={laneColor(lane)}
          strokeWidth={1.5}
        />
      )
    } else {
      const x1 = cx(lane)
      const x2 = cx(pl)
      const d = `M ${x1} ${mid} C ${x1} ${mid + 8}, ${x2} ${bot - 8}, ${x2} ${bot}`
      lines.push(
        <path
          key={`p-${pi}`}
          d={d}
          fill="none"
          stroke={laneColor(pl)}
          strokeWidth={1.5}
        />
      )
    }
  }

  for (const ml of row.mergeFrom) {
    const x1 = cx(ml)
    const x2 = cx(lane)
    const d = `M ${x1} ${top} C ${x1} ${top + 8}, ${x2} ${mid - 8}, ${x2} ${mid}`
    lines.push(
      <path
        key={`m-${ml}`}
        d={d}
        fill="none"
        stroke={laneColor(ml)}
        strokeWidth={1.5}
      />
    )
  }

  const color = laneColor(lane)

  return (
    <tr
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={
        'cursor-pointer ' + (selected ? 'bg-accent/20' : 'hover:bg-bg-subtle')
      }
      style={{ height: ROW_HEIGHT }}
    >
      {/* Left refs column */}
      <td className="align-middle p-0 overflow-hidden">
        <div className="flex items-center gap-1 px-2 overflow-hidden" style={{ height: ROW_HEIGHT }}>
          {refs.map((r) => (
            <RefLabel
              key={r.fullName}
              refData={r}
              laneHex={color}
              onContextMenu={(e) => onRefContextMenu(e, r)}
              onDoubleClick={() => onRefDoubleClick(r)}
            />
          ))}
        </div>
      </td>

      {/* Graph SVG column */}
      <td
        className="align-middle p-0"
        style={{ width, minWidth: width }}
      >
        <svg width={width} height={ROW_HEIGHT} className="block">
          {lines}
          <circle
            cx={cx(lane)}
            cy={mid}
            r={DOT_RADIUS}
            fill={color}
            stroke="#0f1115"
            strokeWidth={1.5}
          />
        </svg>
      </td>

      {/* Subject column */}
      <td className="align-middle px-2 py-0 overflow-hidden">
        <span className="block truncate">{commit.subject}</span>
      </td>

      {/* Author column */}
      <td className="align-middle px-2 py-0 text-xs text-muted whitespace-nowrap overflow-hidden">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <Avatar email={commit.email} author={commit.author} size={14} />
          <span className="truncate">{commit.author}</span>
        </div>
      </td>

      {/* Hash + date column */}
      <td className="align-middle px-2 py-0 text-xs text-muted whitespace-nowrap">
        <span className="font-mono">{commit.shortHash}</span>
        <span className="ml-2">{commit.relativeDate}</span>
      </td>
    </tr>
  )
}

interface RefLabelProps {
  refData: Ref
  laneHex: string
  onContextMenu: (e: React.MouseEvent) => void
  onDoubleClick: () => void
}

function RefLabel({ refData, laneHex, onContextMenu, onDoubleClick }: RefLabelProps): JSX.Element {
  const isRemote = refData.fullName.startsWith('refs/remotes/')
  const isTag = refData.fullName.startsWith('refs/tags/')
  const isHead = !!refData.current

  const displayName = isHead
    ? refData.name
    : isRemote
      ? refData.name.slice(refData.name.indexOf('/') + 1)
      : refData.name

  const labelStyle: React.CSSProperties = isTag
    ? {
        backgroundColor: 'rgba(245,166,35,0.15)',
        borderColor: 'rgba(245,166,35,0.5)',
        color: '#f5a623'
      }
    : isRemote
      ? {
          backgroundColor: 'rgba(138,147,166,0.12)',
          borderColor: 'rgba(138,147,166,0.35)',
          color: '#8a93a6'
        }
      : {
          backgroundColor: `${laneHex}28`,
          borderColor: `${laneHex}80`,
          color: laneHex
        }

  const headIndicator = isHead ? (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full mr-1 shrink-0"
      style={{ backgroundColor: laneHex }}
    />
  ) : null

  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono whitespace-nowrap border max-w-[180px] cursor-default select-none shrink-0"
      style={labelStyle}
      onContextMenu={(e) => {
        e.stopPropagation()
        onContextMenu(e)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onDoubleClick()
      }}
      onClick={(e) => e.stopPropagation()}
      title={`${refData.fullName}\nDouble-click to checkout`}
    >
      {headIndicator}
      <span className="truncate">{displayName}</span>
    </span>
  )
}

function WipMarker({
  dirty,
  width,
  headLane
}: {
  dirty: boolean
  width: number
  headLane: number
}): JSX.Element {
  const cx = LEFT_PAD + headLane * LANE_WIDTH + LANE_WIDTH / 2
  const mid = ROW_HEIGHT / 2
  const connectorColor = laneColor(headLane)
  return (
    <svg width={width} height={ROW_HEIGHT} className="block">
      {/* connector down to first commit row */}
      <line
        x1={cx}
        y1={mid + DOT_RADIUS}
        x2={cx}
        y2={ROW_HEIGHT}
        stroke={connectorColor}
        strokeWidth={1.5}
        strokeDasharray="3 2"
      />
      <circle
        cx={cx}
        cy={mid}
        r={DOT_RADIUS}
        fill={dirty ? '#f5a623' : '#3ecf8e'}
        stroke="#0f1115"
        strokeWidth={1.5}
      />
    </svg>
  )
}

interface BranchPromptOverlayProps {
  value: string
  hash: string
  onChange: (v: string) => void
  onCancel: () => void
  onSubmit: () => Promise<void>
}

function BranchPromptOverlay({
  value,
  hash,
  onChange,
  onCancel,
  onSubmit
}: BranchPromptOverlayProps): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="bg-bg-panel border border-line rounded-md p-4 w-96 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm mb-2">
          Create branch from <span className="font-mono">{hash.slice(0, 7)}</span>
        </div>
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void onSubmit()
            if (e.key === 'Escape') onCancel()
          }}
          placeholder="new-branch-name"
          className="w-full px-2 py-1.5 bg-bg-subtle border border-line rounded text-sm focus:outline-none focus:border-accent"
        />
        <div className="mt-3 flex justify-end gap-2">
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
            Create & checkout
          </button>
        </div>
      </div>
    </div>
  )
}

interface TagPromptOverlayProps {
  hash: string
  name: string
  message: string
  onChangeName: (v: string) => void
  onChangeMessage: (v: string) => void
  onCancel: () => void
  onSubmit: () => Promise<void>
}

function TagPromptOverlay({
  hash,
  name,
  message,
  onChangeName,
  onChangeMessage,
  onCancel,
  onSubmit
}: TagPromptOverlayProps): JSX.Element {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-50">
      <div className="bg-bg-panel border border-line rounded-lg shadow-xl p-5 w-72">
        <div className="text-sm font-semibold mb-3">Create tag at {hash.slice(0, 7)}</div>
        <label className="block text-xs text-muted mb-1">Tag name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => onChangeName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void onSubmit()
            if (e.key === 'Escape') onCancel()
          }}
          placeholder="v1.0.0"
          className="w-full px-2 py-1.5 bg-bg-subtle border border-line rounded text-sm focus:outline-none focus:border-accent mb-3"
        />
        <label className="block text-xs text-muted mb-1">Message (optional — creates annotated tag)</label>
        <input
          value={message}
          onChange={(e) => onChangeMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void onSubmit()
            if (e.key === 'Escape') onCancel()
          }}
          placeholder="Release notes..."
          className="w-full px-2 py-1.5 bg-bg-subtle border border-line rounded text-sm focus:outline-none focus:border-accent"
        />
        <div className="mt-3 flex justify-end gap-2">
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
            Create tag
          </button>
        </div>
      </div>
    </div>
  )
}
