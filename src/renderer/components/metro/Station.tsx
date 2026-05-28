import type { MetroStation } from './computeMetroLayout'
import { METRO_BG, laneColor } from './colors'

interface StationProps {
  station: MetroStation
  selected: boolean
  dimmed: boolean
  onClick: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onMouseEnter: (e: React.MouseEvent) => void
  onMouseLeave: () => void
}

/**
 * A single station node on the metro map. Each commit station "pierces" its
 * lane: the rail line is drawn underneath, and the station fills with the
 * page background so the rail visually punches through the dot — same as a
 * real Tube map stop.
 *
 * Kind / variant determines the silhouette:
 *   - commit         : large hollow circle pierced by the rail
 *   - tag            : same circle + small flag indicator
 *   - interchange    : larger circle FILLED with the merging branch's color
 *                      (or trunk color if the merge source can't be derived)
 *   - head           : glowing circle with inner colored dot
 *   - abandoned-tip  : hollow ring with an X glyph (stale lane terminus)
 */
export function Station({
  station,
  selected,
  dimmed,
  onClick,
  onContextMenu,
  onMouseEnter,
  onMouseLeave
}: StationProps): JSX.Element {
  const { x, y, color, kind, isHead, mergeFromLane, isAbandonedTip } = station
  const baseR = kind === 'interchange' ? 11 : kind === 'head' ? 9 : 10
  const ringStroke = kind === 'interchange' ? 3.25 : 3
  const bgFill = `var(--metro-bg, ${METRO_BG})`

  // For merge interchanges, fill the dot in the MERGING branch's color so
  // the map tells the story "here's where X came home". Falls back to bg
  // if we couldn't derive the merging lane (rare).
  const interchangeFill =
    kind === 'interchange' && mergeFromLane !== null
      ? laneColor(mergeFromLane)
      : null
  const fill = interchangeFill ?? bgFill

  const opacity = dimmed ? 0.18 : 1

  return (
    <g
      style={{ cursor: 'pointer', opacity }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Larger hit target */}
      <circle cx={x} cy={y} r={14} fill="transparent" />

      {/* Selection glow */}
      {selected && (
        <circle
          cx={x}
          cy={y}
          r={baseR + 7}
          fill="none"
          stroke="#5b8cff"
          strokeWidth={2}
          strokeOpacity={0.55}
        />
      )}

      {/* HEAD outer pulse */}
      {isHead && !selected && (
        <circle
          cx={x}
          cy={y}
          r={baseR + 5}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeOpacity={0.35}
        />
      )}

      {/* Interchange double ring (transfer station) */}
      {kind === 'interchange' && (
        <circle
          cx={x}
          cy={y}
          r={baseR + 3.5}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeOpacity={0.55}
        />
      )}

      {/* Perpendicular tick — a tiny vertical accent above and below the
          station body, in lane color, that emphasizes the rail "passing
          through" the dot (Tube-map stop idiom). */}
      <line
        x1={x}
        y1={y - baseR - 4}
        x2={x}
        y2={y + baseR + 4}
        stroke={color}
        strokeWidth={1.5}
        strokeOpacity={0.7}
      />

      {/* Main station body */}
      <circle
        cx={x}
        cy={y}
        r={baseR}
        fill={fill}
        stroke={color}
        strokeWidth={ringStroke}
      />

      {/* HEAD inner dot */}
      {isHead && (
        <circle cx={x} cy={y} r={baseR - 3.5} fill={color} />
      )}

      {/* Abandoned-tip X glyph (drawn over the hollow ring). Two short
          diagonal strokes inside the circle in lane color. */}
      {isAbandonedTip && !isHead && (
        <g
          stroke={color}
          strokeWidth={1.75}
          strokeLinecap="round"
          opacity={0.85}
        >
          <line x1={x - 3.5} y1={y - 3.5} x2={x + 3.5} y2={y + 3.5} />
          <line x1={x - 3.5} y1={y + 3.5} x2={x + 3.5} y2={y - 3.5} />
        </g>
      )}

      {/* Tag flag indicator */}
      {kind === 'tag' && (
        <g transform={`translate(${x + baseR + 2}, ${y - baseR - 2})`}>
          <rect width={9} height={7} rx={1} fill="#ffd166" stroke="#1a2030" strokeWidth={0.5} />
        </g>
      )}
    </g>
  )
}
