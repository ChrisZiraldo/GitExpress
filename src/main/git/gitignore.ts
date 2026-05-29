import type { GitignoreReadResult, Result } from '@shared/types'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function readGitignore(cwd: string): Promise<Result<GitignoreReadResult>> {
  const path = join(cwd, '.gitignore')
  try {
    const content = await readFile(path, 'utf8')
    return { ok: true, data: { content, path } }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ok: true, data: { content: '', path } }
    }
    return { ok: false, code: 1, stderr: String(err) }
  }
}

export async function writeGitignore(cwd: string, content: string): Promise<Result<true>> {
  const path = join(cwd, '.gitignore')
  try {
    await writeFile(path, content, 'utf8')
    return { ok: true, data: true }
  } catch (err: unknown) {
    return { ok: false, code: 1, stderr: String(err) }
  }
}

export async function appendGitignore(cwd: string, pattern: string): Promise<Result<true>> {
  const path = join(cwd, '.gitignore')
  try {
    let existing = ''
    try {
      existing = await readFile(path, 'utf8')
    } catch {
      // file doesn't exist yet
    }
    // Avoid duplicates
    const lines = existing.split('\n').map((l) => l.trim())
    if (lines.includes(pattern.trim())) {
      return { ok: true, data: true }
    }
    const separator = existing && !existing.endsWith('\n') ? '\n' : ''
    await writeFile(path, existing + separator + pattern + '\n', 'utf8')
    return { ok: true, data: true }
  } catch (err: unknown) {
    return { ok: false, code: 1, stderr: String(err) }
  }
}
