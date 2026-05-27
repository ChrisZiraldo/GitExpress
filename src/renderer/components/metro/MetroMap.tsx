import { useEffect, useMemo, useRef, useState } from 'react'
import type { Ref } from '@shared/types'
import { useRepo } from '../../store/useRepo'
import { computeMetroLayout, type MetroStation, type MetroLayout } from './computeMetroLayout'
import { laneColor } from './colors'
import { Station } from './Station'
import { TrainMarker } from './TrainMarker'
import { MiniMap } from './MiniMap'
import { ContextMenu, type MenuItem } from '../ContextMenu'

const LABEL_WIDTH = 156 // sticky left rail showing branch line names

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
  const [scrollLeft, setScrollLeft] = useState(0)
  const [viewportW, setViewportW] = useState(800)
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)

  const layout = useMemo(
    () => computeMetroLayout(graph, refs, status?.branch.current ?? null),
    [graph, refs, status?.branch.current]
  )

  // Once the layout is ready, scroll so the newest commit (right edge) is visible.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: layout.width, behavior: 'auto' })
  }, [layout.width])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = (): void => setScrollLeft(el.scrollLeft)
    const onResize = (): void => setViewportW(el.clientWidth)
    onResize()
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const q = searchQuery.trim().toLowerCase()

  const isLaneHighlighted = (lane: number): boolean => {
    if (!highlightedBranchId) return true
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
    setTooltip({ station, x: e.clientX, y: e.clientY })
  }
  const onStationLeave = (): void => setTooltip(null)

  const jumpToFraction = (fraction: number): void => {
    const el = scrollRef.current
    if (!el) return
    const target = Math.max(0, Math.min(layout.width - el.clientWidth, layout.width * fraction))
    el.scrollTo({ left: target, behavior: 'smooth' })
  }

  if (!activeRepo || graph.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-muted text-sm">
        {activeRepo ? 'Empty repository' : 'No repository open'}
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 relative bg-bg overflow-hidden">
      {/* Sticky left rail: branch line labels (one per lane) */}
      <BranchRail layout={layout} highlight={isLaneHighlighted} />

      {/* Scrollable map body */}
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-auto"
        style={{ paddingLeft: LABEL_WIDTH }}
      >
        <div
          style={{
            width: layout.width,
            height: Math.max(layout.height, 240),
            position: 'relative'
          }}
        >
          <svg
            width={layout.width}
            height={layout.height}
            className="block"
            style={{
              background:
                'radial-gradient(ellipse at right, rgba(91,140,255,0.06), transparent 65%)'
            }}
          >
            <LaneTracks layout={layout} highlight={isLaneHighlighted} />
            <ColumnGrid layout={layout} />
            <Lines layout={layout} highlight={isLaneHighlighted} />
            <Curves layout={layout} highlight={isLaneHighlighted} />
            <Trains layout={layout} refs={refs} />
            <StationLabels layout={layout} q={q} highlight={isLaneHighlighted} selectedHash={selectedCommit} />
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
        </div>
      </div>

      <MiniMap
        layout={layout}
        viewport={{ left: scrollLeft, width: viewportW - LABEL_WIDTH }}
        onJump={jumpToFraction}
      />

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

interface LaneTracksProps {
  layout: MetroLayout
  highlight: (lane: number) => boolean
}

/**
 * Faint horizontal "tracks" running the full width for each lane — gives the
 * eye a continuous rail even where no segment is live (mostly aesthetic).
 */
function LaneTracks({ layout, highlight }: LaneTracksProps): JSX.Element {
  const els: JSX.Element[] = []
  for (let l = 0; l < layout.laneCount; l++) {
    const y = layout.topPad + l * layout.laneHeight + layout.laneHeight / 2
    const dim = !highlight(l)
    els.push(
      <line
        key={`track-${l}`}
        x1={layout.leftPad - 8}
        x2={layout.width - layout.rightPad / 2}
        y1={y}
        y2={y}
        stroke={laneColor(l)}
        strokeWidth={1}
        opacity={dim ? 0.04 : 0.08}
      />
    )
  }
  return <g pointerEvents="none">{els}</g>
}

interface GridProps {
  layout: MetroLayout
}

/** Subtle vertical grid lines between commit columns. */
function ColumnGrid({ layout }: GridProps): JSX.Element {
  const els: JSX.Element[] = []
  for (let i = 0; i <= layout.cols; i++) {
    const x = layout.leftPad + i * layout.colWidth
    els.push(
      <line
        key={`grid-${i}`}
        x1={x}
        x2={x}
        y1={layout.topPad - 10}
        y2={layout.topPad + layout.laneCount * layout.laneHeight}
        stroke="#11151d"
        strokeWidth={1}
      />
    )
  }
  return <g pointerEvents="none">{els}</g>
}

interface LinesProps {
  layout: MetroLayout
  highlight: (lane: number) => boolean
}

/** Horizontal lane lines between adjacent commit columns. */
function Lines({ layout, highlight }: LinesProps): JSX.Element {
  const { rows, colWidth } = layout
  const STROKE = 3
  const els: JSX.Element[] = []
  const xAt = (rowIdx: number): number =>
    layout.leftPad + (layout.cols - 1 - rowIdx) * colWidth + colWidth / 2
  const yAt = (lane: number): number =>
    layout.topPad + lane * layout.laneHeight + layout.laneHeight / 2

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const x1 = xAt(i)
    const isLast = i === rows.length - 1
    const x2 = isLast ? x1 - colWidth * 0.5 : xAt(i + 1)

    // liveLanes after this commit — drawn going LEFT toward older rows.
    for (let l = 0; l < row.liveLanes.length; l++) {
      if (row.liveLanes[l] === null) continue
      const y = yAt(l)
      const dim = !highlight(l)
      els.push(
        <line
          key={`seg-${i}-${l}`}
          x1={x1}
          y1={y}
          x2={x2}
          y2={y}
          stroke={laneColor(l)}
          strokeWidth={STROKE}
          strokeLinecap="round"
          opacity={dim ? 0.15 : 0.95}
        />
      )
    }
  }

  // Also draw a small stub extending to the RIGHT of the newest commit so HEAD
  // doesn't look like a dead-end — the line "continues into the future".
  if (rows.length > 0) {
    const newest = rows[0]
    const y = yAt(newest.lane)
    const xRight = xAt(0) + colWidth * 0.65
    const dim = !highlight(newest.lane)
    els.push(
      <line
        key="stub-future"
        x1={xAt(0)}
        x2={xRight}
        y1={y}
        y2={y}
        stroke={laneColor(newest.lane)}
        strokeWidth={STROKE}
        strokeLinecap="round"
        opacity={dim ? 0.15 : 0.95}
        strokeDasharray="2 3"
      />
    )
  }

  return <g>{els}</g>
}

interface CurvesProps {
  layout: MetroLayout
  highlight: (lane: number) => boolean
}

/**
 * Bezier curves for lane changes — branch-offs and merges. In horizontal
 * layout these are smooth left-going S-curves.
 */
function Curves({ layout, highlight }: CurvesProps): JSX.Element {
  const { rows, colWidth } = layout
  const STROKE = 3
  const els: JSX.Element[] = []
  const xAt = (rowIdx: number): number =>
    layout.leftPad + (layout.cols - 1 - rowIdx) * colWidth + colWidth / 2
  const yAt = (lane: number): number =>
    layout.topPad + lane * layout.laneHeight + layout.laneHeight / 2

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const { commit, lane, parentLanes, mergeFrom } = row
    const x1 = xAt(i)
    const y1 = yAt(lane)

    // For parents on a different lane: curve from this station LEFT to the parent's row + lane.
    for (let pi = 0; pi < parentLanes.length; pi++) {
      const pl = parentLanes[pi]
      if (pl < 0 || pl === lane) continue
      const parentHash = commit.parents[pi]
      const parentRow = rows.findIndex((r) => r.commit.hash === parentHash)
      if (parentRow === -1) continue
      const x2 = xAt(parentRow)
      const y2 = yAt(pl)
      const midX = (x1 + x2) / 2
      const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
      const dim = !highlight(pl) && !highlight(lane)
      els.push(
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

    // mergeFrom: a different lane terminates INTO this commit from the next-older column.
    for (const ml of mergeFrom) {
      // The merged-in lane "came from" one row further from this commit on the time axis.
      // In horizontal layout that's one column to the LEFT.
      const sourceRow = i + 1 < rows.length ? i + 1 : i
      const x2 = xAt(sourceRow)
      const y2 = yAt(ml)
      const midX = (x1 + x2) / 2
      const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
      const dim = !highlight(ml) && !highlight(lane)
      els.push(
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
  return <g>{els}</g>
}

interface TrainsProps {
  layout: MetroLayout
  refs: { local: Ref[]; remote: Ref[] }
}

/** Animated trains pulsing at the tip of each local branch with an upstream. */
function Trains({ layout, refs }: TrainsProps): JSX.Element {
  const els: JSX.Element[] = []
  const tipHashes = new Set(refs.local.filter((r) => r.upstream).map((r) => r.hash))
  for (const station of layout.stations) {
    if (!tipHashes.has(station.hash)) continue
    // Place the train just AHEAD of the station along the time axis (to the right).
    const tx = station.x + layout.colWidth * 0.55
    const ty = station.y
    els.push(
      <TrainMarker
        key={`train-${station.hash}`}
        x={tx}
        y={ty}
        color={station.color}
        pulsing
      />
    )
  }
  return <g>{els}</g>
}

interface StationLabelsProps {
  layout: MetroLayout
  q: string
  highlight: (lane: number) => boolean
  selectedHash: string | null
}

/**
 * Small labels above each notable station: HEAD, tags, branch tips, the
 * currently-selected station, and stations matched by the active search query.
 */
function StationLabels({ layout, q, highlight, selectedHash }: StationLabelsProps): JSX.Element {
  const els: JSX.Element[] = []
  const seenTipPerLane = new Set<number>()
  for (const s of layout.stations) {
    const isTip = !seenTipPerLane.has(s.lane)
    if (isTip) seenTipPerLane.add(s.lane)

    const isSelected = selectedHash === s.hash
    const qMatch = q ? stationMatches(s, q) : false
    const showLabel = s.isHead || s.hasTag || isTip || isSelected || qMatch
    if (!showLabel) continue

    const dim = !highlight(s.lane)
    const tagRef = s.refs.find((r) => r.fullName.startsWith('refs/tags/'))
    const text = s.isHead
      ? `HEAD · ${truncate(s.subject, 26)}`
      : tagRef
        ? `${tagRef.name}`
        : isTip && s.refs.find((r) => r.fullName.startsWith('refs/heads/'))
          ? truncate(s.subject, 24)
          : truncate(s.subject, 20)

    const above = s.lane % 2 === 0
    const labelY = above ? s.y - 14 : s.y + 24

    els.push(
      <g
        key={`lbl-${s.hash}`}
        opacity={dim ? 0.3 : 1}
        pointerEvents="none"
      >
        <text
          x={s.x}
          y={labelY}
          textAnchor="middle"
          fontSize={10}
          fill={isSelected ? '#e6e8ee' : '#8a93a6'}
          className="font-mono"
        >
          {text}
        </text>
      </g>
    )
  }
  return <g>{els}</g>
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n - 1) + '…'
}

interface BranchRailProps {
  layout: MetroLayout
  highlight: (lane: number) => boolean
}

/**
 * Sticky left rail showing branch-line names. Functions like a transit-map key:
 * even when the user scrolls horizontally, the labels remain pinned.
 */
function BranchRail({ layout, highlight }: BranchRailProps): JSX.Element {
  return (
    <div
      className="absolute top-0 bottom-0 left-0 z-10 bg-bg-subtle/95 backdrop-blur border-r border-line overflow-hidden"
      style={{ width: LABEL_WIDTH }}
    >
      <div className="px-3 pt-3 pb-2 text-[10px] uppercase tracking-wider text-muted">
        Lines
      </div>
      <div className="relative" style={{ height: layout.height }}>
        {Array.from({ length: layout.laneCount }, (_, lane) => {
          const label = layout.laneLabels.find((l) => l.lane === lane)
          const y = layout.topPad + lane * layout.laneHeight + layout.laneHeight / 2
          const color = laneColor(lane)
          const dim = !highlight(lane)
          return (
            <div
              key={`rail-${lane}`}
              className="absolute left-0 right-0 flex items-center gap-2 px-3"
              style={{
                top: y - layout.laneHeight / 2,
                height: layout.laneHeight,
                opacity: dim ? 0.4 : 1
              }}
            >
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span
                className="text-[12px] font-mono truncate"
                style={{ color: label ? color : '#5a6275' }}
                title={label?.name ?? `lane ${lane}`}
              >
                {label?.name ?? `lane ${lane + 1}`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
