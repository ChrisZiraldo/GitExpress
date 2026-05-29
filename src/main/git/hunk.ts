import type { Result } from '@shared/types'
import { runGitVoid } from './runner'

/**
 * Apply a single-hunk patch (built from a file header + one `@@` block) to
 * the index — i.e. stage just that hunk.
 */
// `--recount`: line counts in hunk headers may be slightly off when we ship
// a subset patch (e.g. an unselected `-` line promoted to context, or an
// add line dropped together with its trailing `\ No newline at end of file`
// marker).  `--recount` tells git to infer counts from the patch body and
// keep going.  Harmless for whole-hunk patches.
const APPLY_FLAGS = ['--recount', '--whitespace=nowarn']

export async function stageHunk(cwd: string, patch: string): Promise<Result<true>> {
  return runGitVoid(['apply', '--cached', ...APPLY_FLAGS, '-'], {
    cwd,
    input: ensureTrailingNewline(patch)
  })
}

/**
 * Reverse-apply a single-hunk patch to the index — i.e. unstage just that
 * hunk while leaving the working tree untouched.
 */
export async function unstageHunk(cwd: string, patch: string): Promise<Result<true>> {
  return runGitVoid(['apply', '--cached', '--reverse', ...APPLY_FLAGS, '-'], {
    cwd,
    input: ensureTrailingNewline(patch)
  })
}

/**
 * Reverse-apply a single-hunk patch to the working tree — i.e. discard just
 * that hunk's changes (leaves the index alone).
 */
export async function discardHunk(cwd: string, patch: string): Promise<Result<true>> {
  return runGitVoid(['apply', '--reverse', ...APPLY_FLAGS, '-'], {
    cwd,
    input: ensureTrailingNewline(patch)
  })
}

function ensureTrailingNewline(s: string): string {
  return s.endsWith('\n') ? s : s + '\n'
}
