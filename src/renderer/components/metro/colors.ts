/**
 * Transit-line palette for the metro map. Each branch is assigned a lane index
 * and gets a consistent color across the entire history. Colors are tuned to
 * match a real-world transit-map look on a dark background.
 */
export const TRANSIT_PALETTE = [
  '#60a5fa', // blue         (blue-400)
  '#c084fc', // purple       (purple-400)
  '#4ade80', // green        (green-400)
  '#2dd4bf', // teal         (teal-400)
  '#fb923c', // orange       (orange-400)
  '#facc15', // yellow       (yellow-400)
  '#f472b6', // pink         (pink-400)
  '#94a3b8', // slate        (slate-400)
  '#f87171', // red          (red-400)
  '#34d399', // emerald      (emerald-400)
  '#a78bfa', // violet       (violet-400)
  '#38bdf8', // sky          (sky-400)
  '#fb7185', // rose         (rose-400)
  '#a3e635', // lime         (lime-400)
  '#e879f9', // fuchsia      (fuchsia-400)
  '#22d3ee', // cyan         (cyan-400)
  '#fbbf24', // amber        (amber-400)
  '#818cf8', // indigo       (indigo-400)
  '#86efac', // light-green  (green-300)
  '#fdba74', // peach        (orange-300)
] as const

export function laneColor(lane: number): string {
  if (lane < 0) return TRANSIT_PALETTE[0]
  return TRANSIT_PALETTE[lane % TRANSIT_PALETTE.length]
}

/**
 * Returns a stable, name-derived color for a branch. The color is determined
 * by hashing the branch name so it never changes across renders, graph reloads,
 * or branch additions/deletions.
 */
export function branchColor(name: string): string {
  if (!name) return TRANSIT_PALETTE[0]
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (Math.imul(31, h) + name.charCodeAt(i)) | 0
  }
  return TRANSIT_PALETTE[Math.abs(h) % TRANSIT_PALETTE.length]
}

/**
 * Returns a stable color for a lane: uses the branch name when known
 * (via `nameMap`), otherwise falls back to the lane-index palette.
 */
export function laneOrBranchColor(lane: number, nameMap: Map<number, string>): string {
  const name = nameMap.get(lane)
  return name ? branchColor(name) : laneColor(lane)
}

/** Color used for desaturated / stale references. */
export const STALE_COLOR = '#64748b'

/** Background grid / track color (drawn underneath the lines). */
export const TRACK_COLOR = '#1a2030'

/** Page background — same as the `--metro-bg` token. Used for station fill so
 * the lane visually punches through the dot (Tube-style). */
export const METRO_BG = '#0b0e14'

/** Standardized dash patterns. Centralized so stale lanes, future stubs, and
 * any other dashed strokes stay visually consistent. */
export const DASH_STALE = '5 4'
export const DASH_FUTURE = '2 6'

/** Default label color for inline stop subjects. */
export const LABEL_COLOR = '#9aa3b8'
export const LABEL_COLOR_SELECTED = '#e6e8ee'

/** Tint added behind a node to make it pop against the line color. */
export function laneTint(color: string, alphaHex = '22'): string {
  return `${color}${alphaHex}`
}

/** Parse a hex color (#rgb or #rrggbb) into an [r, g, b] tuple. */
function parseHex(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number): string => Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** Mix two colors by `t` (0 = a, 1 = b). */
function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a)
  const [br, bg, bb] = parseHex(b)
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t)
}

/**
 * Returns a darker "casing" color for a lane stroke — used as a 1.5px wider
 * outer stroke under the colored line to give it a Tube-map "edge" of depth.
 * Blends the lane color toward the page background.
 */
export function laneCasing(color: string): string {
  return mix(color, METRO_BG, 0.55)
}

/**
 * Returns a desaturated tint of a lane color for stale lanes — blends 35%
 * toward the muted gray so the lane recedes without losing its identity.
 */
export function laneStaleTint(color: string): string {
  return mix(color, STALE_COLOR, 0.35)
}
