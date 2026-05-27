import type { Ref, RefSet, Result } from '@shared/types'
import { runGit } from './runner'

const SEP = '\x1f'

export async function listRefs(cwd: string): Promise<Result<RefSet>> {
  const fmt = [
    '%(refname)',
    '%(refname:short)',
    '%(objectname)',
    '%(HEAD)',
    '%(upstream:short)'
  ].join(SEP)
  const res = await runGit(
    ['for-each-ref', `--format=${fmt}`, 'refs/heads', 'refs/remotes', 'refs/tags'],
    { cwd }
  )
  if (!res.ok) return res

  const local: Ref[] = []
  const remote: Ref[] = []
  const tags: Ref[] = []

  for (const line of res.data.split('\n')) {
    if (!line.trim()) continue
    const [fullName, name, hash, head, upstream] = line.split(SEP)
    if (fullName.startsWith('refs/remotes/') && name.endsWith('/HEAD')) continue
    const ref: Ref = {
      name,
      fullName,
      hash,
      upstream: upstream || undefined,
      current: head === '*'
    }
    if (fullName.startsWith('refs/heads/')) local.push(ref)
    else if (fullName.startsWith('refs/remotes/')) remote.push(ref)
    else if (fullName.startsWith('refs/tags/')) tags.push(ref)
  }

  return { ok: true, data: { local, remote, tags } }
}
