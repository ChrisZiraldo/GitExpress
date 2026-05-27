import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Compass,
  Plus,
  Minus,
  Maximize2,
  Lock,
  Tag,
  CheckCircle2
} from 'lucide-react'
import type { Ref } from '@shared/types'
import { useRepo } from '../../store/useRepo'
import { computeMetroLayout, type MetroStation, type MetroLayout } from './computeMetroLayout'
import { laneColor } from './colors'
import { Station } from './Station'
import { TrainMarker } from './TrainMarker'
import { MiniMap } from './MiniMap'
import { ContextMenu, type MenuItem } from '../ContextMenu'

const RAIL_WIDTH = 0 // We render terminal badges in-SVG instead of using a sticky rail.
const ZOOM_MIN = 0.55
const ZOOM_MAX = 1.6

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
  const [zoom, setZoom] = useState(1)
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)

  const layout = useMemo(
    () => computeMetroLayout(graph, refs, status?.branch.current ?? null),
    [graph, refs, status?.branch.current]
  )

  // Scroll the view so HEAD (right edge) is visible after the layout is ready.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: layout.width * zoom, behavior: 'auto' })
  }, [layout.width, zoom])

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

  // Listen for global "fit" events from the TopBar.
  useEffect(() => {
    const onFit = (): void => doFit()
    window.addEventListener('gitmetro:fit', onFit)
    return () => window.removeEventListener('gitmetro:fit', onFit)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.width, viewportW])

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
    const target = Math.max(
      0,
      Math.min(layout.width * zoom - el.clientWidth, layout.width * zoom * fraction)
    )
    el.scrollTo({ left: target, behavior: 'smooth' })
  }

  const doFit = (): void => {
    const el = scrollRef.current
    if (!el || layout.width === 0) return
    const targetZoom = Math.min(
      ZOOM_MAX,
      Math.max(ZOOM_MIN, (el.clientWidth - 16) / layout.width)
    )
    setZoom(targetZoom)
    el.scrollTo({ left: 0, behavior: 'smooth' })
  }
  const zoomIn = (): void => setZoom((z) => Math.min(ZOOM_MAX, +(z + 0.1).toFixed(2)))
  const zoomOut = (): void => setZoom((z) => Math.max(ZOOM_MIN, +(z - 0.1).toFixed(2)))

  if (!activeRepo || graph.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-muted text-sm">
        {activeRepo ? 'Empty repository' : 'No repository open'}
      </div>
    )
  }

  const oldestStation = layout.stations[layout.stations.length - 1]

  return (
    <div className="flex-1 min-h-0 relative bg-bg overflow-hidden">
      {/* Scrollable map body */}
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-auto"
        style={{ paddingLeft: RAIL_WIDTH }}
      >
        <div
          style={{
            width: layout.width * zoom,
            height: Math.max(layout.height * zoom, 320),
            position: 'relative'
          }}
        >
          <svg
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            preserveAspectRatio="xMinYMin meet"
            className="block"
            style={{
              width: layout.width * zoom,
              height: layout.height * zoom,
              background:
                'radial-gradient(ellipse 60% 60% at 80% 50%, rgba(59,130,246,0.07), transparent 70%)'
            }}
          >
            <LaneTracks layout={layout} highlight={isLaneHighlighted} />
            <ColumnGrid layout={layout} />
            <Lines layout={layout} highlight={isLaneHighlighted} />
            <Curves layout={layout} highlight={isLaneHighlighted} />
            <Trains layout={layout} refs={refs} />

            <TerminalBadges layout={layout} highlight={isLaneHighlighted} />

            {/* Per-station inline labels — small text next to every station */}
            <StationLabels
              layout={layout}
              q={q}
              highlight={isLaneHighlighted}
              selectedHash={selectedCommit}
            />

            <TagBadges layout={layout} highlight={isLaneHighlighted} />

            {oldestStation && (
              <text
                x={oldestStation.x}
                y={oldestStation.y + layout.laneHeight * 0.55 + 14}
                textAnchor="middle"
                fontSize={10}
                fill="#8a93a6"
                className="font-mono"
              >
                Start · {oldestStation.relativeDate}
              </text>
            )}

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

            <HeadBadge layout={layout} status={status?.branch ?? null} />
            <AheadBadge layout={layout} status={status?.branch ?? null} />
          </svg>
        </div>
      </div>

      {/* Compass + Legend overlay at top-left */}
      <CompassOverlay />

      {/* Zoom controls bottom-left */}
      <ZoomControls
        zoom={zoom}
        onFit={doFit}
        onIn={zoomIn}
        onOut={zoomOut}
      />

      {/* Mini-map bottom-right */}
      <MiniMap
        layout={layout}
        viewport={{ left: scrollLeft / zoom, width: (viewportW - RAIL_WIDTH) / zoom }}
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

function LaneTracks({ layout, highlight }: LaneTracksProps): JSX.Element {
  const els: JSX.Element[] = []
  for (let l = 0; l < layout.laneCount; l++) {
    const y = layout.topPad + l * layout.laneHeight + layout.laneHeight / 2
    const dim = !highlight(l)
    els.push(
      <line
        key={`track-${l}`}
        x1={0}
        x2={layout.width}
        y1={y}
        y2={y}
        stroke={laneColor(l)}
        strokeWidth={1}
        opacity={dim ? 0.03 : 0.06}
      />
    )
  }
  return <g pointerEvents="none">{els}</g>
}

interface GridProps { layout: MetroLayout }

function ColumnGrid({ layout }: GridProps): JSX.Element {
  const els: JSX.Element[] = []
  for (let i = 0; i <= layout.cols; i++) {
    const x = layout.leftPad + i * layout.colWidth
    els.push(
      <line
        key={`grid-${i}`}
        x1={x}
        x2={x}
        y1={layout.topPad - 14}
        y2={layout.topPad + layout.laneCount * layout.laneHeight + 4}
        stroke="#0e131c"
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

/** Horizontal lane lines between adjacent commit columns. Stale lanes render dashed. */
function Lines({ layout, highlight }: LinesProps): JSX.Element {
  const { rows, colWidth } = layout
  const STROKE = 3.5
  const els: JSX.Element[] = []
  const xAt = (rowIdx: number): number =>
    layout.leftPad + (layout.cols - 1 - rowIdx) * colWidth + colWidth / 2
  const yAt = (lane: number): number =>
    layout.topPad + lane * layout.laneHeight + layout.laneHeight / 2

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const x1 = xAt(i)
    const isLast = i === rows.length - 1
    const x2 = isLast ? x1 - colWidth * 0.65 : xAt(i + 1)

    for (let l = 0; l < row.liveLanes.length; l++) {
      if (row.liveLanes[l] === null) continue
      const y = yAt(l)
      const dim = !highlight(l)
      const stale = layout.staleLanes.has(l)
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
          opacity={dim ? 0.15 : stale ? 0.55 : 0.95}
          strokeDasharray={stale ? '6 5' : undefined}
        />
      )
    }
  }

  // Future stub past HEAD — dashed.
  if (rows.length > 0) {
    const newest = rows[0]
    const y = yAt(newest.lane)
    els.push(
      <line
        key="stub-future"
        x1={xAt(0)}
        x2={xAt(0) + colWidth * 1.4}
        y1={y}
        y2={y}
        stroke={laneColor(newest.lane)}
        strokeWidth={STROKE}
        strokeLinecap="round"
        opacity={0.55}
        strokeDasharray="3 6"
      />
    )
  }
  return <g>{els}</g>
}

interface CurvesProps {
  layout: MetroLayout
  highlight: (lane: number) => boolean
}

/** Bezier S-curves for branch-offs and merges. */
function Curves({ layout, highlight }: CurvesProps): JSX.Element {
  const { rows, colWidth } = layout
  const STROKE = 3.5
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

    // Branch-off: this commit's parent lives on a different lane (further left).
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
      const stale = layout.staleLanes.has(pl) || layout.staleLanes.has(lane)
      els.push(
        <path
          key={`curve-p-${commit.hash}-${pi}`}
          d={d}
          fill="none"
          stroke={laneColor(pl)}
          strokeWidth={STROKE}
          strokeLinecap="round"
          opacity={dim ? 0.15 : stale ? 0.55 : 0.95}
          strokeDasharray={stale ? '6 5' : undefined}
        />
      )
    }

    // Merge-in: another lane terminates INTO this commit from one column over.
    for (const ml of mergeFrom) {
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

function Trains({ layout, refs }: TrainsProps): JSX.Element {
  const els: JSX.Element[] = []
  const tipHashes = new Set(refs.local.filter((r) => r.upstream && !r.current).map((r) => r.hash))
  for (const station of layout.stations) {
    if (!tipHashes.has(station.hash)) continue
    const tx = station.x + layout.colWidth * 0.5
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
 * Inline subject labels above (or below) every station — matches the mockup
 * where every commit shows its subject right next to its node. Lanes in the
 * top half get labels above; bottom half get labels below — so they radiate
 * away from the centerline and don't collide with neighboring lanes.
 */
function StationLabels({ layout, q, highlight, selectedHash }: StationLabelsProps): JSX.Element {
  const els: JSX.Element[] = []
  const midLane = (layout.laneCount - 1) / 2
  const headHash = layout.headStation?.hash ?? null

  for (const s of layout.stations) {
    // Skip the HEAD station — it gets its own big badge.
    if (s.hash === headHash) continue
    // Skip tagged stations — they get a green tag badge.
    if (s.hasTag) continue

    const dim = !highlight(s.lane) || (q && !stationMatches(s, q))
    const isSelected = selectedHash === s.hash
    const above = s.lane <= midLane
    const labelY = above ? s.y - 16 : s.y + 22
    const text = truncate(s.subject, 22)

    els.push(
      <g
        key={`lbl-${s.hash}`}
        opacity={dim ? 0.25 : 1}
        pointerEvents="none"
      >
        <text
          x={s.x}
          y={labelY}
          textAnchor="middle"
          fontSize={10}
          fill={isSelected ? '#e6e8ee' : '#9aa3b8'}
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

interface TerminalBadgesProps {
  layout: MetroLayout
  highlight: (lane: number) => boolean
}

/**
 * Branch-name badge anchored to the LEFT end of each lane. Looks like a
 * subway-line "terminal" sign — a colored pill with white text and a small
 * vertical stub connecting it to the line.
 */
function TerminalBadges({ layout, highlight }: TerminalBadgesProps): JSX.Element {
  const els: JSX.Element[] = []
  const CHAR_W = 6.2
  const PAD_X = 8
  const HEIGHT = 22
  for (const t of layout.terminals) {
    const dim = !highlight(t.lane)
    const label = t.stale ? `${t.name} (stale)` : t.name
    const width = Math.max(64, label.length * CHAR_W + PAD_X * 2)
    const bx = Math.max(6, t.x - width / 2)
    const by = t.y - HEIGHT / 2
    els.push(
      <g key={`term-${t.lane}`} opacity={dim ? 0.35 : 1}>
        {/* connector stub */}
        <line
          x1={bx + width}
          y1={t.y}
          x2={t.x + layout.colWidth * 0.5}
          y2={t.y}
          stroke={t.color}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeDasharray={t.stale ? '6 5' : undefined}
          opacity={t.stale ? 0.55 : 0.95}
        />
        {/* pill */}
        <rect
          x={bx}
          y={by}
          width={width}
          height={HEIGHT}
          rx={HEIGHT / 2}
          fill={t.color}
          opacity={0.95}
        />
        {/* subtle inner ring */}
        <rect
          x={bx + 0.5}
          y={by + 0.5}
          width={width - 1}
          height={HEIGHT - 1}
          rx={HEIGHT / 2}
          fill="none"
          stroke="#0b0e14"
          strokeOpacity={0.25}
          strokeWidth={1}
        />
        <text
          x={bx + width / 2}
          y={t.y + 3.5}
          textAnchor="middle"
          fontSize={11}
          fill="#ffffff"
          fontWeight={600}
          className="font-mono"
        >
          {label}
        </text>
      </g>
    )
  }
  return <g pointerEvents="none">{els}</g>
}

interface TagBadgesProps {
  layout: MetroLayout
  highlight: (lane: number) => boolean
}

/**
 * Green rounded badges for tagged commits (e.g. "v1.3.0 (next)"). Drawn just
 * below the line near the station with a small connector dot.
 */
function TagBadges({ layout, highlight }: TagBadgesProps): JSX.Element {
  const els: JSX.Element[] = []
  for (const s of layout.tagStations) {
    if (s.isHead) continue // HEAD badge already shows tags via its label
    const tag = s.refs.find((r) => r.fullName.startsWith('refs/tags/'))
    if (!tag) continue
    const dim = !highlight(s.lane)
    const label = tag.name
    const width = Math.max(50, label.length * 6.8 + 18)
    const HEIGHT = 20
    const above = s.lane <= (layout.laneCount - 1) / 2
    const by = above ? s.y - HEIGHT - 14 : s.y + 14
    const bx = s.x - width / 2
    els.push(
      <g key={`tag-${s.hash}`} opacity={dim ? 0.35 : 1}>
        <line
          x1={s.x}
          y1={s.y}
          x2={s.x}
          y2={above ? by + HEIGHT : by}
          stroke="#22c55e"
          strokeWidth={1.5}
          opacity={0.7}
        />
        <rect
          x={bx}
          y={by}
          width={width}
          height={HEIGHT}
          rx={4}
          fill="#102d1f"
          stroke="#22c55e"
          strokeWidth={1.5}
        />
        <text
          x={bx + 7}
          y={by + HEIGHT / 2 + 4}
          fontSize={10}
          fill="#22c55e"
          className="font-mono"
        >
          ◢
        </text>
        <text
          x={bx + 18}
          y={by + HEIGHT / 2 + 4}
          fontSize={11}
          fontWeight={600}
          fill="#22c55e"
          className="font-mono"
        >
          {label}
        </text>
      </g>
    )
  }
  return <g pointerEvents="none">{els}</g>
}

interface HeadBadgeProps {
  layout: MetroLayout
  status: { current: string | null; ahead: number; behind: number } | null
}

/**
 * The big HEAD badge anchored at the HEAD station. Rounded rectangle showing
 * the branch name + HEAD + commit's relative date — matches the mockup's
 * "main HEAD / May 20" plaque.
 */
function HeadBadge({ layout, status }: HeadBadgeProps): JSX.Element {
  const head = layout.headStation
  if (!head) return <></>
  const name = status?.current ?? 'HEAD'
  const w = 110
  const h = 60
  const bx = head.x + 18
  const by = head.y - h / 2
  return (
    <g pointerEvents="none">
      <line
        x1={head.x}
        y1={head.y}
        x2={bx}
        y2={head.y}
        stroke={head.color}
        strokeWidth={3.5}
        strokeLinecap="round"
      />
      <rect
        x={bx}
        y={by}
        width={w}
        height={h}
        rx={10}
        fill={`${head.color}1a`}
        stroke={head.color}
        strokeWidth={1.8}
      />
      {/* small terminus icon (square + diagonal) */}
      <rect
        x={bx + 10}
        y={by + 12}
        width={16}
        height={16}
        rx={3}
        fill={head.color}
        opacity={0.9}
      />
      <text
        x={bx + 18}
        y={by + 24}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
        fill="#0b0e14"
        className="font-mono"
      >
        ◢
      </text>
      <text
        x={bx + 32}
        y={by + 22}
        fontSize={12}
        fontWeight={700}
        fill={head.color}
        className="font-mono"
      >
        {truncate(name, 11)}
      </text>
      <text
        x={bx + 32}
        y={by + 36}
        fontSize={10}
        fontWeight={600}
        fill={head.color}
        opacity={0.85}
        className="font-mono"
      >
        HEAD
      </text>
      <text
        x={bx + 32}
        y={by + 50}
        fontSize={9}
        fill="#9aa3b8"
        className="font-mono"
      >
        {head.relativeDate}
      </text>
    </g>
  )
}

interface AheadBadgeProps {
  layout: MetroLayout
  status: { current: string | null; ahead: number; behind: number } | null
}

function AheadBadge({ layout, status }: AheadBadgeProps): JSX.Element {
  if (!status || (status.ahead === 0 && status.behind === 0)) return <></>
  const head = layout.headStation
  if (!head) return <></>
  const text =
    status.ahead > 0 && status.behind > 0
      ? `↑${status.ahead} ↓${status.behind}`
      : status.ahead > 0
        ? `${status.ahead} ahead`
        : `${status.behind} behind`
  const w = text.length * 7 + 28
  const h = 22
  const bx = head.x - w - 24
  const by = head.y - layout.laneHeight * 0.55
  return (
    <g pointerEvents="none">
      <rect
        x={bx}
        y={by}
        width={w}
        height={h}
        rx={h / 2}
        fill="#0b0e14"
        stroke={head.color}
        strokeWidth={1.5}
      />
      {/* tiny train icon */}
      <rect x={bx + 7} y={by + 6} width={10} height={10} rx={1.5} fill={head.color} />
      <text
        x={bx + 22}
        y={by + h / 2 + 4}
        fontSize={11}
        fontWeight={600}
        fill={head.color}
        className="font-mono"
      >
        {text}
      </text>
    </g>
  )
}

// ── Overlays (non-SVG) ─────────────────────────────────────────────────────

/** Compass + "Follow the flow" overlay anchored top-left. */
function CompassOverlay(): JSX.Element {
  return (
    <div className="absolute top-3 left-3 z-20 flex items-center gap-2.5 bg-bg-panel/80 border border-line rounded-lg pl-2 pr-3 py-1.5 backdrop-blur shadow-lg">
      <div className="w-9 h-9 rounded-full bg-bg-subtle border border-line flex items-center justify-center text-accent">
        <Compass size={18} strokeWidth={1.8} />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-[11px] uppercase tracking-wider text-muted">Legend</span>
        <span className="text-[12px] text-text font-medium">Follow the flow →</span>
      </div>
    </div>
  )
}

interface ZoomControlsProps {
  zoom: number
  onFit: () => void
  onIn: () => void
  onOut: () => void
}

function ZoomControls({ zoom, onFit, onIn, onOut }: ZoomControlsProps): JSX.Element {
  return (
    <div className="absolute bottom-3 left-3 z-20 flex items-center gap-0.5 bg-bg-panel/95 border border-line rounded-md backdrop-blur shadow-lg">
      <ZoomButton onClick={onFit} title="Fit map">
        <Maximize2 size={13} />
        <span className="ml-1 text-[11px]">Fit</span>
      </ZoomButton>
      <span className="w-px h-5 bg-line" />
      <ZoomButton onClick={onIn} title="Zoom in" disabled={zoom >= ZOOM_MAX}>
        <Plus size={13} />
      </ZoomButton>
      <ZoomButton onClick={onOut} title="Zoom out" disabled={zoom <= ZOOM_MIN}>
        <Minus size={13} />
      </ZoomButton>
      <span className="w-px h-5 bg-line" />
      <span className="px-2 text-[10px] text-muted font-mono tabular-nums">
        {Math.round(zoom * 100)}%
      </span>
      <span className="w-px h-5 bg-line" />
      <ZoomButton onClick={() => undefined} title="Pinned (always shows HEAD)">
        <Lock size={13} />
      </ZoomButton>
      <span className="w-px h-5 bg-line" />
      <span className="px-2 text-[10px] text-muted inline-flex items-center gap-1">
        <CheckCircle2 size={11} className="text-success" />
        {/* spacing reserved for inline help; not currently shown */}
        <Tag size={11} className="text-success/0 -ml-2" />
      </span>
    </div>
  )
}

function ZoomButton({
  onClick,
  title,
  disabled,
  children
}: {
  onClick: () => void
  title: string
  disabled?: boolean
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="px-2 py-1.5 text-text hover:bg-line disabled:opacity-40 disabled:hover:bg-transparent inline-flex items-center"
    >
      {children}
    </button>
  )
}
