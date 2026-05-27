import type { Result } from '@shared/types'
import { runGitVoid } from './runner'

export type ResetMode = 'soft' | 'mixed' | 'hard'

export async function cherryPick(cwd: string, hash: string): Promise<Result<true>> {
  if (!hash) return { ok: false, code: 1, stderr: 'Commit hash required' }
  return runGitVoid(['cherry-pick', hash], { cwd })
}

export async function revert(cwd: string, hash: string): Promise<Result<true>> {
  if (!hash) return { ok: false, code: 1, stderr: 'Commit hash required' }
  return runGitVoid(['revert', '--no-edit', hash], { cwd })
}

export async function resetToCommit(
  cwd: string,
  hash: string,
  mode: ResetMode
): Promise<Result<true>> {
  if (!hash) return { ok: false, code: 1, stderr: 'Commit hash required' }
  const flag = `--${mode}`
  return runGitVoid(['reset', flag, hash], { cwd })
}
