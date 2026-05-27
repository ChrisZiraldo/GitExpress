interface IconProps {
  size?: number
  className?: string
}

const stroke = 'currentColor'

export function IconFetch({ size = 16, className }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M2 8a6 6 0 0 1 10.5-4" />
      <path d="M14 8a6 6 0 0 1-10.5 4" />
      <path d="M11 4h2.5V1.5" />
      <path d="M5 12H2.5V14.5" />
    </svg>
  )
}

export function IconPull({ size = 16, className }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M8 2v9" />
      <path d="M4.5 7.5L8 11l3.5-3.5" />
      <path d="M3 14h10" />
    </svg>
  )
}

export function IconPush({ size = 16, className }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M8 14V5" />
      <path d="M4.5 8.5L8 5l3.5 3.5" />
      <path d="M3 2h10" />
    </svg>
  )
}

export function IconBranch({ size = 16, className }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="4" cy="3" r="1.5" />
      <circle cx="4" cy="13" r="1.5" />
      <circle cx="12" cy="6" r="1.5" />
      <path d="M4 4.5v7" />
      <path d="M4 10.5C4 8 7 8 7.5 8h2c1.5 0 2.5-.5 2.5-2.5" />
    </svg>
  )
}

export function IconStash({ size = 16, className }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="2" y="9" width="12" height="4" rx="1" />
      <path d="M3.5 9V6.5" />
      <path d="M5.5 9V5" />
      <path d="M7.5 9V3.5" />
      <path d="M9.5 9V5" />
      <path d="M11.5 9V6.5" />
    </svg>
  )
}

export function IconPop({ size = 16, className }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="2" y="9" width="12" height="4" rx="1" />
      <path d="M8 7V2" />
      <path d="M5.5 4.5L8 2l2.5 2.5" />
    </svg>
  )
}

export function IconRepo({ size = 16, className }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 2h8a2 2 0 0 1 2 2v9.5a.5.5 0 0 1-.5.5H4a1 1 0 0 0-1 1V4a2 2 0 0 1 2-2" />
      <path d="M3 12h10" />
    </svg>
  )
}

export function IconChevronDown({ size = 12, className }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}

export function IconChevronRight({ size = 12, className }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  )
}

export function IconPlus({ size = 14, className }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M8 3v10" />
      <path d="M3 8h10" />
    </svg>
  )
}

export function IconClose({ size = 14, className }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 4l8 8" />
      <path d="M12 4l-8 8" />
    </svg>
  )
}
