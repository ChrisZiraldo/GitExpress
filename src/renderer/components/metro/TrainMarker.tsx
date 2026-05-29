import { TramFront } from 'lucide-react'

interface TrainMarkerProps {
  x: number
  y: number
  color: string
  /** If true, the train pulses — used to indicate an open PR. */
  pulsing?: boolean
  /** Visual size variant. `tip` is used for active branch tips with a PR;
   * `mid` is used for trains "riding" along a stale/in-progress route. */
  size?: 'tip' | 'mid'
}

/**
 * A small Tube-style train icon drawn at (x, y) along a branch line. Used
 * to indicate either an active PR moving toward merge (at branch tips) or a
 * train "riding" a dotted/stale route. The icon sits in a rounded
 * background pill so it remains legible whether on top of the rail or
 * floating between stations.
 */
export function TrainMarker({
  x,
  y,
  color,
  pulsing,
  size = 'tip'
}: TrainMarkerProps): JSX.Element {
  const w = size === 'mid' ? 30 : 26
  const h = size === 'mid' ? 22 : 20
  const iconSize = size === 'mid' ? 16 : 14

  return (
    <g
      transform={`translate(${x - w / 2}, ${y - h / 2})`}
      className={pulsing ? 'animate-train-pulse' : undefined}
      pointerEvents="none"
    >
      {/* Background pill — bg color so the icon stays legible on any line. */}
      <rect
        width={w}
        height={h}
        rx={h / 2}
        fill="#0b0e14"
        stroke={color}
        strokeWidth={2}
      />
      {/* Lucide TramFront — proper Tube-style train icon. */}
      <g transform={`translate(${(w - iconSize) / 2}, ${(h - iconSize) / 2})`}>
        <TramFront size={iconSize} color={color} strokeWidth={2.25} />
      </g>
    </g>
  )
}
