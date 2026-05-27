import type {
  BranchInfo,
  FileChangeType,
  FileEntry,
  Result,
  StatusResult
} from '@shared/types'
import { runGit } from './runner'

function codeToChange(code: string): FileChangeType {
  switch (code) {
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
    case 'U':
      return 'unmerged'
    case '?':
      return 'untracked'
    case '!':
      return 'ignored'
    default:
      return 'modified'
  }
}

function unescapePath(p: string): string {
  if (!p.startsWith('"') || !p.endsWith('"')) return p
  return p
    .slice(1, -1)
    .replace(/\\\\/g, '\\')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
}

export async function getStatus(cwd: string): Promise<Result<StatusResult>> {
  const res = await runGit(['status', '--porcelain=v2', '--branch', '--untracked-files=all'], {
    cwd
  })
  if (!res.ok) return res

  const branch: BranchInfo = {
    current: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    detached: false
  }
  const staged: FileEntry[] = []
  const unstaged: FileEntry[] = []
  const untracked: FileEntry[] = []
  const conflicted: FileEntry[] = []

  const lines = res.data.split('\n')
  for (const line of lines) {
    if (!line) continue
    if (line.startsWith('# ')) {
      const rest = line.slice(2)
      if (rest.startsWith('branch.head ')) {
        const head = rest.slice('branch.head '.length).trim()
        if (head === '(detached)') {
          branch.detached = true
        } else {
          branch.current = head
        }
      } else if (rest.startsWith('branch.upstream ')) {
        branch.upstream = rest.slice('branch.upstream '.length).trim()
      } else if (rest.startsWith('branch.ab ')) {
        const ab = rest.slice('branch.ab '.length).trim()
        const m = ab.match(/^\+(-?\d+) -(-?\d+)$/)
        if (m) {
          branch.ahead = parseInt(m[1], 10)
          branch.behind = parseInt(m[2], 10)
        }
      }
      continue
    }
    if (line.startsWith('1 ')) {
      const parts = line.split(' ')
      const xy = parts[1]
      const path = unescapePath(parts.slice(8).join(' '))
      const x = xy[0]
      const y = xy[1]
      if (x !== '.') {
        staged.push({
          path,
          staged: true,
          unstaged: false,
          changeType: codeToChange(x),
          stagedCode: x
        })
      }
      if (y !== '.') {
        unstaged.push({
          path,
          staged: false,
          unstaged: true,
          changeType: codeToChange(y),
          unstagedCode: y
        })
      }
    } else if (line.startsWith('2 ')) {
      const parts = line.split(' ')
      const xy = parts[1]
      const pathPart = parts.slice(9).join(' ')
      const tabIdx = pathPart.indexOf('\t')
      const newPath = unescapePath(tabIdx >= 0 ? pathPart.slice(0, tabIdx) : pathPart)
      const origPath = tabIdx >= 0 ? unescapePath(pathPart.slice(tabIdx + 1)) : undefined
      const x = xy[0]
      const y = xy[1]
      if (x !== '.') {
        staged.push({
          path: newPath,
          origPath,
          staged: true,
          unstaged: false,
          changeType: codeToChange(x),
          stagedCode: x
        })
      }
      if (y !== '.') {
        unstaged.push({
          path: newPath,
          origPath,
          staged: false,
          unstaged: true,
          changeType: codeToChange(y),
          unstagedCode: y
        })
      }
    } else if (line.startsWith('u ')) {
      const parts = line.split(' ')
      const path = unescapePath(parts.slice(10).join(' '))
      conflicted.push({
        path,
        staged: false,
        unstaged: true,
        changeType: 'unmerged'
      })
    } else if (line.startsWith('? ')) {
      const path = unescapePath(line.slice(2))
      untracked.push({
        path,
        staged: false,
        unstaged: true,
        changeType: 'untracked'
      })
    }
  }

  return {
    ok: true,
    data: { branch, staged, unstaged, untracked, conflicted }
  }
}
