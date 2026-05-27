import type { Result } from '@shared/types'
import { runGitVoid } from './runner'

export async function createTag(
  cwd: string,
  name: string,
  hash: string,
  message?: string
): Promise<Result<true>> {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, code: 1, stderr: 'Tag name is required' }
  if (!hash) return { ok: false, code: 1, stderr: 'Commit hash is required' }
  if (message?.trim()) {
    return runGitVoid(['tag', '-a', trimmed, hash, '-m', message.trim()], { cwd })
  }
  return runGitVoid(['tag', trimmed, hash], { cwd })
}

export async function deleteTag(cwd: string, name: string): Promise<Result<true>> {
  if (!name) return { ok: false, code: 1, stderr: 'Tag name is required' }
  return runGitVoid(['tag', '-d', name], { cwd })
}
