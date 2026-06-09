import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { Channels } from '@shared/channels'
import type {
  Branch,
  BranchCreateOptions,
  Commit,
  CommitDetail,
  CommitInput,
  CommitChecksInfo,
  ConflictVersions,
  DiffOptions,
  FileChangeType,
  GeneratedCommitMessage,
  GitignoreReadResult,
  GraphCommit,
  PrCreateOptions,
  PrListItem,
  PrReviewOptions,
  PullOptions,
  PullRequestInfo,
  PushOptions,
  RebaseStatus,
  RebasePlanEntry,
  RecentRepo,
  RefSet,
  Result,
  SettingsUpdate,
  SettingsView,
  Stash,
  StashFileEntry,
  StashPushOptions,
  StatusResult
} from '@shared/types'

const api = {
  repo: {
    pick: (): Promise<Result<RecentRepo | null>> => ipcRenderer.invoke(Channels.RepoPick),
    open: (path: string): Promise<Result<RecentRepo>> =>
      ipcRenderer.invoke(Channels.RepoOpen, path),
    recents: (): Promise<Result<RecentRepo[]>> => ipcRenderer.invoke(Channels.RepoRecents),
    removeRecent: (path: string): Promise<Result<RecentRepo[]>> =>
      ipcRenderer.invoke(Channels.RepoRemoveRecent, path),
    getLast: (): Promise<Result<string>> => ipcRenderer.invoke(Channels.RepoGetLast)
  },
  status: {
    get: (cwd: string): Promise<Result<StatusResult>> =>
      ipcRenderer.invoke(Channels.StatusGet, cwd)
  },
  diff: {
    file: (cwd: string, opts: DiffOptions): Promise<Result<string>> =>
      ipcRenderer.invoke(Channels.DiffFile, cwd, opts)
  },
  stage: {
    add: (cwd: string, paths: string[]): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.StageAdd, cwd, paths),
    reset: (cwd: string, paths: string[]): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.StageReset, cwd, paths),
    discard: (
      cwd: string,
      path: string,
      staged: boolean,
      changeType: FileChangeType
    ): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.FileDiscard, cwd, path, staged, changeType)
  },
  hunk: {
    stage: (cwd: string, patch: string): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.HunkStage, cwd, patch),
    unstage: (cwd: string, patch: string): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.HunkUnstage, cwd, patch),
    discard: (cwd: string, patch: string): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.HunkDiscard, cwd, patch)
  },
  commit: {
    create: (cwd: string, input: CommitInput): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.CommitCreate, cwd, input)
  },
  remote: {
    fetch: (cwd: string): Promise<Result<true>> => ipcRenderer.invoke(Channels.RemoteFetch, cwd),
    pull: (cwd: string, opts: PullOptions = {}): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.RemotePull, cwd, opts),
    push: (cwd: string, opts: PushOptions = {}): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.RemotePush, cwd, opts)
  },
  branch: {
    list: (cwd: string): Promise<Result<Branch[]>> =>
      ipcRenderer.invoke(Channels.BranchList, cwd),
    checkout: (cwd: string, name: string): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.BranchCheckout, cwd, name),
    create: (
      cwd: string,
      name: string,
      opts: BranchCreateOptions = {}
    ): Promise<Result<true>> => ipcRenderer.invoke(Channels.BranchCreate, cwd, name, opts),
    checkoutDetached: (cwd: string, hash: string): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.BranchCheckoutDetached, cwd, hash),
    createFromCommit: (
      cwd: string,
      name: string,
      hash: string,
      opts: { checkout?: boolean } = {}
    ): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.BranchCreateFromCommit, cwd, name, hash, opts),
    checkoutRemote: (cwd: string, remoteRef: string): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.BranchCheckoutRemote, cwd, remoteRef),
    resetToRemote: (cwd: string): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.BranchResetToRemote, cwd),
    resetHard: (cwd: string): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.BranchResetHard, cwd),
    delete: (
      cwd: string,
      name: string,
      opts: { force?: boolean } = {}
    ): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.BranchDelete, cwd, name, opts)
  },
  refs: {
    list: (cwd: string): Promise<Result<RefSet>> =>
      ipcRenderer.invoke(Channels.RefsList, cwd)
  },
  log: {
    recent: (cwd: string, limit = 50): Promise<Result<Commit[]>> =>
      ipcRenderer.invoke(Channels.LogRecent, cwd, limit),
    graph: (cwd: string, limit = 500): Promise<Result<GraphCommit[]>> =>
      ipcRenderer.invoke(Channels.LogGraph, cwd, limit)
  },
  commitInspect: {
    show: (cwd: string, hash: string): Promise<Result<CommitDetail>> =>
      ipcRenderer.invoke(Channels.CommitShow, cwd, hash),
    showFileDiff: (cwd: string, hash: string, path: string): Promise<Result<string>> =>
      ipcRenderer.invoke(Channels.CommitShowFileDiff, cwd, hash, path)
  },
  stash: {
    list: (cwd: string): Promise<Result<Stash[]>> =>
      ipcRenderer.invoke(Channels.StashList, cwd),
    push: (cwd: string, opts: StashPushOptions = {}): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.StashPush, cwd, opts),
    pop: (cwd: string, index: number): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.StashPop, cwd, index),
    apply: (cwd: string, index: number): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.StashApply, cwd, index),
    drop: (cwd: string, index: number): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.StashDrop, cwd, index),
    files: (cwd: string, index: number): Promise<Result<StashFileEntry[]>> =>
      ipcRenderer.invoke(Channels.StashFiles, cwd, index),
    fileDiff: (cwd: string, index: number, filePath: string): Promise<Result<string>> =>
      ipcRenderer.invoke(Channels.StashFileDiff, cwd, index, filePath),
    applyFile: (cwd: string, index: number, filePath: string): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.StashApplyFile, cwd, index, filePath)
  },
  tag: {
    create: (cwd: string, name: string, hash: string, message?: string): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.TagCreate, cwd, name, hash, message),
    delete: (cwd: string, name: string): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.TagDelete, cwd, name)
  },
  commitOps: {
    cherryPick: (cwd: string, hash: string): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.CommitCherryPick, cwd, hash),
    revert: (cwd: string, hash: string): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.CommitRevert, cwd, hash),
    reset: (cwd: string, hash: string, mode: 'soft' | 'mixed' | 'hard'): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.CommitReset, cwd, hash, mode)
  },
  shell: {
    openPath: (fullPath: string): Promise<void> =>
      ipcRenderer.invoke(Channels.ShellOpenPath, fullPath),
    revealInFolder: (fullPath: string): Promise<void> =>
      ipcRenderer.invoke(Channels.ShellRevealInFolder, fullPath),
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke(Channels.ShellOpenExternal, url)
  },
  pr: {
    list: (cwd: string): Promise<Result<PrListItem[]>> =>
      ipcRenderer.invoke(Channels.PrList, cwd),
    rerunRun: (cwd: string, runId: string, failedOnly: boolean): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.PrRerunRun, cwd, runId, failedOnly),
    rerunLatest: (cwd: string, failedOnly: boolean): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.PrRerunLatest, cwd, failedOnly)
  },
  ci: {
    available: (): Promise<Result<boolean>> =>
      ipcRenderer.invoke(Channels.CiAvailable),
    prStatus: (cwd: string, branch: string): Promise<Result<PullRequestInfo | null>> =>
      ipcRenderer.invoke(Channels.CiPrStatus, cwd, branch),
    commitChecks: (cwd: string, sha: string): Promise<Result<CommitChecksInfo | null>> =>
      ipcRenderer.invoke(Channels.CiCommitChecks, cwd, sha)
  },
  settings: {
    get: (): Promise<Result<SettingsView>> => ipcRenderer.invoke(Channels.SettingsGet),
    update: (update: SettingsUpdate): Promise<Result<SettingsView>> =>
      ipcRenderer.invoke(Channels.SettingsUpdate, update)
  },
  ai: {
    generateCommitMessage: (cwd: string): Promise<Result<GeneratedCommitMessage>> =>
      ipcRenderer.invoke(Channels.AiGenerateCommitMessage, cwd)
  },
  appWindow: {
    resize: (width: number, height: number): Promise<void> =>
      ipcRenderer.invoke(Channels.WindowResize, width, height)
  },
  dryRun: {
    status: (): Promise<{ active: boolean; logPath: string }> =>
      ipcRenderer.invoke(Channels.DryRunStatus)
  },
  appMenu: {
    onOpenRepo: (cb: (path: string) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, path: string): void => cb(path)
      ipcRenderer.on(Channels.MenuOpenRepo, listener)
      return () => ipcRenderer.removeListener(Channels.MenuOpenRepo, listener)
    },
    onCloseRepo: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on(Channels.MenuCloseRepo, listener)
      return () => ipcRenderer.removeListener(Channels.MenuCloseRepo, listener)
    }
  },
  gitUndo: {
    headSha: (cwd: string): Promise<Result<string>> =>
      ipcRenderer.invoke(Channels.GitHeadSha, cwd),
    undo: (cwd: string, sha: string): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.GitUndo, cwd, sha)
  },
  gitignore: {
    read: (cwd: string): Promise<Result<GitignoreReadResult>> =>
      ipcRenderer.invoke(Channels.GitignoreRead, cwd),
    write: (cwd: string, content: string): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.GitignoreWrite, cwd, content),
    append: (cwd: string, pattern: string): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.GitignoreAppend, cwd, pattern)
  },
  prExtended: {
    create: (cwd: string, opts: PrCreateOptions): Promise<Result<{ url: string; number: number }>> =>
      ipcRenderer.invoke(Channels.PrCreate, cwd, opts),
    review: (cwd: string, prNumber: number, opts: PrReviewOptions): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.PrReview, cwd, prNumber, opts),
    diff: (cwd: string, prNumber: number): Promise<Result<string>> =>
      ipcRenderer.invoke(Channels.PrDiff, cwd, prNumber)
  },
  conflict: {
    versions: (cwd: string, path: string): Promise<Result<ConflictVersions>> =>
      ipcRenderer.invoke(Channels.ConflictVersions, cwd, path),
    resolve: (cwd: string, path: string, content: string): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.ConflictResolve, cwd, path, content),
    useSide: (cwd: string, path: string, side: 'ours' | 'theirs'): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.ConflictUseSide, cwd, path, side),
    mergeContinue: (cwd: string): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.MergeContinue, cwd),
    mergeAbort: (cwd: string): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.MergeAbort, cwd)
  },
  rebase: {
    start: (cwd: string, ontoSha: string, plan: RebasePlanEntry[]): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.RebaseStart, cwd, ontoSha, plan),
    status: (cwd: string): Promise<Result<RebaseStatus>> =>
      ipcRenderer.invoke(Channels.RebaseStatus, cwd),
    continue: (cwd: string): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.RebaseContinue, cwd),
    abort: (cwd: string): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.RebaseAbort, cwd),
    onto: (cwd: string, branch: string): Promise<Result<true>> =>
      ipcRenderer.invoke(Channels.RebaseOnto, cwd, branch)
  },
  logSearch: {
    search: (cwd: string, query: string, limit?: number): Promise<Result<GraphCommit[]>> =>
      ipcRenderer.invoke(Channels.LogSearch, cwd, query, limit)
  }
}

export type GitApi = typeof api

contextBridge.exposeInMainWorld('git', api)
