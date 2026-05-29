import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Result } from '@shared/types'

const execFileAsync = promisify(execFile)

const MAX_BUFFER = 8 * 1024 * 1024

// Common locations for `gh` when the app is launched from Finder (which doesn't
// inherit the user's shell PATH). We add them defensively so the CLI is found
// without requiring the user to configure anything.
const EXTRA_PATH = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin'
].join(':')

export interface GhRunOptions {
  cwd: string
  /** Non-zero exit codes that should still be treated as success. */
  allowExitCodes?: number[]
}

/**
 * Run a `gh` CLI command. Returns stdout on success or the trimmed stderr on
 * failure. The caller can mark certain exit codes (e.g. 1 = "no PR found")
 * as soft-success via `allowExitCodes`.
 */
export async function runGh(
  args: string[],
  opts: GhRunOptions
): Promise<Result<string>> {
  try {
    const { stdout } = await execFileAsync('gh', args, {
      cwd: opts.cwd,
      maxBuffer: MAX_BUFFER,
      env: {
        ...process.env,
        PATH: `${EXTRA_PATH}:${process.env.PATH ?? ''}`,
        // gh respects NO_COLOR/CLICOLOR; ensure plain JSON output is unaffected
        // by user terminal styling.
        NO_COLOR: '1',
        CLICOLOR: '0'
      }
    })
    return { ok: true, data: stdout }
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      stderr?: string
      stdout?: string
      code?: number | string
    }
    const code = typeof e.code === 'number' ? e.code : 1
    if (opts.allowExitCodes?.includes(code)) {
      return { ok: true, data: e.stdout ? e.stdout.toString() : '' }
    }
    if (e.code === 'ENOENT') {
      return {
        ok: false,
        code: 127,
        stderr:
          'GitHub CLI (gh) not found in PATH. Install with `brew install gh` and run `gh auth login`.'
      }
    }
    const stderr =
      (e.stderr && e.stderr.toString().trim()) || e.message || 'gh command failed'
    return { ok: false, code, stderr }
  }
}

/**
 * Lightweight detection — true when `gh` is installed AND the user is
 * authenticated to github.com. Cached for the lifetime of the process since
 * the answer rarely changes during a session.
 */
let cachedAvailable: boolean | null = null
export async function isGhAvailable(): Promise<boolean> {
  if (cachedAvailable !== null) return cachedAvailable
  const res = await runGh(['auth', 'status'], { cwd: process.cwd() })
  cachedAvailable = res.ok
  return cachedAvailable
}
