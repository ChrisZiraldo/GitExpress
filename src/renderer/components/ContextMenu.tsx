import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type MenuItem =
  | { type?: 'item'; label: string; onClick: () => void | Promise<void>; danger?: boolean; disabled?: boolean }
  | { type: 'separator' }

interface Props {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useLayoutEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    let nx = x
    let ny = y
    const margin = 8
    if (x + rect.width + margin > window.innerWidth) {
      nx = Math.max(margin, window.innerWidth - rect.width - margin)
    }
    if (y + rect.height + margin > window.innerHeight) {
      ny = Math.max(margin, window.innerHeight - rect.height - margin)
    }
    setPos({ x: nx, y: ny })
  }, [x, y, items])

  useEffect(() => {
    const onDocDown = (e: MouseEvent): void => {
      if (ref.current?.contains(e.target as Node)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('contextmenu', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('contextmenu', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="menu"
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-50 min-w-[200px] bg-bg-panel border border-line rounded-md shadow-xl py-1"
    >
      {items.map((item, i) => {
        if (item.type === 'separator') {
          return <div key={i} className="my-1 border-t border-line" />
        }
        return (
          <button
            key={i}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return
              const r = item.onClick()
              onClose()
              if (r && typeof (r as Promise<void>).then === 'function') {
                void (r as Promise<void>)
              }
            }}
            className={
              'block w-full text-left px-3 py-1.5 text-sm hover:bg-line disabled:opacity-40 disabled:hover:bg-transparent ' +
              (item.danger ? 'text-danger' : 'text-text')
            }
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
