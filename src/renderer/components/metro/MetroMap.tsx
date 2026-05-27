import { useEffect, useMemo, useRef, useState } from 'react'
import type { Ref } from '@shared/types'
import { useRepo } from '../../store/useRepo'
import { computeMetroLayout, type MetroStation } from './computeMetroLayout'
import { laneColor } from './colors'
import { Station } from './Station'
import { TrainMarker } from './TrainMarker'
import { MiniMap } from './MiniMap'
import { ContextMenu, type MenuItem } from '../ContextMenu'
import { Avatar } from '../Avatar'

const SUBJECT_COL_WIDTH = 380
const META_COL_WIDTH = 240

interface Tooltip {
  station: MetroStation
  x: number
  y: number
}

export function MetroMap(): JSX.Element {
  const activeRepo = useRepo((s) => s.activeRepo)
  const graph = useRepo((s) => s.graph)
  const refs = useRepo((s) => s.refs)
  const status = useRepo((s) => s.status)
  const selectedCommit = useRepo((s) => s.selectedCommit)
  const setSelectedCommit = useRepo((s) => s.setSelectedCommit)
  const searchQuery = useRepo((s) => s.searchQuery)
  const highlightedBranchId = useRepo((s) => s.highlightedBranchId)
  const pushToast = useRepo((s) => s.pushToast)
  const setBusy = useRepo((s) => s.setBusy)
  const busy = useRepo((s) => s.busy)
  const refreshSignal = useRepo((s) => s.refreshSignal)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(600)
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)

  const layout = useMemo(
    () => computeMetroLayout(graph, refs, status?.branch.current ?? null),
    [graph, refs, status?.branch.current]
  )

  // Track scroll for mini-map viewport indicator
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = (): void => setScrollTop(el.scrollTop)
    const onResize = (): void => setViewportH(el.clientHeight)
    onResize()
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // Lower-case search query for cheap row filtering (visual match)
  const q = searchQuery.trim().toLowerCase()

  // Build a per-lane "matches highlighted branch?" lookup
  const isLaneHighlighted = (lane: number): boolean => {
    if (!highlightedBranchId) return true
    // The highlightedBranchId is a ref full-name; resolve to its lane by walking stations
    const ref = [...refs.local, ...refs.remote].find((r) => r.fullName === highlightedBranchId)
    if (!ref) return true
    const station = layout.stations.find((s) =>
      s.refs.some((r) => r.fullName === ref.fullName)
    )
    if (!station) return true
    return station.lane === lane
  }

  const onStationClick = (station: MetroStation): void => {
    setSelectedCommit(station.hash)
    setTooltip(null)
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
      refreshSignal()
    } finally {
      setBusy(false)
    }
  }

  const onStationContextMenu = (e: React.MouseEvent, station: MetroStation): void => {
    e.preventDefault()
    e.stopPropagation()
    if (!activeRepo) return
    const items: MenuItem[] = [
      {
        label: 'Copy hash',
        onClick: () => {
          navigator.clipboard?.writeText(station.hash)
          pushToast('success', 'Hash copied')
        }
      },
      {
        label: 'Copy short hash',
        onClick: () => {
          navigator.clipboard?.writeText(station.shortHash)
          pushToast('success', 'Short hash copied')
        }
      },
      {
        label: 'Copy subject',
        onClick: () => {
          navigator.clipboard?.writeText(station.subject)
          pushToast('success', 'Subject copied')
        }
      },
      { type: 'separator' },
      {
        label: 'Cherry-pick this commit',
        onClick: () =>
          runWithBusy(`Cherry-pick ${station.shortHash}`, () =>
            window.git.commitOps.cherryPick(activeRepo.path, station.hash)
          )
      },
      {
        label: 'Revert this commit',
        onClick: () =>
          runWithBusy(`Revert ${station.shortHash}`, () =>
            window.git.commitOps.revert(activeRepo.path, station.hash)
          )
      },
      { type: 'separator' },
      {
        label: 'Checkout (detached)',
        onClick: () =>
          runWithBusy('Checkout (detached)', () =>
            window.git.branch.checkoutDetached(activeRepo.path, station.hash)
          )
      }
    ]
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  const onStationHover = (e: React.MouseEvent, station: MetroStation): void => {
    setTooltip({
      station,
      x: e.clientX,
      y: e.clientY
    })
  }

  const onStationLeave = (): void => setTooltip(null)

  const jumpToFraction = (fraction: number): void => {
    const el = scrollRef.current
    if (!el) return
    const target = Math.max(0, Math.min(layout.height - el.clientHeight, layout.height * fraction))
    el.scrollTo({ top: target, behavior: 'smooth' })
  }

  if (!activeRepo || graph.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-muted text-sm">
        {activeRepo ? 'Empty repository' : 'No repository open'}
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 min-h-0 relative bg-bg overflow-hidden">
      {/* Map header (lane name labels) */}
      <LaneHeader layout={layout} highlight={isLaneHighlighted} />

      {/* Scrollable map body */}
      <div
        ref={scrollRef}
        className="absolute inset-0 top-7 overflow-auto"
        style={{ scrollbarGutter: 'stable' }}
      >
        <div
          className="relative flex"
          style={{
            width: layout.width + SUBJECT_COL_WIDTH + META_COL_WIDTH,
            minHeight: layout.height
          }}
        >
          {/* Map SVG */}
          <svg
            width={layout.width}
            height={layout.height}
            className="block shrink-0"
            style={{ background: 'radial-gradient(ellipse at top, rgba(91,140,255,0.04), transparent 70%)' }}
          >
            <GridLines layout={layout} />
            <Lines layout={layout} isLaneHighlighted={isLaneHighlighted} q={q} />
            <Curves layout={layout} isLaneHighlighted={isLaneHighlighted} q={q} />
            <Trains layout={layout} refs={refs} />
            {layout.stations.map((station) => {
              const dim = !isLaneHighlighted(station.lane) || (q && !stationMatches(station, q))
              return (
                <Station
                  key={station.hash}
                  station={station}
                  selected={selectedCommit === station.hash}
                  dimmed={!!dim}
                  onClick={() => onStationClick(station)}
                  onContextMenu={(e) => onStationContextMenu(e, station)}
                  onMouseEnter={(e) => onStationHover(e, station)}
                  onMouseLeave={onStationLeave}
                />
              )
            })}
          </svg>

          {/* Side columns (subject + meta) absolutely positioned next to SVG */}
          <div className="relative flex-1 min-w-0">
            {layout.stations.map((station) => {
              const dim = !isLaneHighlighted(station.lane) || (q && !stationMatches(station, q))
              const isSelected = selectedCommit === station.hash
              return (
                <RowText
                  key={station.hash}
                  station={station}
                  rowHeight={layout.rowHeight}
                  selected={isSelected}
                  dimmed={!!dim}
                  onClick={() => onStationClick(station)}
                  onContextMenu={(e) => onStationContextMenu(e, station)}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* Mini-map overlay */}
      <MiniMap
        layout={layout}
        viewport={{ top: scrollTop, height: viewportH }}
        onJump={jumpToFraction}
      />

      {/* Hover tooltip */}
      {tooltip && (
        <div
          className="fixed pointer-events-none z-30 bg-bg-panel/95 border border-line rounded-md px-2.5 py-1.5 text-xs shadow-xl backdrop-blur max-w-[320px]"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
        >
          <div className="font-medium text-text truncate">{tooltip.station.subject}</div>
          <div className="text-muted mt-0.5 flex items-center gap-2">
            <span className="font-mono">{tooltip.station.shortHash}</span>
            <span>•</span>
            <span className="truncate">{tooltip.station.author}</span>
            <span>•</span>
            <span>{tooltip.station.relativeDate}</span>
          </div>
        </div>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

// ── Sub-renderers ──────────────────────────────────────────────────────────

function stationMatches(s: MetroStation, q: string): boolean {
  if (!q) return true
  return (
    s.subject.toLowerCase().includes(q) ||
    s.shortHash.toLowerCase().includes(q) ||
    s.author.toLowerCase().includes(q) ||
    s.refs.some((r) => r.name.toLowerCase().includes(q))
  )
}

interface LineLayoutProps {
  layout: ReturnType<typeof computeMetroLayout>
  isLaneHighlighted: (lane: number) => boolean
  q: string
}

/** Vertical lane lines connecting stations on the same lane. */
function Lines({ layout, isLaneHighlighted, q }: LineLayoutProps): JSX.Element {
  const { rows, leftPad, laneWidth, rowHeight, topPad } = layout
  const cx = (l: number): number => leftPad + l * laneWidth + laneWidth / 2

  const elements: JSX.Element[] = []
  const STROKE = 3

  // For each row: draw vertical segments for live lanes from this row to next row.
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const y1 = topPad + i * rowHeight + rowHeight / 2
    const isLast = i === rows.length - 1
    const y2 = isLast ? y1 + rowHeight * 0.5 : topPad + (i + 1) * rowHeight + rowHeight / 2

    // The lanes that are live AFTER this row (== outgoing). They draw down from y1 to y2.
    for (let l = 0; l < row.liveLanes.length; l++) {
      if (row.liveLanes[l] === null) continue
      const dim = !isLaneHighlighted(l)
      elements.push(
        <line
          key={`seg-${i}-${l}`}
          x1={cx(l)}
          y1={y1}
          x2={cx(l)}
          y2={y2}
          stroke={laneColor(l)}
          strokeWidth={STROKE}
          strokeLinecap="round"
          opacity={dim ? 0.15 : 0.95}
        />
      )
    }

    // Also draw the "incoming" portion: the segment from row above's mid down to this row's station,
    // for every lane that was live BEFORE this row but not for this row's own commit.
    if (i > 0) {
      const prev = rows[i - 1]
      const prevY = topPad + (i - 1) * rowHeight + rowHeight / 2
      for (let l = 0; l < prev.liveLanes.length; l++) {
        if (prev.liveLanes[l] === null) continue
        // The line from prev.mid -> this.mid is drawn by the previous iteration above; nothing extra here.
        void prevY
        void l
      }
    }
  }
  void q
  return <g>{elements}</g>
}

/** Bezier curves for lane changes (merges, branch-offs). */
function Curves({ layout, isLaneHighlighted, q }: LineLayoutProps): JSX.Element {
  const { rows, leftPad, laneWidth, rowHeight, topPad } = layout
  const cx = (l: number): number => leftPad + l * laneWidth + laneWidth / 2
  const elements: JSX.Element[] = []
  const STROKE = 3

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const { commit, lane, parentLanes, mergeFrom } = row
    const x = cx(lane)
    const y = topPad + i * rowHeight + rowHeight / 2
    const yBot = y + rowHeight / 2 + (i === rows.length - 1 ? rowHeight * 0.5 : rowHeight / 2)

    // For parents on a different lane, curve from this station DOWN to the parent's lane.
    for (let pi = 0; pi < parentLanes.length; pi++) {
      const pl = parentLanes[pi]
      if (pl < 0 || pl === lane) continue
      const x1 = x
      const y1 = y
      const x2 = cx(pl)
      const y2 = yBot
      const cy1 = y1 + rowHeight * 0.4
      const cy2 = y2 - rowHeight * 0.05
      const d = `M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`
      const dim = !isLaneHighlighted(pl) && !isLaneHighlighted(lane)
      elements.push(
        <path
          key={`curve-p-${commit.hash}-${pi}`}
          d={d}
          fill="none"
          stroke={laneColor(pl)}
          strokeWidth={STROKE}
          strokeLinecap="round"
          opacity={dim ? 0.15 : 0.95}
        />
      )
    }

    // For mergeFrom: another lane joins INTO this station from above.
    for (const ml of mergeFrom) {
      const x1 = cx(ml)
      const y1 = topPad + (i - 1) * rowHeight + rowHeight / 2
      const x2 = x
      const y2 = y
      const cy1 = y1 + rowHeight * 0.5
      const cy2 = y2 - rowHeight * 0.4
      const d = `M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`
      const dim = !isLaneHighlighted(ml) && !isLaneHighlighted(lane)
      elements.push(
        <path
          key={`curve-m-${commit.hash}-${ml}`}
          d={d}
          fill="none"
          stroke={laneColor(ml)}
          strokeWidth={STROKE}
          strokeLinecap="round"
          opacity={dim ? 0.15 : 0.95}
        />
      )
    }
  }
  void q
  return <g>{elements}</g>
}

interface TrainsProps {
  layout: ReturnType<typeof computeMetroLayout>
  refs: { local: Ref[]; remote: Ref[] }
}

/**
 * Train markers — one per branch tip with a known upstream that is "ahead" of remote.
 * Drawn at the station representing the branch tip.
 */
function Trains({ layout, refs }: TrainsProps): JSX.Element {
  // For now, indicate a train on every local branch tip with an upstream — visual cue
  // that the branch has activity. Real PR-state wiring can refine this later.
  const elements: JSX.Element[] = []
  const tipHashes = new Set(refs.local.filter((r) => r.upstream).map((r) => r.hash))
  for (const station of layout.stations) {
    if (!tipHashes.has(station.hash)) continue
    // Position the train a half-row below the station along its lane
    const tx = station.x
    const ty = station.y + layout.rowHeight * 0.55
    elements.push(
      <TrainMarker
        key={`train-${station.hash}`}
        x={tx}
        y={ty}
        color={station.color}
        pulsing
      />
    )
  }
  return <g>{elements}</g>
}

interface LaneHeaderProps {
  layout: ReturnType<typeof computeMetroLayout>
  highlight: (lane: number) => boolean
}

/** Sticky lane labels at the top of the map. */
function LaneHeader({ layout, highlight }: LaneHeaderProps): JSX.Element {
  return (
    <div className="absolute top-0 left-0 right-0 h-7 z-10 bg-bg-subtle/90 backdrop-blur border-b border-line text-[10px] text-muted px-2 flex items-center gap-3 overflow-x-auto">
      <span className="uppercase tracking-wide">Lines</span>
      {layout.laneLabels.map((label) => {
        const dim = !highlight(label.lane)
        return (
          <span
            key={label.lane}
            className="inline-flex items-center gap-1.5 font-mono px-1.5 py-0.5 rounded"
            style={{
              color: label.color,
              backgroundColor: `${label.color}1a`,
              border: `1px solid ${label.color}55`,
              opacity: dim ? 0.3 : 1
            }}
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: label.color }}
            />
            {label.name}
          </span>
        )
      })}
    </div>
  )
}

interface GridLinesProps {
  layout: ReturnType<typeof computeMetroLayout>
}

/** Subtle horizontal grid lines through every row. */
function GridLines({ layout }: GridLinesProps): JSX.Element {
  const elements: JSX.Element[] = []
  for (let i = 0; i <= layout.rows.length; i++) {
    const y = layout.topPad + i * layout.rowHeight
    elements.push(
      <line
        key={`grid-${i}`}
        x1={0}
        x2={layout.width}
        y1={y}
        y2={y}
        stroke="#161b25"
        strokeWidth={1}
      />
    )
  }
  return <g pointerEvents="none">{elements}</g>
}

interface RowTextProps {
  station: MetroStation
  rowHeight: number
  selected: boolean
  dimmed: boolean
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

/**
 * The text row to the right of the metro map showing refs / subject / author / date.
 * Absolutely positioned so it lines up with the station Y in the SVG.
 */
function RowText({ station, rowHeight, selected, dimmed, onClick, onContextMenu }: RowTextProps): JSX.Element {
  const top = station.y - rowHeight / 2
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={
        'absolute left-0 right-0 flex items-center gap-3 px-3 cursor-pointer ' +
        (selected ? 'bg-accent/15' : 'hover:bg-bg-subtle/60')
      }
      style={{
        top,
        height: rowHeight,
        opacity: dimmed ? 0.35 : 1
      }}
      title={station.subject}
    >
      {/* Refs chips */}
      <div className="flex items-center gap-1 shrink-0 max-w-[40%] overflow-hidden">
        {station.refs.slice(0, 3).map((r) => (
          <RefChip key={r.fullName} refData={r} laneColor={station.color} />
        ))}
        {station.refs.length > 3 && (
          <span className="text-[10px] text-muted">+{station.refs.length - 3}</span>
        )}
      </div>

      {/* Subject */}
      <span className="flex-1 truncate text-sm">{station.subject}</span>

      {/* Author + meta */}
      <div className="flex items-center gap-1.5 shrink-0 text-xs text-muted">
        <Avatar email={station.email} author={station.author} size={14} />
        <span className="truncate max-w-[120px]">{station.author}</span>
        <span className="font-mono opacity-70">{station.shortHash}</span>
        <span className="opacity-70 whitespace-nowrap">{station.relativeDate}</span>
      </div>
    </div>
  )
}

function RefChip({ refData, laneColor }: { refData: Ref; laneColor: string }): JSX.Element {
  const isRemote = refData.fullName.startsWith('refs/remotes/')
  const isTag = refData.fullName.startsWith('refs/tags/')
  const isHead = !!refData.current

  const displayName = isRemote
    ? refData.name.slice(refData.name.indexOf('/') + 1)
    : refData.name

  const style: React.CSSProperties = isTag
    ? { backgroundColor: '#ffd16622', color: '#ffd166', borderColor: '#ffd16666' }
    : isRemote
      ? { backgroundColor: '#8a93a622', color: '#8a93a6', borderColor: '#8a93a655' }
      : { backgroundColor: `${laneColor}22`, color: laneColor, borderColor: `${laneColor}66` }

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono whitespace-nowrap border max-w-[150px] truncate"
      style={style}
      title={refData.fullName}
    >
      {isHead && (
        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: laneColor }} />
      )}
      <span className="truncate">{displayName}</span>
    </span>
  )
}
