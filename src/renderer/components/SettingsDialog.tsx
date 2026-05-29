import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, ExternalLink } from 'lucide-react'
import { useRepo } from '../store/useRepo'
import type { SettingsView } from '@shared/types'

interface Props {
  onClose: () => void
}

const CURSOR_DASHBOARD_URL = 'https://cursor.com/dashboard/integrations'

export function SettingsDialog({ onClose }: Props): JSX.Element {
  const pushToast = useRepo((s) => s.pushToast)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<SettingsView | null>(null)

  // Form state
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [clearKey, setClearKey] = useState(false)
  const [rules, setRules] = useState('')
  const [gpgSign, setGpgSign] = useState(false)

  const initialRulesRef = useRef('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await window.git.settings.get()
      if (cancelled) return
      if (!res.ok) {
        pushToast('error', `Couldn't load settings: ${res.stderr}`)
        setLoading(false)
        return
      }
      setView(res.data)
      setRules(res.data.commitMessageRules)
      initialRulesRef.current = res.data.commitMessageRules
      setGpgSign(res.data.gpgSign)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [pushToast])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const apiKeyAlreadySet = !!view?.cursorApiKeySet
  const rulesDirty = rules !== initialRulesRef.current
  const keyDirty = clearKey || apiKeyInput.trim().length > 0
  const gpgSignDirty = view !== null && gpgSign !== view.gpgSign
  const dirty = rulesDirty || keyDirty || gpgSignDirty

  const onSave = async (): Promise<void> => {
    if (saving) return
    setSaving(true)
    try {
      const update: { cursorApiKey?: string | null; commitMessageRules?: string; gpgSign?: boolean } = {}
      if (clearKey) update.cursorApiKey = null
      else if (apiKeyInput.trim().length > 0) update.cursorApiKey = apiKeyInput.trim()
      if (rulesDirty) update.commitMessageRules = rules
      if (gpgSignDirty) update.gpgSign = gpgSign

      if (Object.keys(update).length === 0) {
        onClose()
        return
      }

      const res = await window.git.settings.update(update)
      if (!res.ok) {
        pushToast('error', `Save failed: ${res.stderr}`)
        return
      }
      pushToast('success', 'Settings saved')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-bg-panel border border-line rounded-md p-5 w-[36rem] max-w-[92vw] shadow-xl titlebar-nodrag"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-base font-semibold mb-4">Settings</div>

        {loading ? (
          <div className="py-8 text-center text-muted text-sm">Loading…</div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* ── Cursor API key ─────────────────────────────────────── */}
            <section>
              <label className="block text-xs font-medium text-text mb-1">
                Cursor API Key
              </label>
              <p className="text-xs text-muted mb-2 leading-relaxed">
                Used to generate commit messages from your staged changes.
                Stored encrypted on this machine via the OS keychain.
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    void window.git.shell.openExternal(CURSOR_DASHBOARD_URL)
                  }}
                  className="ml-1 inline-flex items-center gap-0.5 text-accent hover:text-accent-hover"
                >
                  Get a key
                  <ExternalLink size={11} />
                </a>
              </p>

              <div className="flex items-stretch gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => {
                      setApiKeyInput(e.target.value)
                      if (e.target.value) setClearKey(false)
                    }}
                    placeholder={
                      apiKeyAlreadySet ? '•••••••••• (key configured)' : 'cursor_…'
                    }
                    spellCheck={false}
                    autoComplete="off"
                    disabled={clearKey}
                    className="w-full px-2 py-1.5 pr-9 bg-bg-subtle border border-line rounded text-sm font-mono focus:outline-none focus:border-accent disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted hover:text-text p-1"
                    title={showKey ? 'Hide key' : 'Show key'}
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {apiKeyAlreadySet && (
                  <button
                    type="button"
                    onClick={() => {
                      setClearKey((v) => !v)
                      if (!clearKey) setApiKeyInput('')
                    }}
                    className={
                      'px-2 py-1.5 text-xs rounded border ' +
                      (clearKey
                        ? 'bg-danger/20 border-danger/40 text-danger'
                        : 'bg-bg-subtle border-line text-muted hover:text-text')
                    }
                    title="Remove the stored API key"
                  >
                    {clearKey ? 'Will clear on save' : 'Clear'}
                  </button>
                )}
              </div>
            </section>

            {/* ── Commit message rules ───────────────────────────────── */}
            <section>
              <label className="block text-xs font-medium text-text mb-1">
                Commit Message Rules
              </label>
              <p className="text-xs text-muted mb-2 leading-relaxed">
                Free-form formatting guidance the model follows when generating
                a commit message. One rule per line works well.
              </p>
              <textarea
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                rows={10}
                spellCheck={false}
                className="w-full px-2 py-1.5 bg-bg-subtle border border-line rounded text-xs font-mono focus:outline-none focus:border-accent resize-y leading-relaxed"
              />
            </section>

            {/* ── GPG signing ────────────────────────────────────────── */}
            <section>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={gpgSign}
                  onChange={(e) => setGpgSign(e.target.checked)}
                  className="w-4 h-4 accent-accent"
                />
                <span className="text-xs font-medium text-text">Sign commits with GPG</span>
              </label>
              <p className="text-xs text-muted mt-1 leading-relaxed ml-6">
                When disabled (default), <code className="font-mono">--no-gpg-sign</code> is
                passed to every commit so you don't need a GPG key or passphrase configured.
                Enable this only if your git config has GPG set up correctly.
              </p>
            </section>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-bg-subtle hover:bg-line text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => void onSave()}
            disabled={loading || saving || !dirty}
            className="px-3 py-1.5 rounded bg-accent hover:bg-accent-hover disabled:bg-line disabled:text-muted text-white text-sm font-medium"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
