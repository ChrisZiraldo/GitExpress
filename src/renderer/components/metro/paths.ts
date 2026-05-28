/**
 * SVG path builders for the metro map. Centralized so `Lines`, `Curves`, and
 * the empty-state preview all share the same Tube-map elbow geometry.
 *
 * Coordinate convention: time runs left → right, with NEWER commits on the
 * RIGHT. Branch-off / merge-in connectors flow from a "child" point (x1,
 * larger) to a "parent" point (x2, smaller). All builders return an SVG
 * `d` string ready to drop into a `<path>` element.
 */

export interface Point {
  x: number
  y: number
}

/** Maximum corner radius for elbow turns. Larger feels more London-Tube;
 * smaller feels more spreadsheet. */
const MAX_CORNER_R = 18

/** Minimum corner radius. Below this we abandon the elbow and fall back to
 * a smooth cubic so we don't render a degenerate path. */
const MIN_CORNER_R = 6

/** Extra horizontal padding between the riser and the trunk station.
 * The riser sits at `x2 + r + RISER_GAP` so the bottom corner exits at
 * `x2 + RISER_GAP` — i.e. the elbow visibly "lands" on the trunk station
 * (which is then drawn on top, absorbing the curve's terminus). Keep
 * this small: with RISER_GAP = 2 the colored stub on top of the trunk
 * lane is short enough to read as a clean junction rather than an
 * overhang. */
const RISER_GAP = 2

/**
 * Branch-off elbow: child (feature lane) → parent (trunk lane). Builds a
 * Tube-style elbow with rounded corners. The riser sits TIGHT against the
 * trunk station (just `r + RISER_GAP` away) so the branch runs flat along
 * its own lane for most of `dx`, drops vertically right next to the trunk,
 * and the curve's terminus lands on the trunk station — which is then
 * drawn on top to absorb the cap, exactly like a real Tube line entering
 * a station.
 *
 * Geometry:
 *
 *   x1,y1 ●─────────╮            (child station, e.g. feature lane)
 *                   │
 *                   │            (vertical riser at riserX)
 *                   │
 *         ╭─────────╯            (rounded corners; quarter-circle Q curves)
 *  x2,y2 ●                       (parent station, e.g. trunk)
 *
 * If there isn't enough horizontal/vertical room for a rounded elbow we
 * fall back to a smooth outward-handle cubic.
 */
export function branchOffPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  laneHeight: number,
  _colWidth: number
): string {
  const dx = x1 - x2
  const dy = y2 - y1
  const sign = dy === 0 ? 1 : Math.sign(dy)

  // Corner radius: scaled by lane height, capped, clamped to fit available
  // space so the corners don't blow past the riser or the endpoints.
  let r = Math.min(MAX_CORNER_R, laneHeight * 0.4)
  r = Math.min(r, Math.abs(dy) * 0.45, dx * 0.45)
  r = Math.max(MIN_CORNER_R, r)

  // Constrain riser to leave room for the corner on the child side. The
  // trunk side is allowed to sit at `x2 + r` exactly: the bottom corner
  // then exits at `x2 + RISER_GAP` (just past the trunk station's edge),
  // and the final 2-pixel landing on the trunk station is invisible
  // under the station marker drawn on top.
  const minRiserX = x2 + r
  const maxRiserX = x1 - r - 2

  if (minRiserX >= maxRiserX) {
    // Distance too tight for a rounded elbow — fall back to a smooth
    // outward-handle cubic so the path stays valid for compact graphs.
    const c1X = x1 - 0.18 * dx
    const c2X = x1 - 0.82 * dx
    return `M ${x1} ${y1} C ${c1X} ${y1}, ${c2X} ${y2}, ${x2} ${y2}`
  }

  // Riser sits tight against the trunk station, regardless of dx.
  const targetRiserX = x2 + r + RISER_GAP
  const rx = Math.max(minRiserX, Math.min(maxRiserX, targetRiserX))

  const enterCornerY = y1 + sign * r
  const exitCornerY = y2 - sign * r

  // Path: child station → long horizontal at child's lane → top corner
  // → vertical riser → bottom corner → short L onto the trunk station.
  return (
    `M ${x1} ${y1} ` +
    `L ${rx + r} ${y1} ` +
    `Q ${rx} ${y1}, ${rx} ${enterCornerY} ` +
    `L ${rx} ${exitCornerY} ` +
    `Q ${rx} ${y2}, ${rx - r} ${y2} ` +
    `L ${x2} ${y2}`
  )
}

/**
 * Build a continuous polyline path through a sorted list of points. Used to
 * render an entire lane as one `<path>` so the rail reads as a single Tube
 * line rather than a chain of stitched segments.
 */
export function laneRunPath(points: Point[]): string {
  if (points.length === 0) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`
  }
  return d
}
