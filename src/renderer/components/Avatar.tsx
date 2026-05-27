import { useEffect, useState } from 'react'

// Module-level cache: email → gravatar URL (or null on error)
const hashCache = new Map<string, Promise<string>>()

const PALETTE = [
  '#5b8cff', '#f5a623', '#3ecf8e', '#e76f51',
  '#9b59b6', '#1abc9c', '#e74c3c', '#3498db',
  '#f39c12', '#2ecc71', '#e91e63', '#00bcd4'
]

async function gravatarUrl(email: string): Promise<string> {
  const lower = email.trim().toLowerCase()
  const msgBuffer = new TextEncoder().encode(lower)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `https://www.gravatar.com/avatar/${hashHex}?s=48&d=identicon`
}

function getInitialsColor(email: string): string {
  let hash = 0
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash)
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

function getInitial(author: string): string {
  const trimmed = author?.trim()
  return trimmed ? trimmed[0].toUpperCase() : '?'
}

interface AvatarProps {
  email: string
  author: string
  size?: number
}

export function Avatar({ email, author, size = 16 }: AvatarProps): JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!email) { setError(true); return }
    let cancelled = false
    let promise = hashCache.get(email)
    if (!promise) {
      promise = gravatarUrl(email)
      hashCache.set(email, promise)
    }
    promise.then(
      (u) => { if (!cancelled) { setUrl(u); setError(false) } },
      () => { if (!cancelled) setError(true) }
    )
    return () => { cancelled = true }
  }, [email])

  const half = size / 2
  const radius = size / 2

  if (!url || error) {
    const bg = getInitialsColor(email || author)
    const initial = getInitial(author)
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          borderRadius: radius,
          background: bg,
          color: '#fff',
          fontSize: Math.max(size * 0.45, 8),
          fontWeight: 600,
          lineHeight: 1,
          flexShrink: 0,
          userSelect: 'none'
        }}
        title={author}
      >
        {initial}
      </span>
    )
  }

  return (
    <img
      src={url}
      alt={author}
      loading="lazy"
      referrerPolicy="no-referrer"
      width={size}
      height={size}
      onError={() => setError(true)}
      style={{
        borderRadius: half,
        display: 'inline-block',
        flexShrink: 0,
        objectFit: 'cover'
      }}
      title={author}
    />
  )
}
