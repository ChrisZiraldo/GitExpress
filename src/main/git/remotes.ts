import type { PullOptions, PushOptions, Result } from '@shared/types'
import { runGit, runGitVoid } from './runner'

export async function remoteFetch(cwd: string): Promise<Result<true>> {
  return runGitVoid(['fetch', '--all', '--prune'], { cwd })
}

export async function remotePull(cwd: string, opts: PullOptions = {}): Promise<Result<true>> {
  const args = ['pull']
  if (opts.rebase) args.push('--rebase')
  else args.push('--ff-only')
  if (opts.branch) {
    args.push(opts.remote ?? 'origin', opts.branch)
  }
  return runGitVoid(args, { cwd })
}

async function currentBranch(cwd: string): Promise<string | null> {
  const res = await runGit(['symbolic-ref', '--short', 'HEAD'], { cwd })
  if (!res.ok) return null
  return res.data.trim() || null
}

async function hasUpstream(cwd: string): Promise<boolean> {
  const res = await runGit(
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
    { cwd }
  )
  return res.ok
}

export async function remotePush(cwd: string, opts: PushOptions = {}): Promise<Result<true>> {
  const args = ['push']
  if (opts.force) args.push('--force-with-lease')

  if (opts.branch) {
    // Explicit branch push — always specify remote and refspec
    const remote = opts.remote ?? 'origin'
    args.push(remote, `${opts.branch}:${opts.branch}`)
    return runGitVoid(args, { cwd })
  }

  const upstreamExists = await hasUpstream(cwd)
  if (!upstreamExists || opts.setUpstream) {
    const branch = await currentBranch(cwd)
    if (!branch) {
      return { ok: false, code: 1, stderr: 'Cannot push from detached HEAD' }
    }
    args.push('--set-upstream', 'origin', branch)
  }
  return runGitVoid(args, { cwd })
}
