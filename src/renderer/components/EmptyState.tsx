import { useMemo } from 'react'
import { Folder, TramFront } from 'lucide-react'
import { useRepo } from '../store/useRepo'
import { computeMetroLayout } from './metro/computeMetroLayout'
import { laneColor, laneCasing } from './metro/colors'
import { branchOffPath } from './metro/paths'
import { MOCK_GRAPH, MOCK_REFS } from '../data/gitMetroMock'

export function EmptyState(): JSX.Element {
  const setActiveRepo = useRepo((s) => s.setActiveRepo)
  const setRecents = useRepo((s) => s.setRecents)
  const pushToast = useRepo((s) => s.pushToast)

  const layout = useMemo(
    () =>
      computeMetroLayout(MOCK_GRAPH, MOCK_REFS, 'main', {
        colWidth: 44,
        laneHeight: 40,
        leftPad: 16,
        rightPad: 24,
        topPad: 28,
        bottomPad: 28
      }),
    []
  )

  const pick = async (): Promise<void> => {
    const res = await window.git.repo.pick()
    if (!res.ok) {
      pushToast('error', res.stderr)
      return
    }
    if (!res.data) return
    setActiveRepo(res.data)
    const recents = await window.git.repo.recents()
    if (recents.ok) setRecents(recents.data)
  }

  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="grid grid-cols-2 gap-10 max-w-3xl w-full items-center">
        {/* Left: marketing copy + CTA */}
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/30 text-accent text-xs mb-4">
            <TramFront size={12} />
            <span>All aboard</span>
          </div>
          <h1 className="text-3xl font-bold leading-tight text-text">
            Git Express
          </h1>
          <p className="text-sm text-accent font-medium mt-1">Read your repo like a subway map</p>
          <p className="text-sm text-muted mt-3">
            Branches are lines, commits are stations, and merges are interchanges —
            all powered by your local <code className="font-mono">git</code> CLI.
          </p>
          <div className="flex flex-col gap-2 mt-6">
            <button
              onClick={pick}
              className="px-4 py-2.5 rounded-md bg-accent hover:bg-accent-hover text-white font-medium text-sm inline-flex items-center justify-center gap-2"
            >
              <Folder size={14} />
              Open repository…
            </button>
            <span className="text-[11px] text-muted text-center">
              Or pick from recents in the top bar
            </span>
          </div>
        </div>

        {/* Right: horizontal mini metro preview */}
        <div className="bg-bg-subtle border border-line rounded-lg p-4 shadow-xl overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] uppercase tracking-wider text-muted">Sample line</span>
            <span className="text-[10px] text-muted font-mono">demo/main → HEAD</span>
          </div>
          <svg
            width="100%"
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            className="block"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Horizontal lane segments */}
            {layout.rows.map((row, i) => {
              if (i === layout.rows.length - 1) return null
              const x1 = layout.leftPad + (layout.cols - 1 - i) * layout.colWidth + layout.colWidth / 2
              const x2 = x1 - layout.colWidth
              const liveAtThisRow = row.liveLanes
              return liveAtThisRow.map((live, l) => {
                if (live === null) return null
                const y = layout.topPad + l * layout.laneHeight + layout.laneHeight / 2
                return (
                  <g key={`mock-${row.commit.hash}-${l}`}>
                    <line
                      x1={Math.min(x1, x2)}
                      x2={Math.max(x1, x2)}
                      y1={y}
                      y2={y}
                      stroke={laneCasing(laneColor(l))}
                      strokeWidth={6}
                      strokeLinecap="round"
                      opacity={0.85}
                    />
                    <line
                      x1={Math.min(x1, x2)}
                      x2={Math.max(x1, x2)}
                      y1={y}
                      y2={y}
                      stroke={laneColor(l)}
                      strokeWidth={4}
                      strokeLinecap="round"
                    />
                  </g>
                )
              })
            })}
            {/* Cross-lane splines for parents — same Tube-style geometry as the
                main map, with a darker casing underneath each colored stroke. */}
            {layout.rows.flatMap((row, i) => {
              const elements: JSX.Element[] = []
              const x1 = layout.leftPad + (layout.cols - 1 - i) * layout.colWidth + layout.colWidth / 2
              const y1 = layout.topPad + row.lane * layout.laneHeight + layout.laneHeight / 2
              row.parentLanes.forEach((pl, pi) => {
                if (pl < 0 || pl === row.lane) return
                const parentHash = row.commit.parents[pi]
                const parentRow = layout.rows.findIndex((r) => r.commit.hash === parentHash)
                if (parentRow === -1) return
                const x2 = layout.leftPad + (layout.cols - 1 - parentRow) * layout.colWidth + layout.colWidth / 2
                const y2 = layout.topPad + pl * layout.laneHeight + layout.laneHeight / 2
                const d = branchOffPath(x1, y1, x2, y2, layout.laneHeight, layout.colWidth)
                elements.push(
                  <path
                    key={`mockc-casing-${row.commit.hash}-${pi}`}
                    d={d}
                    fill="none"
                    stroke={laneCasing(laneColor(pl))}
                    strokeWidth={6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.85}
                  />
                )
                elements.push(
                  <path
                    key={`mockc-${row.commit.hash}-${pi}`}
                    d={d}
                    fill="none"
                    stroke={laneColor(pl)}
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )
              })
              return elements
            })}
            {/* Stations */}
            {layout.stations.map((s) => (
              <g key={s.hash}>
                <line
                  x1={s.x}
                  y1={s.y - 9}
                  x2={s.x}
                  y2={s.y + 9}
                  stroke={s.color}
                  strokeWidth={1.5}
                  strokeOpacity={0.7}
                />
                <circle cx={s.x} cy={s.y} r={7} fill="#0b0e14" stroke={s.color} strokeWidth={3} />
                {s.isHead && <circle cx={s.x} cy={s.y} r={3} fill={s.color} />}
              </g>
            ))}
            {/* HEAD label */}
            {layout.stations
              .filter((s) => s.isHead)
              .map((s) => (
                <text
                  key={`hl-${s.hash}`}
                  x={s.x}
                  y={s.y - 12}
                  textAnchor="middle"
                  fontSize={9}
                  fill={s.color}
                  className="font-mono"
                >
                  HEAD
                </text>
              ))}
          </svg>
        </div>
      </div>
    </div>
  )
}
