import type { Result } from '@shared/types'
import { runGitVoid } from './runner'

export async function stageAdd(cwd: string, paths: string[]): Promise<Result<true>> {
  if (paths.length === 0) {
    return runGitVoid(['add', '--all'], { cwd })
  }
  return runGitVoid(['add', '--', ...paths], { cwd })
}

export async function stageReset(cwd: string, paths: string[]): Promise<Result<true>> {
  if (paths.length === 0) {
    return runGitVoid(['reset', 'HEAD', '--'], { cwd })
  }
  return runGitVoid(['reset', 'HEAD', '--', ...paths], { cwd })
}
