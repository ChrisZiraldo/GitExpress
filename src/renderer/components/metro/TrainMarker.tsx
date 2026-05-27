interface TrainMarkerProps {
  x: number
  y: number
  color: string
  /** If true, the train pulses to indicate an open PR. */
  pulsing?: boolean
}

/**
 * A small train icon drawn at (x, y) along a branch line. Used to indicate an
 * open pull request "moving toward" the merge point.
 */
export function TrainMarker({ x, y, color, pulsing }: TrainMarkerProps): JSX.Element {
  const w = 18
  const h = 12
  return (
    <g
      transform={`translate(${x - w / 2}, ${y - h / 2})`}
      className={pulsing ? 'animate-train-pulse' : undefined}
      pointerEvents="none"
    >
      <rect
        width={w}
        height={h}
        rx={3}
        fill={color}
        stroke="#0a0d14"
        strokeWidth={1.5}
      />
      {/* Front window */}
      <rect x={w - 6} y={2} width={4} height={4} rx={0.5} fill="#0a0d14" />
      {/* Body window */}
      <rect x={3} y={3} width={6} height={3} rx={0.5} fill="#0a0d1480" />
      {/* Wheels */}
      <circle cx={4} cy={h} r={1.2} fill="#0a0d14" />
      <circle cx={w - 4} cy={h} r={1.2} fill="#0a0d14" />
    </g>
  )
}
