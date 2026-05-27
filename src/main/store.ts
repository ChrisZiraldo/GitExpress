import Store from 'electron-store'
import type { RecentRepo } from '@shared/types'

interface Schema {
  recents: RecentRepo[]
  windowBounds: { width: number; height: number; x?: number; y?: number }
  lastRepoPath: string
}

const store = new Store<Schema>({
  name: 'git-express-config',
  defaults: {
    recents: [],
    windowBounds: { width: 1280, height: 820 },
    lastRepoPath: ''
  },
  migrations: {
    '0.1.0': (s) => {
      try {
        const legacy = new Store<Schema>({ name: 'simplegit-config' })
        const legacyRecents = legacy.get('recents')
        if (legacyRecents?.length && !s.get('recents')?.length) {
          s.set('recents', legacyRecents)
          s.set('windowBounds', legacy.get('windowBounds'))
          s.set('lastRepoPath', legacy.get('lastRepoPath') ?? '')
        }
      } catch {
        // ignore — legacy store may not exist
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
