import type { MetroStation } from './computeMetroLayout'

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
 * A single station node on the metro map. Kind determines the shape:
 *   - commit       : medium circle
 *   - interchange  : larger ring (transfer station)
 *   - tag          : circle + small flag indicator
 *   - head         : glowing circle with inner pulse
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
  const { x, y, color, kind, isHead } = station
  const baseR = kind === 'interchange' ? 9 : kind === 'head' ? 8 : 7
  const ringStroke = 2.5
  const fill = 'var(--metro-bg, #0b0e14)'
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

      {/* Interchange has a double ring */}
      {kind === 'interchange' && (
        <circle
          cx={x}
          cy={y}
          r={baseR + 3}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeOpacity={0.45}
        />
      )}

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

      {/* Tag flag indicator */}
      {kind === 'tag' && (
        <g transform={`translate(${x + baseR + 2}, ${y - baseR - 2})`}>
          <rect width={9} height={7} rx={1} fill="#ffd166" stroke="#1a2030" strokeWidth={0.5} />
        </g>
      )}
    </g>
  )
}
