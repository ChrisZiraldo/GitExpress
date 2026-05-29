import { useEffect, useState } from 'react'
import { SHORTCUT_LIST } from '../hooks/useHotkeys'

export function ShortcutsOverlay(): JSX.Element {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const toggle = (): void => setOpen((v) => !v)
    window.addEventListener('gitmetro:toggle-shortcuts', toggle)
    return () => window.removeEventListener('gitmetro:toggle-shortcuts', toggle)
  }, [])

  if (!open) return <></>

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000
      }}
      onClick={() => setOpen(false)}
    >
      <div
        style={{
          background: '#0b0e14', border: '1px solid #2a2f3b', borderRadius: 12,
          padding: '24px 32px', minWidth: 360, maxWidth: 480
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#c9d1d9' }}>Keyboard Shortcuts</span>
          <button
            onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: '#8b949e', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {SHORTCUT_LIST.map(({ key, desc }) => (
              <tr key={key} style={{ borderBottom: '1px solid #21262d' }}>
                <td style={{ padding: '8px 0', paddingRight: 24 }}>
                  <kbd style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                    background: '#21262d', border: '1px solid #2a2f3b',
                    fontFamily: 'monospace', fontSize: 12, color: '#c9d1d9', whiteSpace: 'nowrap'
                  }}>
                    {key}
                  </kbd>
                </td>
                <td style={{ padding: '8px 0', fontSize: 13, color: '#8b949e' }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 16, fontSize: 11, color: '#484f58', textAlign: 'center' }}>
          Press <kbd style={{ padding: '1px 5px', borderRadius: 3, background: '#21262d', border: '1px solid #2a2f3b', fontFamily: 'monospace', fontSize: 11, color: '#8b949e' }}>?</kbd> to toggle
        </div>
      </div>
    </div>
  )
}
