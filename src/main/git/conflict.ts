import type { ConflictVersions, Result } from '@shared/types'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runGit, runGitVoid } from './runner'

export async function getConflictVersions(
  cwd: string,
  path: string
): Promise<Result<ConflictVersions>> {
  if (!path) return { ok: false, code: 1, stderr: 'File path required' }

  const [baseRes, oursRes, theirsRes] = await Promise.all([
    runGit(['show', `:1:${path}`], { cwd }),
    runGit(['show', `:2:${path}`], { cwd }),
    runGit(['show', `:3:${path}`], { cwd })
  ])

  return {
    ok: true,
    data: {
      path,
      base: baseRes.ok ? baseRes.data : '',
      ours: oursRes.ok ? oursRes.data : '',
      theirs: theirsRes.ok ? theirsRes.data : ''
    }
  }
}

export async function resolveConflict(
  cwd: string,
  path: string,
  content: string
): Promise<Result<true>> {
  if (!path) return { ok: false, code: 1, stderr: 'File path required' }
  try {
    await writeFile(join(cwd, path), content, 'utf8')
  } catch (err: unknown) {
    return { ok: false, code: 1, stderr: String(err) }
  }
  return runGitVoid(['add', '--', path], { cwd })
}

export async function useConflictSide(
  cwd: string,
  path: string,
  side: 'ours' | 'theirs'
): Promise<Result<true>> {
  if (!path) return { ok: false, code: 1, stderr: 'File path required' }
  const flag = side === 'ours' ? '--ours' : '--theirs'
  const checkoutRes = await runGitVoid(['checkout', flag, '--', path], { cwd })
  if (!checkoutRes.ok) return checkoutRes
  return runGitVoid(['add', '--', path], { cwd })
}

export async function mergeContinue(cwd: string): Promise<Result<true>> {
  // Use a no-op editor so git doesn't open an interactive prompt for the merge commit message.
  return runGitVoid(['merge', '--continue'], {
    cwd,
    env: { ...process.env, GIT_EDITOR: 'true', EDITOR: 'true', VISUAL: 'true' }
  })
}

export async function mergeAbort(cwd: string): Promise<Result<true>> {
  return runGitVoid(['merge', '--abort'], { cwd })
}
