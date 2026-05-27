import { useMemo } from 'react'
import type { MetroLayout } from './computeMetroLayout'

interface MiniMapProps {
  layout: MetroLayout
  viewport: { top: number; height: number }
  onJump: (yFraction: number) => void
}

/**
 * A compact overview of the entire metro map shown bottom-right of the map area.
 * Renders lane lines and station dots at a small scale.
 */
export function MiniMap({ layout, viewport, onJump }: MiniMapProps): JSX.Element {
  const W = 160
  const H = 120

  const { sy, content } = useMemo(() => {
    const sxV = W / Math.max(layout.width, 1)
    const syV = H / Math.max(layout.height, 1)
    return { sy: syV, content: { sx: sxV, sy: syV } }
  }, [layout])

  const viewportTop = Math.max(0, viewport.top * sy)
  const viewportH = Math.max(8, viewport.height * sy)

  const onClick = (e: React.MouseEvent<SVGSVGElement>): void => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
    const y = e.clientY - rect.top
    onJump(y / H)
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
        {/* Lane lines from row to row */}
        {layout.rows.map((row, i) => {
          const x = row.lane * layout.laneWidth * content.sx + (layout.leftPad + layout.laneWidth / 2) * content.sx
          const y1 = (layout.topPad + i * layout.rowHeight) * content.sy
          const y2 = (layout.topPad + (i + 1) * layout.rowHeight) * content.sy
          return (
            <line
              key={`mm-${row.commit.hash}`}
              x1={x}
              y1={y1}
              x2={x}
              y2={y2}
              stroke={laneStrokeColor(row.lane)}
              strokeWidth={1.2}
            />
          )
        })}
        {/* Viewport indicator */}
        <rect
          x={1}
          y={viewportTop}
          width={W - 2}
          height={viewportH}
          fill="#5b8cff22"
          stroke="#5b8cff"
          strokeWidth={1}
          pointerEvents="none"
        />
      </svg>
    </div>
  )
}

// Inline copy of palette to avoid an extra import cycle.
const PAL = ['#5b8cff', '#a672ff', '#3ecf8e', '#56cfe1', '#ff8a5b', '#ffd166', '#ff8fab', '#5a6275']
function laneStrokeColor(l: number): string {
  return PAL[((l % PAL.length) + PAL.length) % PAL.length]
}
