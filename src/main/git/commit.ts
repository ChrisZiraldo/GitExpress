import type {
  CommitChangedFile,
  CommitDetail,
  CommitFileStatus,
  CommitInput,
  Result
} from '@shared/types'
import { runGit, runGitVoid } from './runner'
import { getGpgSign } from '../store'

const SEP = '\x1f'
const REC = '\x1e'

export async function commitCreate(cwd: string, input: CommitInput): Promise<Result<true>> {
  const noSign = !getGpgSign()
  if (input.amend) {
    const message = input.message.trim()
    const args = ['commit', '--amend']
    if (noSign) args.push('--no-gpg-sign')
    if (message) {
      args.push('-m', message)
      const description = input.description?.trim()
      if (description) args.push('-m', description)
    } else {
      args.push('--no-edit')
    }
    return runGitVoid(args, { cwd })
  }
  const message = input.message.trim()
  if (!message) {
    return { ok: false, code: 1, stderr: 'Commit message is required' }
  }
  const args = ['commit', '-m', message]
  if (noSign) args.push('--no-gpg-sign')
  const description = input.description?.trim()
  if (description) {
    args.push('-m', description)
  }
  return runGitVoid(args, { cwd })
}

function statusFromCode(code: string): CommitFileStatus {
  const c = code[0]
  switch (c) {
    case 'A':
      return 'added'
    case 'M':
    case 'T':
      return 'modified'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case 'C':
      return 'copied'
    default:
      return 'modified'
  }
}

export async function showCommit(cwd: string, hash: string): Promise<Result<CommitDetail>> {
  if (!hash) return { ok: false, code: 1, stderr: 'Commit hash required' }
  const fmt = ['%H', '%h', '%P', '%an', '%ae', '%aI', '%ar', '%s', '%b'].join(SEP) + REC
  const headRes = await runGit(['show', '-s', `--pretty=format:${fmt}`, hash], { cwd })
  if (!headRes.ok) return headRes

  const recIdx = headRes.data.indexOf(REC)
  const headPart = recIdx >= 0 ? headRes.data.slice(0, recIdx) : headRes.data
  const parts = headPart.split(SEP)
  if (parts.length < 9) {
    return { ok: false, code: 1, stderr: 'Failed to parse commit metadata' }
  }
  const [fullHash, shortHash, parentStr, author, email, date, relativeDate, subject, body] = parts

  const filesRes = await runGit(
    ['show', '--name-status', '--pretty=format:', '--no-color', '-z', hash],
    { cwd }
  )
  const files: CommitChangedFile[] = []
  if (filesRes.ok) {
    const tokens = filesRes.data.split('\0').filter((t) => t.length > 0)
    let i = 0
    while (i < tokens.length) {
      const code = tokens[i++]
      if (!code) break
      if (code[0] === 'R' || code[0] === 'C') {
        const orig = tokens[i++]
        const next = tokens[i++]
        if (next === undefined) break
        files.push({ path: next, origPath: orig, status: statusFromCode(code) })
      } else {
        const path = tokens[i++]
        if (path === undefined) break
        files.push({ path, status: statusFromCode(code) })
      }
    }
  }

  const detail: CommitDetail = {
    hash: fullHash,
    shortHash,
    parents: parentStr.trim() ? parentStr.trim().split(/\s+/) : [],
    author,
    email,
    date,
    relativeDate,
    subject,
    body: body.trim() ? body : '',
    files
  }
  return { ok: true, data: detail }
}

export async function showFileDiff(
  cwd: string,
  hash: string,
  path: string
): Promise<Result<string>> {
  if (!hash) return { ok: false, code: 1, stderr: 'Commit hash required' }
  if (!path) return { ok: false, code: 1, stderr: 'File path required' }
  return runGit(['show', '--no-color', '--format=', hash, '--', path], { cwd })
}
