import type { FileChangeType, Result } from '@shared/types'
import { runGit, runGitVoid } from './runner'

/**
 * Discard all changes for a single file, including removing it if it is
 * untracked.  The caller passes `staged` (whether the file currently has
 * staged changes) and `changeType` so we can pick the right sub-command.
 *
 * Decision table:
 *  untracked                 → git clean -fd -- <path>
 *  staged + added (new file) → git restore --staged -- <path>
 *                              (file goes back to untracked)
 *                              then git clean -fd -- <path>
 *  staged + other            → git restore --staged --worktree -- <path>
 *                              (restores index AND working tree to HEAD)
 *  unstaged tracked          → git restore -- <path>
 */
export async function discardFile(
  cwd: string,
  path: string,
  staged: boolean,
  changeType: FileChangeType
): Promise<Result<true>> {
  if (changeType === 'untracked' || changeType === 'ignored') {
    return runGitVoid(['clean', '-fd', '--', path], { cwd })
  }

  if (staged && changeType === 'added') {
    const unstage = await runGitVoid(['restore', '--staged', '--', path], { cwd })
    if (!unstage.ok) return unstage
    return runGitVoid(['clean', '-fd', '--', path], { cwd })
  }

  if (staged) {
    return runGitVoid(['restore', '--staged', '--worktree', '--', path], { cwd })
  }

  return runGitVoid(['restore', '--', path], { cwd })
}

/**
 * Check if a path is tracked in HEAD.  Used to decide whether we can
 * `git restore` a file or need `git clean` instead.
 */
export async function isTrackedInHead(cwd: string, path: string): Promise<boolean> {
  const res = await runGit(
    ['ls-files', '--error-unmatch', '--', path],
    { cwd }
  )
  return res.ok
}
