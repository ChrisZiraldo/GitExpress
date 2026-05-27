/**
 * Transit-line palette for the metro map. Each branch is assigned a lane index
 * and gets a consistent color across the entire history.
 */
export const TRANSIT_PALETTE = [
  '#5b8cff', // blue   — main
  '#a672ff', // purple — feature
  '#3ecf8e', // green  — feature
  '#56cfe1', // teal   — release
  '#ff8a5b', // orange — hotfix
  '#ffd166', // yellow — chore
  '#ff8fab', // pink   — misc
  '#5a6275' // gray   — stale
] as const

export function laneColor(lane: number): string {
  if (lane < 0) return TRANSIT_PALETTE[0]
  return TRANSIT_PALETTE[lane % TRANSIT_PALETTE.length]
}

/** Color used for desaturated / stale references. */
export const STALE_COLOR = '#5a6275'

/** Background grid / track color (drawn underneath the lines). */
export const TRACK_COLOR = '#1a2030'
