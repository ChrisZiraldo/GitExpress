import { create } from 'zustand'
import type {
  Branch,
  Commit,
  CommitDetail,
  GraphCommit,
  RecentRepo,
  RefSet,
  Stash,
  StatusResult
} from '@shared/types'

export interface StashViewEntry {
  stashIndex: number
  filePath: string
}

export interface ToastEntry {
  id: number
  kind: 'success' | 'error' | 'info'
  text: string
}

const EMPTY_REFS: RefSet = { local: [], remote: [], tags: [] }

interface RepoState {
  activeRepo: RecentRepo | null
  recents: RecentRepo[]
  status: StatusResult | null
  branches: Branch[]
  refs: RefSet
  stashes: Stash[]
  graph: GraphCommit[]
  commits: Commit[]
  selectedFile: { path: string; staged: boolean } | null
  stashView: StashViewEntry | null
  selectedCommit: string | null
  commitDetail: CommitDetail | null
  selectedCommitFile: string | null
  diff: string
  diffLoading: boolean
  busy: boolean
  drawerHeight: number
  viewMode: 'simple' | 'advanced'
  refreshVersion: number
  toasts: ToastEntry[]
  setActiveRepo: (repo: RecentRepo | null) => void
  setRecents: (recents: RecentRepo[]) => void
  setStatus: (status: StatusResult | null) => void
  setBranches: (branches: Branch[]) => void
  setRefs: (refs: RefSet) => void
  setStashes: (stashes: Stash[]) => void
  setGraph: (graph: GraphCommit[]) => void
  setCommits: (commits: Commit[]) => void
  setSelectedFile: (sel: { path: string; staged: boolean } | null) => void
  setStashView: (entry: StashViewEntry | null) => void
  setSelectedCommit: (hash: string | null) => void
  setCommitDetail: (detail: CommitDetail | null) => void
  setSelectedCommitFile: (path: string | null) => void
  setDiff: (diff: string) => void
  setDiffLoading: (loading: boolean) => void
  setBusy: (busy: boolean) => void
  setDrawerHeight: (h: number) => void
  setViewMode: (mode: 'simple' | 'advanced') => void
  refreshSignal: () => void
  pushToast: (kind: ToastEntry['kind'], text: string) => void
  dismissToast: (id: number) => void
}

let toastSeq = 0

const DEFAULT_DRAWER_HEIGHT = 320

function loadViewMode(): 'simple' | 'advanced' {
  try {
    const v = localStorage.getItem('simplegit.viewMode')
    if (v === 'advanced') return 'advanced'
    return 'simple'
  } catch {
    return 'simple'
  }
}

function loadDrawerHeight(): number {
  try {
    const raw = localStorage.getItem('simplegit.drawerHeight')
    if (!raw) return DEFAULT_DRAWER_HEIGHT
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n) || n < 120) return DEFAULT_DRAWER_HEIGHT
    return n
  } catch {
    return DEFAULT_DRAWER_HEIGHT
  }
}

export const useRepo = create<RepoState>((set) => ({
  activeRepo: null,
  recents: [],
  status: null,
  branches: [],
  refs: EMPTY_REFS,
  stashes: [],
  graph: [],
  commits: [],
  selectedFile: null,
  stashView: null,
  selectedCommit: null,
  commitDetail: null,
  selectedCommitFile: null,
  diff: '',
  diffLoading: false,
  busy: false,
  drawerHeight: loadDrawerHeight(),
  viewMode: loadViewMode(),
  refreshVersion: 0,
  toasts: [],
  setActiveRepo: (repo) =>
    set({
      activeRepo: repo,
      status: null,
      branches: [],
      refs: EMPTY_REFS,
      stashes: [],
      graph: [],
      commits: [],
      selectedFile: null,
      stashView: null,
      selectedCommit: null,
      commitDetail: null,
      selectedCommitFile: null,
      diff: ''
    }),
  setRecents: (recents) => set({ recents }),
  setStatus: (status) => set({ status }),
  setBranches: (branches) => set({ branches }),
  setRefs: (refs) => set({ refs }),
  setStashes: (stashes) => set({ stashes }),
  setGraph: (graph) => set({ graph }),
  setCommits: (commits) => set({ commits }),
  setSelectedFile: (selectedFile) => set({ selectedFile, stashView: null }),
  setStashView: (stashView) =>
    set({ stashView, selectedCommit: null, selectedFile: null, diff: '' }),
  setSelectedCommit: (hash) =>
    set({
      selectedCommit: hash,
      commitDetail: null,
      selectedCommitFile: null,
      selectedFile: null,
      stashView: null,
      diff: ''
    }),
  setCommitDetail: (detail) => set({ commitDetail: detail }),
  setSelectedCommitFile: (path) => set({ selectedCommitFile: path }),
  setDiff: (diff) => set({ diff }),
  setDiffLoading: (diffLoading) => set({ diffLoading }),
  setBusy: (busy) => set({ busy }),
  setDrawerHeight: (h) => {
    try {
      localStorage.setItem('simplegit.drawerHeight', String(h))
    } catch {
      /* ignore */
    }
    set({ drawerHeight: h })
  },
  setViewMode: (mode) => {
    try {
      localStorage.setItem('simplegit.viewMode', mode)
    } catch {
      /* ignore */
    }
    set({ viewMode: mode })
  },
  refreshSignal: () =>
    set((state) => ({ refreshVersion: state.refreshVersion + 1 })),
  pushToast: (kind, text) =>
    set((state) => {
      const id = ++toastSeq
      const entry: ToastEntry = { id, kind, text }
      setTimeout(
        () => {
          useRepo.getState().dismissToast(id)
        },
        kind === 'error' ? 6000 : 3000
      )
      return { toasts: [...state.toasts, entry] }
    }),
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
}))
