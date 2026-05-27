export type Ok<T> = { ok: true; data: T }
export type Err = { ok: false; code: number; stderr: string }
export type Result<T> = Ok<T> | Err

export interface RecentRepo {
  path: string
  name: string
  lastOpenedAt: number
}

export type FileChangeType =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'ignored'
  | 'unmerged'

export interface FileEntry {
  path: string
  origPath?: string
  staged: boolean
  unstaged: boolean
  changeType: FileChangeType
  stagedCode?: string
  unstagedCode?: string
}

export interface BranchInfo {
  current: string | null
  upstream: string | null
  ahead: number
  behind: number
  detached: boolean
}

export interface StatusResult {
  branch: BranchInfo
  staged: FileEntry[]
  unstaged: FileEntry[]
  untracked: FileEntry[]
  conflicted: FileEntry[]
}

export interface Branch {
  name: string
  current: boolean
  remote: boolean
  upstream: string | null
}

export interface Commit {
  hash: string
  shortHash: string
  author: string
  email: string
  date: string
  relativeDate: string
  subject: string
}

export interface CommitInput {
  message: string
  description?: string
}

export interface PullOptions {
  rebase?: boolean
}

export interface PushOptions {
  setUpstream?: boolean
  force?: boolean
}

export interface BranchCreateOptions {
  checkout?: boolean
  startPoint?: string
}

export interface DiffOptions {
  path: string
  staged: boolean
}

export interface GraphCommit {
  hash: string
  shortHash: string
  parents: string[]
  author: string
  email: string
  date: string
  relativeDate: string
  subject: string
}

export interface Ref {
  name: string
  fullName: string
  hash: string
  upstream?: string
  current?: boolean
}

export interface RefSet {
  local: Ref[]
  remote: Ref[]
  tags: Ref[]
}

export interface Stash {
  index: number
  hash: string
  branch: string
  message: string
  relativeDate: string
}

export interface StashFileEntry {
  path: string
  status: 'M' | 'A' | 'D' | 'R' | '?'
}

export interface StashPushOptions {
  message?: string
  includeUntracked?: boolean
  /** Limit stash to specific file paths (git stash push -- path1 path2) */
  paths?: string[]
}

export type CommitFileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'

export interface CommitChangedFile {
  path: string
  origPath?: string
  status: CommitFileStatus
}

export interface CommitDetail {
  hash: string
  shortHash: string
  parents: string[]
  author: string
  email: string
  date: string
  relativeDate: string
  subject: string
  body: string
  files: CommitChangedFile[]
}
