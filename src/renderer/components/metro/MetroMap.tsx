import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Plus,
  Minus,
  Maximize2,
  Lock,
  Tag,
  CheckCircle2,
  XCircle
} from 'lucide-react'
import type { Ref } from '@shared/types'
import { useRepo } from '../../store/useRepo'
import {
  computeMetroLayout,
  dateRangeCutoff,
  buildCiByHash,
  type MetroStation,
  type MetroLayout
} from './computeMetroLayout'
import {
  laneColor,
  laneCasing,
  laneStaleTint,
  DASH_STALE,
  DASH_FUTURE,
  LABEL_COLOR,
  LABEL_COLOR_SELECTED
} from './colors'
import { branchOffPathVertical, laneRunPath } from './paths'
import { Station } from './Station'
import { TrainMarker } from './TrainMarker'
import { ContextMenu, type MenuItem } from '../ContextMenu'
import { useMapCi } from '../../hooks/useMapCi'
import type { CheckRollupState, CommitChecksInfo } from '@shared/types'

const ZOOM_MIN = 0.55
const ZOOM_MAX = 1.6
const COMMIT_LABEL_PAD = 12

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
  const highlightedBranchId = useRepo((s) => s.highlightedBranchId)
  const setHighlightedBranchId = useRepo((s) => s.setHighlightedBranchId)
  const pushToast = useRepo((s) => s.pushToast)
  const setBusy = useRepo((s) => s.setBusy)
  const busy = useRepo((s) => s.busy)
  const refreshSignal = useRepo((s) => s.refreshSignal)
  const metroFilters = useRepo((s) => s.metroFilters)
  const ciByCommit = useRepo((s) => s.ciByCommit)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)

  // Viewport state — used for "frustum culling" of CI fetches: we only
  // ask `gh` about commits that are currently visible (or about to be).
  // Updates are debounced so a fast scroll doesn't spam fetches.
  const [viewport, setViewport] = useState({
    scrollLeft: 0,
    scrollTop: 0,
    clientWidth: 800,
    clientHeight: 600
  })


  const ciByHash = useMemo(() => buildCiByHash(ciByCommit), [ciByCommit])

  const layout = useMemo(
    () =>
      computeMetroLayout(graph, refs, status?.branch.current ?? null, {
        showMerged: metroFilters.showMerged,
        showStale: metroFilters.showStale,
        ciFilter: metroFilters.ciStatus,
        ciByHash,
        author: metroFilters.author,
        dateCutoffMs: dateRangeCutoff(metroFilters.dateRange)
      }),
    [
      graph,
      refs,
      status?.branch.current,
      metroFilters.showMerged,
      metroFilters.showStale,
      metroFilters.ciStatus,
      metroFilters.author,
      metroFilters.dateRange,
      ciByHash
    ]
  )

  // Frustum-cull CI fetches to what's actually on screen. Compute the
  // viewport bounds in graph-space (un-zoomed) with a half-viewport pad
  // in each direction so stations just off-screen pre-fetch and are
  // ready by the time the user scrolls them into view.
  const ciHashes = useMemo(() => {
    const padX = viewport.clientWidth * 0.5
    const padY = viewport.clientHeight * 0.5
    const minX = (viewport.scrollLeft - padX) / zoom
    const maxX = (viewport.scrollLeft + viewport.clientWidth + padX) / zoom
    const minY = (viewport.scrollTop - padY) / zoom
    const maxY = (viewport.scrollTop + viewport.clientHeight + padY) / zoom
    const out: string[] = []
    for (const s of layout.stations) {
      if (s.x >= minX && s.x <= maxX && s.y >= minY && s.y <= maxY) {
        out.push(s.hash)
      }
    }
    return out
  }, [layout.stations, viewport, zoom])
  useMapCi(ciHashes)
  const ciCommitLoading = useRepo((s) => s.ciCommitLoading)

  // Initial scroll: horizontally to the right (HEAD / newest commits) and
  // vertically so main is centered in the viewport. We do this exactly
  // ONCE per repo — putting `zoom` in the deps would re-anchor to HEAD
  // every time the user hits +/-, snapping them away from wherever they
  // had scrolled.
  const didInitialScrollRef = useRef(false)
  useEffect(() => {
    didInitialScrollRef.current = false
  }, [activeRepo?.path])
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (didInitialScrollRef.current) return
    if (layout.width === 0) return
    didInitialScrollRef.current = true
    // Vertical layout: scroll to top (newest commits), center main lane horizontally
    const targetLeft = Math.max(0, layout.mainLaneY * zoom - el.clientWidth / 2)
    el.scrollTo({ left: targetLeft, top: 0, behavior: 'auto' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.width, layout.mainLaneY])

  // Zoom anchor: when the user clicks +/-, capture the world-space point
  // currently at the center of the viewport, then re-anchor scroll after
  // zoom updates the inner div size. Without this the scrollbar's pixel
  // position is preserved but the visible content slides off-center.
  // `doFit` does its own explicit scrollTo so it deliberately doesn't
  // queue an anchor here.
  const zoomAnchorRef = useRef<{ wcx: number; wcy: number } | null>(null)
  const prevZoomRef = useRef(zoom)
  const captureZoomAnchor = (): void => {
    const el = scrollRef.current
    if (!el) return
    zoomAnchorRef.current = {
      wcx: (el.scrollLeft + el.clientWidth / 2) / zoom,
      wcy: (el.scrollTop + el.clientHeight / 2) / zoom
    }
  }
  useLayoutEffect(() => {
    if (prevZoomRef.current === zoom) return
    prevZoomRef.current = zoom
    const el = scrollRef.current
    const anchor = zoomAnchorRef.current
    if (!el || !anchor) return
    zoomAnchorRef.current = null
    el.scrollLeft = Math.max(0, anchor.wcx * zoom - el.clientWidth / 2)
    el.scrollTop = Math.max(0, anchor.wcy * zoom - el.clientHeight / 2)
  }, [zoom])

  // Listen for global "fit" events from the TopBar. `doFit` reads the
  // viewport from the live ref each time, so we don't need a resize state.
  useEffect(() => {
    const onFit = (): void => doFit()
    window.addEventListener('gitmetro:fit', onFit)
    return () => window.removeEventListener('gitmetro:fit', onFit)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.width])

  // The map is gated by an early return when there's no repo / no graph,
  // so `scrollRef.current` is null on the first render. We re-run the
  // listener-attaching effect whenever this gate flips so the scroll
  // listener actually lands on the real div once it mounts.
  const mapMounted = !!activeRepo && graph.length > 0

  // Track scroll position + viewport size with a debounce so we only
  // recompute the visible-station set when the user pauses scrolling.
  // 150ms feels instant when you stop dragging, while still coalescing
  // a fast wheel-scroll into a single update.
  useEffect(() => {
    if (!mapMounted) return
    const el = scrollRef.current
    if (!el) return

    // Debounced update for CI frustum culling (avoids spamming gh fetches).
    let timer: ReturnType<typeof setTimeout> | null = null
    const updateDebounced = (): void => {
      setViewport({
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight
      })
    }
    const scheduleDebounced = (): void => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(updateDebounced, 150)
    }

    // Seed on mount
    updateDebounced()

    el.addEventListener('scroll', scheduleDebounced, { passive: true })
    window.addEventListener('resize', scheduleDebounced)
    return () => {
      if (timer) clearTimeout(timer)
      el.removeEventListener('scroll', scheduleDebounced)
      window.removeEventListener('resize', scheduleDebounced)
    }
  }, [mapMounted])

  // Force a fresh viewport sample whenever the layout settles or the user
  // zooms — needed because the "scroll to HEAD" effect lands the scrollbar
  // far to the right after data loads, but a passive scroll listener with
  // a 150ms debounce would leave the visible-set stale for the first
  // moment. We use a double-rAF here: the first frame waits for the
  // initial-scroll effect to run, the second reads the post-scroll values.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (layout.width === 0) return
    let raf2: number | null = null
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setViewport({
          scrollLeft: el.scrollLeft,
          scrollTop: el.scrollTop,
          clientWidth: el.clientWidth,
          clientHeight: el.clientHeight
        })
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      if (raf2 !== null) cancelAnimationFrame(raf2)
    }
  }, [layout.width, layout.height, layout.mainLaneY, zoom])

  // Listen for "scroll-to-commit" events dispatched by the sidebar when the
  // user clicks a branch name. Scrolls the map so the tip station is centred
  // horizontally and vertically, then selects it.
  useEffect(() => {
    const onScrollTo = (e: Event): void => {
      const hash = (e as CustomEvent<{ hash: string }>).detail?.hash
      if (!hash) return
      const station = layout.stations.find((s) => s.hash === hash)
      if (!station) return
      const el = scrollRef.current
      if (!el) return
      const tx = Math.max(0, station.x * zoom - el.clientWidth / 2)
      const ty = Math.max(0, station.y * zoom - el.clientHeight / 2)
      el.scrollTo({ left: tx, top: ty, behavior: 'smooth' })
      setSelectedCommit(station.hash)
    }
    window.addEventListener('gitmetro:scroll-to-commit', onScrollTo)
    return () => window.removeEventListener('gitmetro:scroll-to-commit', onScrollTo)
  }, [layout.stations, zoom, setSelectedCommit])

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

  const onStationClick = (e: React.MouseEvent, station: MetroStation): void => {
    e.stopPropagation()
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

  // Fit zoom + scroll so that the stations currently in the viewport
  // exactly fill it. This is the "zoom to what I'm looking at" gesture
  // every design tool has — distinct from "fit the whole map", which
  // would yank the user back to graph[0] every time. If the user is
  // currently parked over an empty patch (no stations in view), we
  // gracefully fall back to fitting the whole map width.
  const doFit = (): void => {
    const el = scrollRef.current
    if (!el || layout.width === 0) return

    // World-space rect that the viewport currently shows.
    const inv = 1 / zoom
    const vx0 = el.scrollLeft * inv
    const vx1 = (el.scrollLeft + el.clientWidth) * inv
    const vy0 = el.scrollTop * inv
    const vy1 = (el.scrollTop + el.clientHeight) * inv
    // Slightly enlarge the test rect so a station sitting just at the
    // edge counts as "in view" — saves one obvious case of "I can see
    // it but Fit ignored it".
    const M = 30
    let bMinX = Infinity
    let bMaxX = -Infinity
    let bMinY = Infinity
    let bMaxY = -Infinity
    let count = 0
    for (const s of layout.stations) {
      if (
        s.x >= vx0 - M &&
        s.x <= vx1 + M &&
        s.y >= vy0 - M &&
        s.y <= vy1 + M
      ) {
        if (s.x < bMinX) bMinX = s.x
        if (s.x > bMaxX) bMaxX = s.x
        if (s.y < bMinY) bMinY = s.y
        if (s.y > bMaxY) bMaxY = s.y
        count++
      }
    }

    let targetZoom: number
    let centerX: number
    let centerY: number
    if (count === 0) {
      // Nothing on screen — fall back to fitting the whole map width
      // and re-centering on main, like the old behaviour.
      targetZoom = Math.min(
        ZOOM_MAX,
        Math.max(ZOOM_MIN, (el.clientWidth - 16) / layout.width)
      )
      centerX = layout.width / 2
      centerY = layout.mainLaneY
    } else {
      // Pad in WORLD units so station labels/markers (which extend
      // beyond the bare (x, y) center) don't get clipped against the
      // viewport edges. 80px ≈ widest label + marker radius.
      const PAD = 80
      const boxW = bMaxX - bMinX + 2 * PAD
      const boxH = bMaxY - bMinY + 2 * PAD
      const zX = el.clientWidth / boxW
      const zY = el.clientHeight / boxH
      targetZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(zX, zY)))
      centerX = (bMinX + bMaxX) / 2
      centerY = (bMinY + bMaxY) / 2
    }

    // Suppress the zoom-anchor `useLayoutEffect` so it doesn't re-anchor
    // on the OLD viewport center and fight our explicit scrollTo.
    prevZoomRef.current = targetZoom
    zoomAnchorRef.current = null
    setZoom(targetZoom)

    // Wait for the inner div to resize at the new zoom before scrolling.
    // requestAnimationFrame fires after React commits, so `clientWidth`
    // and the scroll bounds reflect the new layout.
    requestAnimationFrame(() => {
      const el2 = scrollRef.current
      if (!el2) return
      el2.scrollTo({
        left: Math.max(0, centerX * targetZoom - el2.clientWidth / 2),
        top: Math.max(0, centerY * targetZoom - el2.clientHeight / 2),
        behavior: 'smooth'
      })
    })
  }
  const zoomIn = (): void => {
    captureZoomAnchor()
    setZoom((z) => Math.min(ZOOM_MAX, +(z + 0.1).toFixed(2)))
  }
  const zoomOut = (): void => {
    captureZoomAnchor()
    setZoom((z) => Math.max(ZOOM_MIN, +(z - 0.1).toFixed(2)))
  }

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
              // Layer the radial accent gradient over a faint 24x24 dot grid
              // so the dark canvas reads more like patterned paper than a
              // flat field. The dot is barely-there (≈4% opacity) on purpose.
              backgroundImage: [
                'radial-gradient(ellipse 60% 60% at 80% 50%, rgba(59,130,246,0.07), transparent 70%)',
                'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.045) 1px, transparent 1.5px)'
              ].join(', '),
              backgroundSize: 'auto, 24px 24px',
              backgroundPosition: '0 0, 0 0'
            }}
            onClick={() => {
              setSelectedCommit(null)
              setHighlightedBranchId(null)
            }}
          >
            <LaneTracks layout={layout} highlight={isLaneHighlighted} />
            <ColumnGrid layout={layout} />
            <Lines layout={layout} highlight={isLaneHighlighted} />
            <Curves layout={layout} highlight={isLaneHighlighted} />
            {/* Connector lines rendered under everything else so they don't
                obscure station dots or badges. Pill lines extend from x=0
                to the station (the sticky pill sits over x=0 in the viewport).
                Label dotted lines extend from the station all the way to the
                SVG's right edge — the scroll container clips them exactly at
                the viewport boundary where the sticky label lives, making
                them appear to terminate at the label. */}
            <ConnectorLines
              layout={layout}
              highlight={isLaneHighlighted}
              selectedHash={selectedCommit}
            />
            <Trains layout={layout} refs={refs} />

            <TagBadges layout={layout} highlight={isLaneHighlighted} ciByCommit={ciByCommit} />

            {oldestStation && (
              <StartMarker layout={layout} station={oldestStation} />
            )}

            {layout.stations.map((station) => {
              const dim = !isLaneHighlighted(station.lane)
              return (
                <Station
                  key={station.hash}
                  station={station}
                  selected={selectedCommit === station.hash}
                  dimmed={!!dim}
                  onClick={(e) => onStationClick(e, station)}
                  onContextMenu={(e) => onStationContextMenu(e, station)}
                  onMouseEnter={(e) => onStationHover(e, station)}
                  onMouseLeave={onStationLeave}
                />
              )
            })}

            <AheadBadge layout={layout} status={status?.branch ?? null} />
            <ConflictBadge
              layout={layout}
              conflictCount={status?.conflicted.length ?? 0}
            />

            {/* Per-station CI marks — only for non-HEAD, non-tagged stations
                that have cached CI data. HEAD/tag plaques render their own. */}
            <StationCiMarks
              layout={layout}
              ciByCommit={ciByCommit}
              ciCommitLoading={ciCommitLoading}
            />
          </svg>

          {/* ── Branch name pills — sticky-left, scroll vertically with map ──
              Each pill lives at the world-y of its branch tip, inside the same
              scroll container as the SVG. `position: sticky; left` keeps it
              pinned to the left viewport edge as the user scrolls horizontally,
              while the outer `position: absolute; top` means it scrolls
              vertically together with the map on the same compositor layer —
              zero JS lag. */}
          {layout.terminals.map((t) => {
            const dim = !isLaneHighlighted(t.lane)
            const color = t.stale ? laneStaleTint(t.color) : t.color
            const worldY = (t.y + layout.laneHeight * 0.55) * zoom
            const pillLabel = truncate(t.name, 26)
            const pillH = 17
            const isHead = t.lane === layout.headStation?.lane
            const ci = isHead ? ciStateFor(layout.headStation?.hash, ciByCommit) : null
            return (
              <div
                key={`pill-${t.lane}`}
                style={{
                  position: 'absolute',
                  top: worldY - pillH / 2,
                  left: 0,
                  right: 0,
                  height: pillH,
                  overflow: 'visible',
                  pointerEvents: 'none',
                  zIndex: 10,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <div
                  title={isHead ? t.name : `Double-click to checkout ${t.name}`}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    if (!activeRepo || isHead) return
                    runWithBusy(`Checkout ${t.name}`, () =>
                      window.git.branch.checkout(activeRepo.path, t.name)
                    )
                  }}
                  style={{
                    position: 'sticky',
                    left: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    boxSizing: 'border-box',
                    height: pillH,
                    paddingLeft: 14,
                    paddingRight: 10,
                    borderRadius: pillH / 2,
                    background: '#0b0e14',
                    border: `1.5px solid ${color}CC`,
                    fontSize: 10,
                    fontWeight: 600,
                    color: color,
                    letterSpacing: '0.01em',
                    whiteSpace: 'nowrap',
                    opacity: dim ? 0.25 : 1,
                    userSelect: 'none',
                    pointerEvents: 'auto',
                    cursor: isHead ? 'default' : 'pointer',
                  }}
                >
                  {pillLabel}
                  {isHead && (
                    <span style={{
                      fontSize: 8,
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      color: color,
                      opacity: 0.75,
                      background: `${color}22`,
                      padding: '1px 4px',
                      borderRadius: 3,
                    }}>
                      HEAD
                    </span>
                  )}
                  {ci && (
                    <span style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: ci === 'success' ? '#22c55e' : ci === 'failure' ? '#ef4444' : '#f59e0b',
                    }} />
                  )}
                </div>
              </div>
            )
          })}

          {/* ── Commit message labels — sticky-right, scroll vertically with map ──
              Same compositor-layer trick as the pills above. The outer wrapper
              spans the full content width (left:0 right:0) so the inner
              sticky element has enough room to slide to the right edge.
              `flex-direction: row-reverse` pushes the sticky child to the
              right, and `position: sticky; right` keeps it at the viewport's
              right edge as the user scrolls horizontally. */}
          {(() => {
            const headHash = layout.headStation?.hash ?? null
            return layout.stations
              .filter((s) => s.hash !== headHash)
              .map((s) => {
                const dim = !isLaneHighlighted(s.lane)
                const isSelected = selectedCommit === s.hash
                const subject = truncate(s.subject, 50)
                const meta = `${s.author} · ${s.relativeDate}`
                const worldY = s.y * zoom
                return (
                  <div
                    key={`lbl-${s.hash}`}
                    style={{
                      position: 'absolute',
                      top: worldY - 13,
                      left: 0,
                      right: 0,
                      height: 0,
                      overflow: 'visible',
                      pointerEvents: 'none',
                      zIndex: 10,
                      display: 'flex',
                      flexDirection: 'row-reverse',
                    }}
                  >
                    <div
                      style={{
                        position: 'sticky',
                        right: COMMIT_LABEL_PAD,
                        opacity: dim ? 0.22 : 1,
                        textAlign: 'right',
                        lineHeight: 1.4,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: isSelected ? 600 : 400,
                          color: isSelected ? LABEL_COLOR_SELECTED : LABEL_COLOR,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {subject}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: '#6b7280',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {meta}
                      </div>
                    </div>
                  </div>
                )
              })
          })()}
        </div>
      </div>

      {/* Compass + Legend overlay at top-left */}

      {/* Zoom controls bottom-left */}
      <ZoomControls
        zoom={zoom}
        onFit={doFit}
        onIn={zoomIn}
        onOut={zoomOut}
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

interface LaneTracksProps {
  layout: MetroLayout
  highlight: (lane: number) => boolean
}

function LaneTracks({ layout, highlight }: LaneTracksProps): JSX.Element {
  // Faint vertical lane guides — one per lane column.
  const els: JSX.Element[] = []
  for (let l = 0; l < layout.laneCount; l++) {
    const x = layout.leftPad + l * layout.colWidth + layout.colWidth / 2
    const dim = !highlight(l)
    els.push(
      <line
        key={`track-${l}`}
        x1={x}
        x2={x}
        y1={0}
        y2={layout.height}
        stroke={laneColor(l)}
        strokeWidth={1}
        opacity={dim ? 0.02 : 0.04}
      />
    )
  }
  return <g pointerEvents="none">{els}</g>
}

interface GridProps { layout: MetroLayout }

function ColumnGrid(_props: GridProps): JSX.Element {
  // Intentionally empty: a vertical column grid fights the Tube-map aesthetic.
  // Keeping the component as a no-op preserves the JSX layer ordering above
  // without forcing edits everywhere it's used.
  return <g />
}

interface LinesProps {
  layout: MetroLayout
  highlight: (lane: number) => boolean
}

/**
 * Lane "rails": one continuous `<path>` per lane (with a darker casing stroke
 * underneath for depth) walking the full set of rows where the lane is live.
 * Stale lanes use a dashed inner stroke and a desaturated tint; the casing
 * stays solid so the line still reads as a real route.
 */
function Lines({ layout, highlight }: LinesProps): JSX.Element {
  const { rows, colWidth, laneHeight } = layout
  const STROKE = 5.5
  const CASING = STROKE + 3
  // x is fixed per lane column; y varies per row
  const xAt = (lane: number): number =>
    layout.leftPad + lane * colWidth + colWidth / 2
  const yAt = (rowIdx: number): number =>
    layout.topPad + rowIdx * laneHeight + laneHeight / 2

  // Group continuous live-cell runs per lane into path segments.
  const laneRuns = new Map<number, Array<Array<{ x: number; y: number }>>>()
  for (let l = 0; l < layout.laneCount; l++) {
    const runs: Array<Array<{ x: number; y: number }>> = []
    let current: Array<{ x: number; y: number }> | null = null
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const live = row.liveLanes[l] !== null && row.liveLanes[l] !== undefined
      if (live) {
        if (!current) {
          current = []
          runs.push(current)
        }
        current.push({ x: xAt(l), y: yAt(i) })
      } else if (current) {
        current = null
      }
    }
    if (runs.length > 0) laneRuns.set(l, runs)
  }

  const els: JSX.Element[] = []

  // Each lane run is the polyline through its live rows, rendered as-is —
  // the rail simply ends at the leftmost (oldest) station. Older versions
  // appended a `0.30·colWidth` stub past that point to reach a now-removed
  // "terminus pill" badge; that stub created visible doubled humps where it
  // overlapped neighbouring connectors and is no longer needed. Branch-off
  // elbows on child lanes terminate at their child's leftmost station; the
  // elbow's own geometry handles the visual bridge to the trunk below.

  // Pass 1: casings (drawn FIRST so they sit underneath every colored stroke).
  for (const [l, runs] of laneRuns.entries()) {
    const dim = !highlight(l)
    if (dim) continue
    for (let ri = 0; ri < runs.length; ri++) {
      const pts = runs[ri]
      els.push(
        <path
          key={`casing-${l}-${ri}`}
          d={laneRunPath(pts)}
          fill="none"
          stroke={laneCasing(laneColor(l))}
          strokeWidth={CASING}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.85}
        />
      )
    }
  }

  // Pass 2: colored inner strokes.
  for (const [l, runs] of laneRuns.entries()) {
    const dim = !highlight(l)
    const stale = layout.staleLanes.has(l)
    const baseColor = stale ? laneStaleTint(laneColor(l)) : laneColor(l)
    for (let ri = 0; ri < runs.length; ri++) {
      const pts = runs[ri]
      els.push(
        <path
          key={`rail-${l}-${ri}`}
          d={laneRunPath(pts)}
          fill="none"
          stroke={baseColor}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={dim ? 0.15 : stale ? 0.6 : 0.95}
          strokeDasharray={stale ? DASH_STALE : undefined}
        />
      )
    }
  }

  // Future stub above HEAD — dotted upward, suggesting "track ahead".
  if (rows.length > 0) {
    const newest = rows[0]
    const x = xAt(newest.lane)
    const y0 = yAt(0)
    const y1 = y0 - laneHeight * 2.1
    els.push(
      <line
        key="stub-future-casing"
        x1={x}
        x2={x}
        y1={y0}
        y2={y1}
        stroke={laneCasing(laneColor(newest.lane))}
        strokeWidth={CASING}
        strokeLinecap="round"
        opacity={0.6}
      />
    )
    els.push(
      <line
        key="stub-future"
        x1={x}
        x2={x}
        y1={y0}
        y2={y1}
        stroke={laneColor(newest.lane)}
        strokeWidth={STROKE}
        strokeLinecap="round"
        opacity={0.55}
        strokeDasharray={DASH_FUTURE}
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
 * Tube-style splines for branch-offs and merges. Each connector is a 3-segment
 * composite (flat lead-out → sweeping cubic → flat lead-in) drawn with a
 * darker casing stroke underneath the colored line for depth.
 */
function Curves({ layout, highlight }: CurvesProps): JSX.Element {
  const { rows, colWidth, laneHeight } = layout
  const STROKE = 5.5
  const CASING = STROKE + 3
  const casings: JSX.Element[] = []
  const inners: JSX.Element[] = []
  // Vertical layout: x is fixed per lane, y varies per row
  const xAt = (lane: number): number =>
    layout.leftPad + lane * colWidth + colWidth / 2
  const yAt = (rowIdx: number): number =>
    layout.topPad + rowIdx * laneHeight + laneHeight / 2

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const { commit, lane, parentLanes } = row
    const x1 = xAt(lane)
    const y1 = yAt(i)

    for (let pi = 0; pi < parentLanes.length; pi++) {
      const pl = parentLanes[pi]
      if (pl < 0 || pl === lane) continue
      const parentHash = commit.parents[pi]
      const parentRow = rows.findIndex((r) => r.commit.hash === parentHash)
      if (parentRow === -1) continue
      const x2 = xAt(pl)
      const y2 = yAt(parentRow)
      const d = branchOffPathVertical(x1, y1, x2, y2, laneHeight, colWidth)
      const dim = !highlight(pl) && !highlight(lane)
      const stale = layout.staleLanes.has(lane)
      const branchColor = laneColor(lane)
      const baseColor = stale ? laneStaleTint(branchColor) : branchColor
      const key = `curve-p-${commit.hash}-${pi}`
      if (!dim) {
        casings.push(
          <path
            key={`${key}-casing`}
            d={d}
            fill="none"
            stroke={laneCasing(branchColor)}
            strokeWidth={CASING}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.85}
          />
        )
      }
      inners.push(
        <path
          key={key}
          d={d}
          fill="none"
          stroke={baseColor}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={dim ? 0.15 : stale ? 0.6 : 0.95}
          strokeDasharray={stale ? DASH_STALE : undefined}
        />
      )
    }

    // NOTE: We intentionally do NOT iterate `mergeFrom` here. `mergeFrom`
    // is populated in `computeLanes` whenever multiple pending lanes are
    // waiting for the same commit — i.e. at *fork / lane-convergence*
    // points (where a branch was originally cut off the trunk), not at
    // merge commits. At every such point the visual connection is
    // ALREADY drawn by the branch-off iteration on the donor lane's
    // first commit (whose parent lives on the trunk). Drawing a second
    // elbow here, anchored at a synthetic `i + 1` source row, only
    // produced a stub running off the wrong side of the riser into a
    // column where the donor lane isn't even live.
  }
  // Casings rendered first so colored strokes always sit on top.
  return <g>{casings}{inners}</g>
}

interface ConnectorLinesProps {
  layout: MetroLayout
  highlight: (lane: number) => boolean
  selectedHash: string | null
}

/**
 * Pill connector lines (solid, from x=0 to station) and label dotted lines
 * (dashed, from station to the SVG's far-right edge). Both are drawn in SVG
 * world coordinates so they scroll natively with the map.
 *
 * The pill line starts at x=0 — the CSS-sticky pill sits over that origin in
 * the viewport, so they visually connect without any JS position sync.
 *
 * The label dotted line extends to `layout.width` — the scroll container's
 * overflow:auto clips SVG content at the viewport's right edge, which is
 * exactly where the sticky label lives. The line always appears to terminate
 * right at the label.
 */
function ConnectorLines({ layout, highlight, selectedHash }: ConnectorLinesProps): JSX.Element {
  const headHash = layout.headStation?.hash ?? null
  const { laneHeight, rightPad } = layout
  // x2 for label lines: extend to near the SVG's right edge.
  // For maps wider than the viewport the SVG is clipped at the viewport's
  // right boundary — exactly where the CSS-sticky label lives — so the line
  // visually terminates at the label with no JS needed. For narrower maps the
  // label sits at its natural position inside the label area, which is also
  // near this x.
  const labelLineX2 = layout.width - rightPad - 8
  const els: JSX.Element[] = []

  // Map from lane → x of the newest (smallest row index) station on that lane.
  // Using the real station x avoids overshoot when laneFirstRow was seeded
  // via a parent-lane reference and t.x (= lx(t.lane)) is further right than
  // where the station dot actually sits.
  const laneTipXFinal = new Map<number, number>()
  {
    const laneTipRow = new Map<number, number>()
    for (const s of layout.stations) {
      const curRow = laneTipRow.get(s.lane)
      if (curRow === undefined || s.row < curRow) {
        laneTipRow.set(s.lane, s.row)
        laneTipXFinal.set(s.lane, s.x)
      }
    }
  }

  // Pill connector lines.
  // t.y is the terminal anchor *above* the tip station:
  //   t.y = stationY - laneHeight * 0.55
  // Adding 0.55*laneHeight brings us to the actual station/pill y.
  // x1 starts at the SVG left edge — the opaque sticky pill masks it.
  for (const t of layout.terminals) {
    const dim = !highlight(t.lane)
    const color = t.stale ? laneStaleTint(t.color) : t.color
    const lineY = t.y + laneHeight * 0.55
    const stationX = laneTipXFinal.get(t.lane) ?? t.x
    els.push(
      <line
        key={`pill-line-${t.lane}`}
        x1={0} y1={lineY}
        x2={stationX - 12} y2={lineY}
        stroke={color}
        strokeWidth={1.5}
        strokeOpacity={dim ? 0.1 : 0.45}
      />
    )
  }

  // Commit label dotted lines.
  for (const s of layout.stations) {
    if (s.hash === headHash) continue
    // Skip stations already inside the label area — their label is
    // immediately adjacent and a long line would look wrong.
    if (s.x + 12 >= labelLineX2) continue
    const dim = !highlight(s.lane)
    const isSelected = selectedHash === s.hash
    els.push(
      <line
        key={`label-line-${s.hash}`}
        x1={s.x + 12} y1={s.y}
        x2={labelLineX2} y2={s.y}
        stroke={s.color}
        strokeWidth={1}
        strokeOpacity={isSelected ? 0.4 : (dim ? 0.06 : 0.18)}
        strokeDasharray="2 4"
      />
    )
  }

  return <g pointerEvents="none">{els}</g>
}

interface TrainsProps {
  layout: MetroLayout
  refs: { local: Ref[]; remote: Ref[] }
}

function Trains({ layout, refs }: TrainsProps): JSX.Element {
  const els: JSX.Element[] = []

  // 1) Tip trains — branches with an open PR (upstream + not current). These
  //    pulse to suggest "in flight" toward merge.
  const tipHashes = new Set(
    refs.local.filter((r) => r.upstream && !r.current).map((r) => r.hash)
  )
  for (const station of layout.stations) {
    if (!tipHashes.has(station.hash)) continue
    const tx = station.x
    const ty = station.y - layout.laneHeight * 0.55
    els.push(
      <TrainMarker
        key={`train-tip-${station.hash}`}
        x={tx}
        y={ty}
        color={station.color}
        pulsing
        size="tip"
      />
    )
  }

  // 2) Mid-route trains — one train rides each stale/dotted lane near the
  //    middle of its run, like a Tube train traveling along the line.
  const stationsByLane = new Map<number, MetroStation[]>()
  for (const s of layout.stations) {
    const list = stationsByLane.get(s.lane) ?? []
    list.push(s)
    stationsByLane.set(s.lane, list)
  }
  for (const lane of layout.staleLanes) {
    const laneStations = stationsByLane.get(lane)
    if (!laneStations || laneStations.length === 0) continue
    // Pick the middle station along this lane.
    const mid = laneStations[Math.floor(laneStations.length / 2)]
    // Offset slightly so the train sits between two stations rather than
    // ON one of them.
    const offsetY = laneStations.length > 1 ? layout.laneHeight * 0.5 : 0
    els.push(
      <TrainMarker
        key={`train-stale-${lane}`}
        x={mid.x}
        y={mid.y + offsetY}
        color={mid.color}
        size="mid"
      />
    )
  }

  return <g>{els}</g>
}


/**
 * Derive a short "route name" for an interchange station — the merged-in
 * branch name (e.g. "feature/auth"), if discoverable from the station's
 * refs or subject. Falls back to null if we can't infer one cleanly.
 */

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n - 1) + '…'
}

/**
 * Resolve a commit's CI rollup state from the cached `ciByCommit` slice.
 * Returns null when there's no cached entry, the entry is null (no PR / no
 * checks), or the rollup is `'none'` — i.e. when nothing meaningful should
 * render on the plaque.
 */
function ciStateFor(
  hash: string | undefined,
  ciByCommit: Record<string, CommitChecksInfo | null>
): CheckRollupState | null {
  if (!hash) return null
  const info = ciByCommit[hash]
  if (!info) return null
  if (info.rollup === 'none') return null
  return info.rollup
}

interface CiMarkProps {
  state: CheckRollupState
  cx: number
  cy: number
  r?: number
}

/**
 * A small CI status mark for plaques: green check on success, red X on
 * failure, amber dot when pending. Sized to sit in the top-right of a
 * badge without dominating it.
 */
function CiMark({ state, cx, cy, r = 7 }: CiMarkProps): JSX.Element {
  if (state === 'success') {
    return (
      <g transform={`translate(${cx - r}, ${cy - r})`}>
        <circle cx={r} cy={r} r={r + 1} fill="#0b1a12" />
        <CheckCircle2 size={r * 2} color="#22c55e" strokeWidth={2.4} />
      </g>
    )
  }
  if (state === 'failure') {
    return (
      <g transform={`translate(${cx - r}, ${cy - r})`}>
        <circle cx={r} cy={r} r={r + 1} fill="#1a0b0e" />
        <XCircle size={r * 2} color="#ef4444" strokeWidth={2.4} />
      </g>
    )
  }
  // pending
  return (
    <g>
      <circle cx={cx} cy={cy} r={r - 1} fill="#0b0e14" stroke="#f59e0b" strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={2} fill="#f59e0b" />
    </g>
  )
}

interface TagBadgesProps {
  layout: MetroLayout
  highlight: (lane: number) => boolean
  ciByCommit: Record<string, CommitChecksInfo | null>
}

/**
 * Green rounded badges for tagged commits (e.g. "v1.3.0 (next)"). Drawn just
 * below the line near the station with a small connector dot.
 */
function TagBadges({ layout, highlight, ciByCommit }: TagBadgesProps): JSX.Element {
  const els: JSX.Element[] = []
  for (const s of layout.tagStations) {
    if (s.isHead) continue // HEAD badge already shows tags via its label
    const tag = s.refs.find((r) => r.fullName.startsWith('refs/tags/'))
    if (!tag) continue
    const dim = !highlight(s.lane)
    const label = tag.name
    const ci = ciStateFor(s.hash, ciByCommit)
    const ciPad = ci ? 16 : 0
    const width = Math.max(50, label.length * 6.8 + 18 + ciPad)
    const HEIGHT = 20
    // In vertical layout, badge goes to the right of the station
    const bx = s.x + 12
    const by = s.y - HEIGHT / 2
    els.push(
      <g key={`tag-${s.hash}`} opacity={dim ? 0.35 : 1}>
        <line
          x1={s.x + 8}
          y1={s.y}
          x2={bx}
          y2={s.y}
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
        {ci && (
          <CiMark state={ci} cx={bx + width - 9} cy={by + HEIGHT / 2} r={6} />
        )}
      </g>
    )
  }
  return <g pointerEvents="none">{els}</g>
}

interface StationCiMarksProps {
  layout: MetroLayout
  ciByCommit: Record<string, CommitChecksInfo | null>
  ciCommitLoading: Record<string, boolean>
}

/**
 * Renders a CI status mark on every regular station that either has
 * cached CI data or is currently being fetched. Loading state shows
 * a faint pulsing ring so the user can see the map is busy populating
 * status. HEAD and tagged stations are skipped — their plaques carry
 * their own CI mark. The mark sits at the upper-right of the station
 * so it doesn't collide with the two-line label (above OR below) or
 * the perpendicular tick.
 */
function StationCiMarks({
  layout,
  ciByCommit,
  ciCommitLoading
}: StationCiMarksProps): JSX.Element {
  const els: JSX.Element[] = []
  const headHash = layout.headStation?.hash ?? null
  for (const s of layout.stations) {
    if (s.hash === headHash) continue
    if (s.hasTag) continue
    // CI mark sits just above each station dot
    const cx = s.x
    const cy = s.y - 13
    const state = ciStateFor(s.hash, ciByCommit)
    if (state) {
      els.push(<CiMark key={`scim-${s.hash}`} state={state} cx={cx} cy={cy} r={6.5} />)
      continue
    }
    // No cached state yet — if we're actively fetching, show a faint
    // pulsing dot so the user knows CI is loading. Once the result
    // resolves and the rollup is `'none'`, ciStateFor returns null and
    // this loader disappears with no green/red mark, which is correct.
    if (ciCommitLoading[s.hash]) {
      els.push(
        <circle
          key={`scim-load-${s.hash}`}
          cx={cx}
          cy={cy}
          r={5}
          fill="none"
          stroke={s.color}
          strokeWidth={1.5}
          strokeOpacity={0.5}
          strokeDasharray="2 3"
        >
          <animate
            attributeName="stroke-opacity"
            values="0.2;0.7;0.2"
            dur="1.4s"
            repeatCount="indefinite"
          />
        </circle>
      )
    }
  }
  return <g pointerEvents="none">{els}</g>
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
  // Place above-left of HEAD station
  const bx = head.x - w / 2
  const by = head.y - layout.laneHeight - 2
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

interface ConflictBadgeProps {
  layout: MetroLayout
  conflictCount: number
}

/**
 * Working-tree conflict indicator anchored just below the HEAD plaque.
 * Surfaces the legend's "Conflicts" item — only renders when the user
 * has unresolved merge conflicts in their checkout. Amber pill with
 * triangle glyph + count.
 */
function ConflictBadge({ layout, conflictCount }: ConflictBadgeProps): JSX.Element {
  if (conflictCount <= 0) return <></>
  const head = layout.headStation
  if (!head) return <></>
  const label = `${conflictCount} conflict${conflictCount === 1 ? '' : 's'}`
  const w = label.length * 6.5 + 30
  const h = 22
  // Below the head badge in vertical layout
  const bx = head.x + 18
  const by = head.y + layout.laneHeight * 0.6 + 4
  return (
    <g pointerEvents="none">
      <rect
        x={bx}
        y={by}
        width={w}
        height={h}
        rx={h / 2}
        fill="#1a140b"
        stroke="#f59e0b"
        strokeWidth={1.5}
      />
      {/* Warning triangle, drawn inline so we don't drag in another import. */}
      <path
        d={`M ${bx + 11} ${by + 5} L ${bx + 17} ${by + 16} L ${bx + 5} ${by + 16} Z`}
        fill="none"
        stroke="#f59e0b"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <line
        x1={bx + 11}
        y1={by + 9}
        x2={bx + 11}
        y2={by + 12}
        stroke="#f59e0b"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <circle cx={bx + 11} cy={by + 14} r={0.9} fill="#f59e0b" />
      <text
        x={bx + 22}
        y={by + h / 2 + 4}
        fontSize={11}
        fontWeight={600}
        fill="#f59e0b"
        className="font-mono"
      >
        {label}
      </text>
    </g>
  )
}

interface StartMarkerProps {
  layout: MetroLayout
  station: MetroStation
}

/**
 * Bottom-terminus marker for the oldest commit in vertical layout. Renders a
 * short tick below the station with "START" and the absolute date.
 */
function StartMarker({ layout, station }: StartMarkerProps): JSX.Element {
  const date = (() => {
    const d = new Date(station.date)
    if (Number.isNaN(d.getTime())) return station.relativeDate
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  })()
  const tickTop = station.y + 10
  const labelY = station.y + layout.laneHeight * 0.55 + 6
  return (
    <g pointerEvents="none">
      <line
        x1={station.x}
        y1={tickTop}
        x2={station.x}
        y2={labelY - 4}
        stroke={station.color}
        strokeWidth={1.5}
        strokeOpacity={0.7}
      />
      <text
        x={station.x}
        y={labelY}
        textAnchor="middle"
        fontSize={10}
        fontWeight={700}
        fill={station.color}
        style={{ letterSpacing: '0.18em' }}
      >
        START
      </text>
      <text
        x={station.x}
        y={labelY + 13}
        textAnchor="middle"
        fontSize={11}
        fontWeight={500}
        fill="#9aa3b8"
      >
        {date}
      </text>
    </g>
  )
}

// ── Overlays (non-SVG) ─────────────────────────────────────────────────────


interface ZoomControlsProps {
  zoom: number
  onFit: () => void
  onIn: () => void
  onOut: () => void
}

function ZoomControls({ zoom, onFit, onIn, onOut }: ZoomControlsProps): JSX.Element {
  return (
    <div className="absolute bottom-3 left-3 z-20 flex items-center gap-0.5 bg-bg-panel/95 border border-line rounded-md backdrop-blur shadow-lg">
      <ZoomButton onClick={onFit} title="Fit visible stations to screen">
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
