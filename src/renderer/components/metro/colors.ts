/**
 * Transit-line palette for the metro map. Each branch is assigned a lane index
 * and gets a consistent color across the entire history. Colors are tuned to
 * match a real-world transit-map look on a dark background.
 */
export const TRANSIT_PALETTE = [
  '#3b82f6', // blue   — main
  '#a855f7', // purple — feature/auth
  '#22c55e', // green  — feature/dashboard
  '#14b8a6', // teal   — release
  '#f97316', // orange — hotfix
  '#eab308', // yellow — chore
  '#ec4899', // pink   — misc
  '#64748b'  // gray   — stale
] as const

export function laneColor(lane: number): string {
  if (lane < 0) return TRANSIT_PALETTE[0]
  return TRANSIT_PALETTE[lane % TRANSIT_PALETTE.length]
}

/** Color used for desaturated / stale references. */
export const STALE_COLOR = '#64748b'

/** Background grid / track color (drawn underneath the lines). */
export const TRACK_COLOR = '#1a2030'

/** Tint added behind a node to make it pop against the line color. */
export function laneTint(color: string, alphaHex = '22'): string {
  return `${color}${alphaHex}`
}
