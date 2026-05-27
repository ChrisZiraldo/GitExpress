import { promises as fs } from 'node:fs'
import { basename, resolve } from 'node:path'
import type { Result } from '@shared/types'
import { runGit } from './runner'

export async function isGitRepo(path: string): Promise<boolean> {
  const res = await runGit(['rev-parse', '--is-inside-work-tree'], { cwd: path })
  return res.ok && res.data.trim() === 'true'
}

export async function resolveRepoRoot(path: string): Promise<Result<{ root: string; name: string }>> {
  try {
    const stat = await fs.stat(path)
    if (!stat.isDirectory()) {
      return { ok: false, code: 1, stderr: 'Not a directory' }
    }
  } catch {
    return { ok: false, code: 1, stderr: 'Path does not exist' }
  }
  const res = await runGit(['rev-parse', '--show-toplevel'], { cwd: path })
  if (!res.ok) return res
  const root = resolve(res.data.trim())
  return { ok: true, data: { root, name: basename(root) } }
}
