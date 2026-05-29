import Store from 'electron-store'
import { safeStorage } from 'electron'
import type { RecentRepo, SettingsView } from '@shared/types'

const DEFAULT_COMMIT_RULES = [
  '- Use Conventional Commits style: `<type>(<optional scope>): <subject>`.',
  '  Common types: feat, fix, refactor, chore, docs, test, build, perf, style.',
  '- Subject line: imperative mood, ≤ 72 characters, no trailing period.',
  '- Leave a blank line between subject and body.',
  '- Body: wrap at ~72 cols. Explain *why* the change is needed and any',
  '  notable trade-offs. Skip the body for trivial single-file changes.',
  '- Reference issues with "Refs #123" or "Fixes #123" on their own line at',
  '  the bottom when relevant.'
].join('\n')

interface PersistedSettings {
  /**
   * Cursor API key, base64-encoded ciphertext produced by Electron's
   * `safeStorage` (Keychain on macOS, libsecret on Linux, DPAPI on Windows).
   * Empty string means "no key stored".
   */
  cursorApiKeyEnc: string
  commitMessageRules: string
  /** Whether to GPG-sign commits. Defaults to false. */
  gpgSign: boolean
}

interface Schema {
  recents: RecentRepo[]
  windowBounds: { width: number; height: number; x?: number; y?: number }
  lastRepoPath: string
  settings: PersistedSettings
}

const store = new Store<Schema>({
  name: 'git-metro-config',
  defaults: {
    recents: [],
    windowBounds: { width: 1280, height: 820 },
    lastRepoPath: '',
    settings: { cursorApiKeyEnc: '', commitMessageRules: DEFAULT_COMMIT_RULES, gpgSign: false }
  },
  migrations: {
    '0.1.0': (s) => {
      const legacyStoreNames = ['git-express-config', 'simplegit-config']
      for (const legacyName of legacyStoreNames) {
        try {
          const legacy = new Store<Schema>({ name: legacyName })
          const legacyRecents = legacy.get('recents')
          if (legacyRecents?.length && !s.get('recents')?.length) {
            s.set('recents', legacyRecents)
            s.set('windowBounds', legacy.get('windowBounds'))
            s.set('lastRepoPath', legacy.get('lastRepoPath') ?? '')
            return
          }
        } catch {
          // ignore — legacy store may not exist
        }
      }
    }
  }
})

const MAX_RECENTS = 12

export function getRecents(): RecentRepo[] {
  return store.get('recents') ?? []
}

export function pushRecent(repo: { path: string; name: string }): RecentRepo[] {
  const now = Date.now()
  const existing = getRecents().filter((r) => r.path !== repo.path)
  const next: RecentRepo[] = [
    { path: repo.path, name: repo.name, lastOpenedAt: now },
    ...existing
  ].slice(0, MAX_RECENTS)
  store.set('recents', next)
  return next
}

export function removeRecent(path: string): RecentRepo[] {
  const next = getRecents().filter((r) => r.path !== path)
  store.set('recents', next)
  return next
}

export function getWindowBounds(): Schema['windowBounds'] {
  return store.get('windowBounds')
}

export function saveWindowBounds(bounds: Schema['windowBounds']): void {
  store.set('windowBounds', bounds)
}

export function getLastRepoPath(): string {
  return store.get('lastRepoPath') ?? ''
}

export function saveLastRepoPath(path: string): void {
  store.set('lastRepoPath', path)
}

// ── Settings ──────────────────────────────────────────────────────────────

function readSettings(): PersistedSettings {
  const cur = store.get('settings')
  if (cur && typeof cur === 'object') {
    return {
      cursorApiKeyEnc: cur.cursorApiKeyEnc ?? '',
      commitMessageRules: cur.commitMessageRules ?? DEFAULT_COMMIT_RULES,
      gpgSign: cur.gpgSign ?? false
    }
  }
  return { cursorApiKeyEnc: '', commitMessageRules: DEFAULT_COMMIT_RULES, gpgSign: false }
}

function writeSettings(next: PersistedSettings): void {
  store.set('settings', next)
}

/** Public, renderer-safe view: never returns the API key in plaintext. */
export function getSettingsView(): SettingsView {
  const s = readSettings()
  return {
    cursorApiKeySet: s.cursorApiKeyEnc.length > 0,
    commitMessageRules: s.commitMessageRules,
    gpgSign: s.gpgSign
  }
}

/** Returns the decrypted Cursor API key, or `null` if none stored / decrypt fails. */
export function getCursorApiKey(): string | null {
  const s = readSettings()
  if (!s.cursorApiKeyEnc) return null
  if (!safeStorage.isEncryptionAvailable()) {
    // Fallback path: when safeStorage isn't available the value was stored
    // verbatim (see saveCursorApiKey).
    return s.cursorApiKeyEnc
  }
  try {
    const buf = Buffer.from(s.cursorApiKeyEnc, 'base64')
    return safeStorage.decryptString(buf)
  } catch {
    return null
  }
}

export function saveCursorApiKey(key: string | null): void {
  const s = readSettings()
  if (key === null || key === '') {
    writeSettings({ ...s, cursorApiKeyEnc: '' })
    return
  }
  let enc = ''
  if (safeStorage.isEncryptionAvailable()) {
    enc = safeStorage.encryptString(key).toString('base64')
  } else {
    // Last-ditch: store as-is.  Better than dropping the user's key on
    // platforms where Keychain/libsecret/DPAPI aren't reachable.
    enc = key
  }
  writeSettings({ ...s, cursorApiKeyEnc: enc })
}

export function saveCommitMessageRules(rules: string): void {
  const s = readSettings()
  writeSettings({ ...s, commitMessageRules: rules })
}

export function getCommitMessageRules(): string {
  return readSettings().commitMessageRules
}

export function getGpgSign(): boolean {
  return readSettings().gpgSign
}

export function saveGpgSign(value: boolean): void {
  const s = readSettings()
  writeSettings({ ...s, gpgSign: value })
}
