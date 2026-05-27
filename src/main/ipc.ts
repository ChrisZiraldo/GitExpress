import { dialog, ipcMain, shell, BrowserWindow } from 'electron'
import { Channels } from '@shared/channels'
import type {
  BranchCreateOptions,
  CommitInput,
  DiffOptions,
  FileChangeType,
  PullOptions,
  PushOptions,
  RecentRepo,
  Result,
  StashPushOptions
} from '@shared/types'
import { getStatus } from './git/status'
import { getFileDiff } from './git/diff'
import { stageAdd, stageReset } from './git/stage'
import { discardFile } from './git/restore'
import { commitCreate, showCommit, showFileDiff } from './git/commit'
import { remoteFetch, remotePull, remotePush } from './git/remotes'
import {
  checkoutBranch,
  checkoutDetached,
  checkoutRemote,
  createBranch,
  createBranchFromCommit,
  listBranches,
  resetToRemote
} from './git/branch'
import { graphLog, recentCommits } from './git/log'
import { listRefs } from './git/refs'
import {
  listStashes,
  stashApply,
  stashApplyFile,
  stashDrop,
  stashFileDiff,
  stashFiles,
  stashPop,
  stashPush
} from './git/stash'
import { resolveRepoRoot } from './git/repo'
import { createTag, deleteTag } from './git/tag'
import { cherryPick, revert, resetToCommit, type ResetMode } from './git/commit-ops'
import { join } from 'node:path'
import { getLastRepoPath, getRecents, pushRecent, removeRecent, saveLastRepoPath } from './store'
import { buildAppMenu } from './menu'

function fail(stderr: string, code = 1): Result<never> {
  return { ok: false, code, stderr }
}

function getOwnerWindow(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused) return focused
  const all = BrowserWindow.getAllWindows()
  return all[0] ?? null
}

export function registerIpc(): void {
  ipcMain.handle(Channels.RepoPick, async () => {
    const win = getOwnerWindow()
    const result = win
      ? await dialog.showOpenDialog(win, {
          properties: ['openDirectory', 'createDirectory']
        })
      : await dialog.showOpenDialog({
          properties: ['openDirectory', 'createDirectory']
        })
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: true, data: null } as Result<RecentRepo | null>
    }
    const picked = result.filePaths[0]
    const root = await resolveRepoRoot(picked)
    if (!root.ok) return root
    const recents = pushRecent({ path: root.data.root, name: root.data.name })
    saveLastRepoPath(root.data.root)
    buildAppMenu(recents)
    return { ok: true, data: recents[0] } as Result<RecentRepo>
  })

  ipcMain.handle(Channels.RepoOpen, async (_e, path: string) => {
    if (typeof path !== 'string' || !path) return fail('Invalid repo path')
    const root = await resolveRepoRoot(path)
    if (!root.ok) return root
    const recents = pushRecent({ path: root.data.root, name: root.data.name })
    saveLastRepoPath(root.data.root)
    buildAppMenu(recents)
    return { ok: true, data: recents[0] } as Result<RecentRepo>
  })

  ipcMain.handle(Channels.RepoRecents, async () => {
    return { ok: true, data: getRecents() } as Result<RecentRepo[]>
  })

  ipcMain.handle(Channels.RepoRemoveRecent, async (_e, path: string) => {
    if (typeof path !== 'string') return fail('Invalid path')
    const recents = removeRecent(path)
    buildAppMenu(recents)
    return { ok: true, data: recents } as Result<RecentRepo[]>
  })

  ipcMain.handle(Channels.RepoGetLast, async () => {
    return { ok: true, data: getLastRepoPath() } as Result<string>
  })

  ipcMain.handle(Channels.StatusGet, async (_e, cwd: string) => {
    if (!cwd) return fail('No repository selected')
    return getStatus(cwd)
  })

  ipcMain.handle(Channels.DiffFile, async (_e, cwd: string, opts: DiffOptions) => {
    if (!cwd) return fail('No repository selected')
    if (!opts?.path) return fail('No file specified')
    return getFileDiff(cwd, opts.path, !!opts.staged)
  })

  ipcMain.handle(Channels.StageAdd, async (_e, cwd: string, paths: string[]) => {
    if (!cwd) return fail('No repository selected')
    return stageAdd(cwd, Array.isArray(paths) ? paths : [])
  })

  ipcMain.handle(Channels.StageReset, async (_e, cwd: string, paths: string[]) => {
    if (!cwd) return fail('No repository selected')
    return stageReset(cwd, Array.isArray(paths) ? paths : [])
  })

  ipcMain.handle(Channels.CommitCreate, async (_e, cwd: string, input: CommitInput) => {
    if (!cwd) return fail('No repository selected')
    return commitCreate(cwd, input)
  })

  ipcMain.handle(Channels.RemoteFetch, async (_e, cwd: string) => {
    if (!cwd) return fail('No repository selected')
    return remoteFetch(cwd)
  })

  ipcMain.handle(Channels.RemotePull, async (_e, cwd: string, opts: PullOptions) => {
    if (!cwd) return fail('No repository selected')
    return remotePull(cwd, opts ?? {})
  })

  ipcMain.handle(Channels.RemotePush, async (_e, cwd: string, opts: PushOptions) => {
    if (!cwd) return fail('No repository selected')
    return remotePush(cwd, opts ?? {})
  })

  ipcMain.handle(Channels.BranchList, async (_e, cwd: string) => {
    if (!cwd) return fail('No repository selected')
    return listBranches(cwd)
  })

  ipcMain.handle(Channels.BranchCheckout, async (_e, cwd: string, name: string) => {
    if (!cwd) return fail('No repository selected')
    if (!name) return fail('Branch name required')
    return checkoutBranch(cwd, name)
  })

  ipcMain.handle(
    Channels.BranchCreate,
    async (_e, cwd: string, name: string, opts: BranchCreateOptions) => {
      if (!cwd) return fail('No repository selected')
      return createBranch(cwd, name, opts ?? {})
    }
  )

  ipcMain.handle(Channels.LogRecent, async (_e, cwd: string, limit?: number) => {
    if (!cwd) return fail('No repository selected')
    return recentCommits(cwd, typeof limit === 'number' ? limit : 50)
  })

  ipcMain.handle(Channels.LogGraph, async (_e, cwd: string, limit?: number) => {
    if (!cwd) return fail('No repository selected')
    return graphLog(cwd, typeof limit === 'number' ? limit : 500)
  })

  ipcMain.handle(Channels.RefsList, async (_e, cwd: string) => {
    if (!cwd) return fail('No repository selected')
    return listRefs(cwd)
  })

  ipcMain.handle(Channels.CommitShow, async (_e, cwd: string, hash: string) => {
    if (!cwd) return fail('No repository selected')
    return showCommit(cwd, hash)
  })

  ipcMain.handle(
    Channels.CommitShowFileDiff,
    async (_e, cwd: string, hash: string, path: string) => {
      if (!cwd) return fail('No repository selected')
      return showFileDiff(cwd, hash, path)
    }
  )

  ipcMain.handle(
    Channels.BranchCheckoutDetached,
    async (_e, cwd: string, hash: string) => {
      if (!cwd) return fail('No repository selected')
      return checkoutDetached(cwd, hash)
    }
  )

  ipcMain.handle(
    Channels.BranchCreateFromCommit,
    async (
      _e,
      cwd: string,
      name: string,
      hash: string,
      opts: { checkout?: boolean }
    ) => {
      if (!cwd) return fail('No repository selected')
      return createBranchFromCommit(cwd, name, hash, opts ?? {})
    }
  )

  ipcMain.handle(
    Channels.BranchCheckoutRemote,
    async (_e, cwd: string, remoteRef: string) => {
      if (!cwd) return fail('No repository selected')
      return checkoutRemote(cwd, remoteRef)
    }
  )

  ipcMain.handle(Channels.StashList, async (_e, cwd: string) => {
    if (!cwd) return fail('No repository selected')
    return listStashes(cwd)
  })

  ipcMain.handle(
    Channels.StashPush,
    async (_e, cwd: string, opts: StashPushOptions) => {
      if (!cwd) return fail('No repository selected')
      return stashPush(cwd, opts ?? {})
    }
  )

  ipcMain.handle(Channels.StashPop, async (_e, cwd: string, index: number) => {
    if (!cwd) return fail('No repository selected')
    return stashPop(cwd, typeof index === 'number' ? index : 0)
  })

  ipcMain.handle(Channels.StashApply, async (_e, cwd: string, index: number) => {
    if (!cwd) return fail('No repository selected')
    return stashApply(cwd, typeof index === 'number' ? index : 0)
  })

  ipcMain.handle(Channels.StashDrop, async (_e, cwd: string, index: number) => {
    if (!cwd) return fail('No repository selected')
    return stashDrop(cwd, typeof index === 'number' ? index : 0)
  })

  ipcMain.handle(Channels.StashFiles, async (_e, cwd: string, index: number) => {
    if (!cwd) return fail('No repository selected')
    return stashFiles(cwd, typeof index === 'number' ? index : 0)
  })

  ipcMain.handle(Channels.StashFileDiff, async (_e, cwd: string, index: number, filePath: string) => {
    if (!cwd) return fail('No repository selected')
    if (!filePath) return fail('No file path provided')
    return stashFileDiff(cwd, typeof index === 'number' ? index : 0, filePath)
  })

  ipcMain.handle(Channels.StashApplyFile, async (_e, cwd: string, index: number, filePath: string) => {
    if (!cwd) return fail('No repository selected')
    if (!filePath) return fail('No file path provided')
    return stashApplyFile(cwd, typeof index === 'number' ? index : 0, filePath)
  })

  ipcMain.handle(
    Channels.FileDiscard,
    async (
      _e,
      cwd: string,
      path: string,
      staged: boolean,
      changeType: FileChangeType
    ) => {
      if (!cwd) return fail('No repository selected')
      if (!path) return fail('No file path provided')
      return discardFile(cwd, path, !!staged, changeType ?? 'modified')
    }
  )

  ipcMain.handle(Channels.BranchResetToRemote, async (_e, cwd: string) => {
    if (!cwd) return fail('No repository selected')
    return resetToRemote(cwd)
  })

  ipcMain.handle(
    Channels.TagCreate,
    async (_e, cwd: string, name: string, hash: string, message?: string) => {
      if (!cwd) return fail('No repository selected')
      return createTag(cwd, name, hash, message)
    }
  )

  ipcMain.handle(Channels.TagDelete, async (_e, cwd: string, name: string) => {
    if (!cwd) return fail('No repository selected')
    return deleteTag(cwd, name)
  })

  ipcMain.handle(Channels.CommitCherryPick, async (_e, cwd: string, hash: string) => {
    if (!cwd) return fail('No repository selected')
    return cherryPick(cwd, hash)
  })

  ipcMain.handle(Channels.CommitRevert, async (_e, cwd: string, hash: string) => {
    if (!cwd) return fail('No repository selected')
    return revert(cwd, hash)
  })

  ipcMain.handle(
    Channels.CommitReset,
    async (_e, cwd: string, hash: string, mode: ResetMode) => {
      if (!cwd) return fail('No repository selected')
      return resetToCommit(cwd, hash, mode ?? 'mixed')
    }
  )

  ipcMain.handle(Channels.ShellOpenPath, async (_e, fullPath: string) => {
    if (typeof fullPath !== 'string' || !fullPath) return
    await shell.openPath(fullPath)
  })

  ipcMain.handle(Channels.ShellRevealInFolder, (_e, fullPath: string) => {
    if (typeof fullPath !== 'string' || !fullPath) return
    shell.showItemInFolder(fullPath)
  })

  ipcMain.handle(
    Channels.WindowResize,
    (_e, width: number, height: number) => {
      const win = getOwnerWindow()
      if (!win || win.isDestroyed()) return
      win.setSize(Math.round(width), Math.round(height))
      win.center()
    }
  )

  ipcMain.handle(Channels.DryRunStatus, () => ({
    active: process.env.SIMPLEGIT_DRY_RUN === '1',
    logPath: process.env.SIMPLEGIT_DRY_RUN_LOG ?? join(process.cwd(), 'dry-run.log')
  }))
}
