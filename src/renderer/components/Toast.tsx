import { useRepo } from '../store/useRepo'

export function Toast(): JSX.Element {
  const toasts = useRepo((s) => s.toasts)
  const dismiss = useRepo((s) => s.dismissToast)

  if (toasts.length === 0) return <></>

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md">
      {toasts.map((t) => {
        const base = 'px-3 py-2 rounded-md shadow-lg text-sm border flex items-start gap-2 '
        const variant =
          t.kind === 'success'
            ? 'bg-success/15 border-success/40 text-success'
            : t.kind === 'error'
              ? 'bg-danger/15 border-danger/40 text-danger'
              : 'bg-bg-panel border-line text-text'
        return (
          <div key={t.id} className={base + variant}>
            <span className="flex-1 whitespace-pre-wrap break-words">{t.text}</span>
            {t.onUndo && (
              <button
                onClick={() => { t.onUndo?.(); dismiss(t.id) }}
                className="shrink-0 text-xs font-semibold underline hover:no-underline ml-1"
              >
                Undo
              </button>
            )}
            <button
              onClick={() => dismiss(t.id)}
              className="text-muted hover:text-text ml-1 shrink-0"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
