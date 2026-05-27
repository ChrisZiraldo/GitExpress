import type { Result, Stash, StashFileEntry, StashPushOptions } from '@shared/types'
import { runGit, runGitVoid } from './runner'
import { getStatus } from './status'

const SEP = '\x1f'

export async function listStashes(cwd: string): Promise<Result<Stash[]>> {
  const fmt = ['%gd', '%H', '%gs', '%ar'].join(SEP)
  const res = await runGit(['stash', 'list', `--pretty=format:${fmt}`], { cwd })
  if (!res.ok) {
    if (res.stderr.includes("not a git repository") || res.stderr.includes('No stash')) {
      return { ok: true, data: [] }
    }
    return res
  }
  const stashes: Stash[] = []
  for (const line of res.data.split('\n')) {
    if (!line.trim()) continue
    const [ref, hash, subject, relativeDate] = line.split(SEP)
    const m = ref.match(/stash@\{(\d+)\}/)
    const index = m ? parseInt(m[1], 10) : stashes.length
    const branchMatch = subject.match(/^(?:WIP )?[Oo]n ([^:]+):\s*(.*)$/)
    const branch = branchMatch ? branchMatch[1] : ''
    const message = branchMatch ? branchMatch[2] : subject
    stashes.push({ index, hash, branch, message, relativeDate })
  }
  return { ok: true, data: stashes }
}

export async function stashPush(
  cwd: string,
  opts: StashPushOptions = {}
): Promise<Result<true>> {
  const status = await getStatus(cwd)
  if (status.ok) {
    const total =
      status.data.staged.length +
      status.data.unstaged.length +
      status.data.untracked.length +
      status.data.conflicted.length
    if (total === 0) {
      return { ok: false, code: 1, stderr: 'No local changes to stash' }
    }
  }
  const args = ['stash', 'push']
  if (opts.includeUntracked) args.push('--include-untracked')
  const message = opts.message?.trim()
  if (message) {
    args.push('-m', message)
  }
  if (opts.paths && opts.paths.length > 0) {
    args.push('--', ...opts.paths)
  }
  return runGitVoid(args, { cwd })
}

export async function stashPop(cwd: string, index: number): Promise<Result<true>> {
  return runGitVoid(['stash', 'pop', `stash@{${index}}`], { cwd })
}

export async function stashApply(cwd: string, index: number): Promise<Result<true>> {
  return runGitVoid(['stash', 'apply', `stash@{${index}}`], { cwd })
}

export async function stashDrop(cwd: string, index: number): Promise<Result<true>> {
  return runGitVoid(['stash', 'drop', `stash@{${index}}`], { cwd })
}

export async function stashFiles(
  cwd: string,
  index: number
): Promise<Result<StashFileEntry[]>> {
  const res = await runGit(
    ['stash', 'show', `stash@{${index}}`, '--name-status'],
    { cwd }
  )
  if (!res.ok) return res
  const files: StashFileEntry[] = []
  for (const line of res.data.split('\n')) {
    if (!line.trim()) continue
    const [rawStatus, ...rest] = line.split('\t')
    const path = rest.join('\t').trim()
    if (!path) continue
    const status = (rawStatus?.trim()?.[0] ?? '?') as StashFileEntry['status']
    files.push({ path, status })
  }
  return { ok: true, data: files }
}

export async function stashFileDiff(
  cwd: string,
  index: number,
  filePath: string
): Promise<Result<string>> {
  // diff the stash entry against its first parent for a specific file
  return runGit(
    ['diff', `stash@{${index}}^1`, `stash@{${index}}`, '--', filePath],
    { cwd }
  )
}

export async function stashApplyFile(
  cwd: string,
  index: number,
  filePath: string
): Promise<Result<true>> {
  // Copy a single file out of the stash into the working tree (leaves stash intact)
  return runGitVoid(['checkout', `stash@{${index}}`, '--', filePath], { cwd })
}
