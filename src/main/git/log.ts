import type { Commit, GraphCommit, Result } from '@shared/types'
import { runGit } from './runner'

const SEP = '\x1f'
const REC = '\x1e'

function isEmptyRepoError(stderr: string): boolean {
  return (
    stderr.includes('does not have any commits yet') ||
    stderr.includes('bad default revision') ||
    stderr.includes('unknown revision')
  )
}

export async function recentCommits(cwd: string, limit = 50): Promise<Result<Commit[]>> {
  const fmt = ['%H', '%h', '%an', '%ae', '%aI', '%ar', '%s'].join(SEP) + REC
  const res = await runGit(
    ['log', `--max-count=${limit}`, `--pretty=format:${fmt}`, '--no-color'],
    { cwd }
  )
  if (!res.ok) {
    if (isEmptyRepoError(res.stderr)) return { ok: true, data: [] }
    return res
  }
  const commits: Commit[] = []
  for (const rec of res.data.split(REC)) {
    const trimmed = rec.trim()
    if (!trimmed) continue
    const parts = trimmed.split(SEP)
    if (parts.length < 7) continue
    const [hash, shortHash, author, email, date, relativeDate, subject] = parts
    commits.push({ hash, shortHash, author, email, date, relativeDate, subject })
  }
  return { ok: true, data: commits }
}

export async function graphLog(cwd: string, limit = 500): Promise<Result<GraphCommit[]>> {
  const fmt = ['%H', '%h', '%P', '%an', '%ae', '%aI', '%ar', '%s'].join(SEP) + REC
  const res = await runGit(
    [
      'log',
      '--all',
      '--branches',
      '--remotes',
      '--date-order',
      `--max-count=${limit}`,
      `--pretty=format:${fmt}`,
      '--no-color'
    ],
    { cwd }
  )
  if (!res.ok) {
    if (isEmptyRepoError(res.stderr)) return { ok: true, data: [] }
    return res
  }
  const commits: GraphCommit[] = []
  for (const rec of res.data.split(REC)) {
    const trimmed = rec.trim()
    if (!trimmed) continue
    const parts = trimmed.split(SEP)
    if (parts.length < 8) continue
    const [hash, shortHash, parentStr, author, email, date, relativeDate, subject] = parts
    const parents = parentStr.trim() ? parentStr.trim().split(/\s+/) : []
    commits.push({ hash, shortHash, parents, author, email, date, relativeDate, subject })
  }
  return { ok: true, data: commits }
}
