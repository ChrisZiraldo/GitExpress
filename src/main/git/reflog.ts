import type { Result } from '@shared/types'
import { runGit, runGitVoid } from './runner'

export async function getHeadSha(cwd: string): Promise<Result<string>> {
  const res = await runGit(['rev-parse', 'HEAD'], { cwd })
  if (!res.ok) return res
  return { ok: true, data: res.data.trim() }
}

export async function undoTo(cwd: string, sha: string): Promise<Result<true>> {
  if (!sha) return { ok: false, code: 1, stderr: 'SHA required for undo' }
  return runGitVoid(['reset', '--hard', sha], { cwd })
}
