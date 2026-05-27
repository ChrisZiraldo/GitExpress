import type { Result } from '@shared/types'
import { runGit } from './runner'

export async function getFileDiff(
  cwd: string,
  path: string,
  staged: boolean
): Promise<Result<string>> {
  const args = ['diff', '--no-color']
  if (staged) args.push('--cached')
  args.push('--', path)
  const res = await runGit(args, { cwd })
  if (!res.ok) return res

  if (!staged && res.data.trim() === '') {
    const untrackedDiff = await runGit(
      ['diff', '--no-color', '--no-index', '--', '/dev/null', path],
      { cwd, allowExitCodes: [1] }
    )
    if (untrackedDiff.ok) {
      return { ok: true, data: untrackedDiff.data }
    }
  }
  return res
}
