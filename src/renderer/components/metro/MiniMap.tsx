import { useMemo } from 'react'
import type { MetroLayout } from './computeMetroLayout'
import { laneColor } from './colors'

interface MiniMapProps {
  layout: MetroLayout
  viewport: { left: number; width: number }
  onJump: (xFraction: number) => void
}

const W = 240
const H = 80

/**
 * Horizontal overview strip in the bottom-right of the map area. Shows lane
 * tracks running left → right (matching the main map), all stations as dots,
 * and a viewport indicator that follows the user's scroll position.
 */
export function MiniMap({ layout, viewport, onJump }: MiniMapProps): JSX.Element {
  const sx = useMemo(() => W / Math.max(layout.width, 1), [layout.width])
  const sy = useMemo(() => H / Math.max(layout.height, 1), [layout.height])

  const viewportLeft = Math.max(0, viewport.left * sx)
  const viewportW = Math.max(10, viewport.width * sx)

  const onClick = (e: React.MouseEvent<SVGSVGElement>): void => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    onJump(x / W)
  }

  return (
    <div className="absolute bottom-3 right-3 bg-bg-panel/95 border border-line rounded-md shadow-xl backdrop-blur p-1.5 select-none">
      <div className="text-[10px] uppercase tracking-wide text-muted px-1 pb-1">Map</div>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        onClick={onClick}
        className="cursor-pointer"
      >
        <rect width={W} height={H} fill="#0a0d14" rx={3} />

        {/* Lane tracks */}
        {Array.from({ length: layout.laneCount }, (_, l) => {
          const y = (layout.topPad + l * layout.laneHeight + layout.laneHeight / 2) * sy
          return (
            <line
              key={`track-${l}`}
              x1={2}
              x2={W - 2}
              y1={y}
              y2={y}
              stroke={laneColor(l)}
              strokeWidth={1.2}
              opacity={0.18}
            />
          )
        })}

        {/* Per-row lane segments (so the user can see where branches live) */}
        {layout.rows.flatMap((row, i) => {
          const x1 = (layout.leftPad + (layout.cols - 1 - i) * layout.colWidth) * sx
          const x2 = (layout.leftPad + (layout.cols - i) * layout.colWidth) * sx
          return row.liveLanes.map((live, l) => {
            if (live === null) return null
            const y = (layout.topPad + l * layout.laneHeight + layout.laneHeight / 2) * sy
            return (
              <line
                key={`seg-${i}-${l}`}
                x1={Math.min(x1, x2)}
                x2={Math.max(x1, x2)}
                y1={y}
                y2={y}
                stroke={laneColor(l)}
                strokeWidth={1.4}
                opacity={0.7}
              />
            )
          })
        })}

        {/* Stations */}
        {layout.stations.map((s) => (
          <circle
            key={`mm-${s.hash}`}
            cx={s.x * sx}
            cy={s.y * sy}
            r={1.6}
            fill={s.color}
          />
        ))}

        {/* Viewport indicator */}
        <rect
          x={viewportLeft}
          y={1}
          width={viewportW}
          height={H - 2}
          fill="#5b8cff22"
          stroke="#5b8cff"
          strokeWidth={1}
          pointerEvents="none"
        />
      </svg>
    </div>
  )
}
