import type { Branch, BranchCreateOptions, Result } from '@shared/types'
import { runGit, runGitVoid } from './runner'

export async function listBranches(cwd: string): Promise<Result<Branch[]>> {
  const fmt = '%(refname:short)\t%(HEAD)\t%(upstream:short)\t%(refname)'
  const res = await runGit(
    ['for-each-ref', '--format', fmt, 'refs/heads', 'refs/remotes'],
    { cwd }
  )
  if (!res.ok) return res
  const branches: Branch[] = []
  for (const line of res.data.split('\n')) {
    if (!line.trim()) continue
    const [name, head, upstream, fullRef] = line.split('\t')
    if (fullRef?.startsWith('refs/remotes/') && name?.endsWith('/HEAD')) continue
    branches.push({
      name,
      current: head === '*',
      remote: fullRef?.startsWith('refs/remotes/') ?? false,
      upstream: upstream || null
    })
  }
  return { ok: true, data: branches }
}

export async function checkoutBranch(cwd: string, name: string): Promise<Result<true>> {
  return runGitVoid(['checkout', name], { cwd })
}

export async function createBranch(
  cwd: string,
  name: string,
  opts: BranchCreateOptions = {}
): Promise<Result<true>> {
  const trimmed = name.trim()
  if (!trimmed) {
    return { ok: false, code: 1, stderr: 'Branch name is required' }
  }
  if (opts.checkout) {
    const args = ['checkout', '-b', trimmed]
    if (opts.startPoint) args.push(opts.startPoint)
    return runGitVoid(args, { cwd })
  }
  const args = ['branch', trimmed]
  if (opts.startPoint) args.push(opts.startPoint)
  return runGitVoid(args, { cwd })
}

export async function createBranchFromCommit(
  cwd: string,
  name: string,
  hash: string,
  opts: { checkout?: boolean } = {}
): Promise<Result<true>> {
  return createBranch(cwd, name, { startPoint: hash, checkout: opts.checkout })
}

export async function checkoutDetached(cwd: string, hash: string): Promise<Result<true>> {
  if (!hash) return { ok: false, code: 1, stderr: 'Commit hash required' }
  return runGitVoid(['checkout', '--detach', hash], { cwd })
}

/** Hard-resets the current branch to its upstream tracking ref (@{u}). */
export async function resetToRemote(cwd: string): Promise<Result<true>> {
  return runGitVoid(['reset', '--hard', '@{u}'], { cwd })
}

/** Hard-resets to HEAD — discards all uncommitted changes, stays on the current commit. */
export async function resetHard(cwd: string): Promise<Result<true>> {
  return runGitVoid(['reset', '--hard', 'HEAD'], { cwd })
}

/**
 * Deletes a local branch. Uses `-d` (safe — refuses if not fully merged) by
 * default; pass `force: true` to use `-D` and discard unmerged work.
 */
export async function deleteBranch(
  cwd: string,
  name: string,
  opts: { force?: boolean } = {}
): Promise<Result<true>> {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, code: 1, stderr: 'Branch name is required' }
  const flag = opts.force ? '-D' : '-d'
  return runGitVoid(['branch', flag, trimmed], { cwd })
}

export async function checkoutRemote(
  cwd: string,
  remoteRef: string
): Promise<Result<true>> {
  const trimmed = remoteRef.trim()
  if (!trimmed) {
    return { ok: false, code: 1, stderr: 'Remote ref required' }
  }
  const slash = trimmed.indexOf('/')
  if (slash < 0) {
    return { ok: false, code: 1, stderr: 'Invalid remote ref (expected "<remote>/<branch>")' }
  }
  const localName = trimmed.slice(slash + 1)
  return runGitVoid(['checkout', '-b', localName, '--track', trimmed], { cwd })
}
