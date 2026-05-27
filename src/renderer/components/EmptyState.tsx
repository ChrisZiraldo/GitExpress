import { useMemo } from 'react'
import { Folder, TramFront } from 'lucide-react'
import { useRepo } from '../store/useRepo'
import { computeMetroLayout } from './metro/computeMetroLayout'
import { MOCK_GRAPH, MOCK_REFS } from '../data/gitMetroMock'

export function EmptyState(): JSX.Element {
  const setActiveRepo = useRepo((s) => s.setActiveRepo)
  const setRecents = useRepo((s) => s.setRecents)
  const pushToast = useRepo((s) => s.pushToast)

  const layout = useMemo(
    () => computeMetroLayout(MOCK_GRAPH, MOCK_REFS, 'main', { rowHeight: 34, laneWidth: 32 }),
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
          <p className="text-sm text-accent font-medium mt-1">Next Stop Main</p>
          <p className="text-sm text-muted mt-3">
            Read history the way you read a subway map. Branches are lines, commits are
            stations, and merges are interchanges — all powered by your local{' '}
            <code className="font-mono">git</code> CLI.
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

        {/* Right: mini metro preview */}
        <div className="bg-bg-subtle border border-line rounded-lg p-4 shadow-xl overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] uppercase tracking-wider text-muted">Sample line</span>
            <span className="text-[10px] text-muted font-mono">demo/main</span>
          </div>
          <svg
            width="100%"
            viewBox={`0 0 ${layout.width} ${Math.min(layout.height, 480)}`}
            className="block"
            preserveAspectRatio="xMinYMin meet"
          >
            {/* Vertical lane lines */}
            {layout.rows.map((row, i) => {
              if (i === layout.rows.length - 1) return null
              const cx = layout.leftPad + row.lane * layout.laneWidth + layout.laneWidth / 2
              const y1 = layout.topPad + i * layout.rowHeight + layout.rowHeight / 2
              const y2 = y1 + layout.rowHeight
              return (
                <line
                  key={`mock-${row.commit.hash}`}
                  x1={cx}
                  x2={cx}
                  y1={y1}
                  y2={y2}
                  stroke={laneStroke(row.lane)}
                  strokeWidth={3}
                  strokeLinecap="round"
                />
              )
            })}
            {/* Stations */}
            {layout.stations.map((s) => (
              <g key={s.hash}>
                <circle cx={s.x} cy={s.y} r={6} fill="#0b0e14" stroke={s.color} strokeWidth={2.5} />
                {s.isHead && <circle cx={s.x} cy={s.y} r={2.5} fill={s.color} />}
                <text
                  x={s.x + 14}
                  y={s.y + 3}
                  fontSize={10}
                  fill="#8a93a6"
                  className="font-mono"
                >
                  {s.subject}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  )
}

const PAL = ['#5b8cff', '#a672ff', '#3ecf8e', '#56cfe1', '#ff8a5b', '#ffd166', '#ff8fab', '#5a6275']
function laneStroke(l: number): string {
  return PAL[((l % PAL.length) + PAL.length) % PAL.length]
}
