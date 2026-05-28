import { Agent, CursorAgentError } from '@cursor/sdk'
import type { GeneratedCommitMessage, Result } from '@shared/types'
import { runGit } from '../git/runner'
import { getCommitMessageRules, getCursorApiKey } from '../store'

const MAX_DIFF_BYTES = 80_000

/**
 * Generate a commit message from the currently staged changes using the
 * Cursor SDK.  Caller passes the repo path; we read the staged diff, the
 * stored API key, and the user's formatting rules from electron-store.
 *
 * Returns `{ subject, body }` where `body` may be empty for trivial changes.
 */
export async function generateCommitMessage(
  cwd: string
): Promise<Result<GeneratedCommitMessage>> {
  const apiKey = getCursorApiKey()
  if (!apiKey) {
    return {
      ok: false,
      code: 1,
      stderr: 'No Cursor API key configured. Open Settings to add one.'
    }
  }

  const diff = await collectStagedDiff(cwd)
  if (!diff.ok) return diff
  if (!diff.data.trim()) {
    return { ok: false, code: 1, stderr: 'No staged changes to summarize.' }
  }

  const rules = getCommitMessageRules()
  const prompt = buildPrompt(diff.data, rules)

  try {
    const result = await Agent.prompt(prompt, {
      apiKey,
      model: { id: 'composer-2.5' },
      local: { cwd }
    })

    if (result.status === 'error') {
      return {
        ok: false,
        code: 2,
        stderr: 'Cursor agent run failed (no commit message returned).'
      }
    }

    const text = (result.result ?? '').trim()
    if (!text) {
      return { ok: false, code: 2, stderr: 'Cursor returned an empty response.' }
    }

    return { ok: true, data: parseCommitMessage(text) }
  } catch (err) {
    if (err instanceof CursorAgentError) {
      return {
        ok: false,
        code: 1,
        stderr: `Cursor SDK error: ${err.message}`
      }
    }
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, code: 1, stderr: msg }
  }
}

async function collectStagedDiff(cwd: string): Promise<Result<string>> {
  const res = await runGit(['diff', '--cached', '--no-color'], { cwd })
  if (!res.ok) return res
  let data = res.data
  if (data.length > MAX_DIFF_BYTES) {
    data = data.slice(0, MAX_DIFF_BYTES) + '\n…[diff truncated for length]'
  }
  return { ok: true, data }
}

function buildPrompt(diff: string, rules: string): string {
  return [
    'You are writing a Git commit message for the changes below.',
    '',
    'Formatting rules to follow:',
    rules.trim() || '(none)',
    '',
    'Output requirements:',
    '- Reply with ONLY the commit message text — no preamble, no markdown',
    '  fences, no commentary.',
    '- First line is the subject. If a body is appropriate, leave one blank',
    '  line after the subject and put the body underneath.',
    '',
    'Staged diff:',
    '```diff',
    diff,
    '```'
  ].join('\n')
}

/**
 * Split the model's reply into `{ subject, body }`.  Tolerant of:
 *  • markdown fences the model insists on adding ("```\nfeat: ...\n```")
 *  • leading/trailing whitespace
 *  • CRLF line endings
 */
export function parseCommitMessage(raw: string): GeneratedCommitMessage {
  let text = raw.replace(/\r\n/g, '\n').trim()

  // Strip an outer ``` fence if the model added one.
  const fence = /^```(?:\w*)?\n([\s\S]*?)\n```\s*$/
  const m = fence.exec(text)
  if (m) text = m[1].trim()

  if (!text) return { subject: '', body: '' }

  const lines = text.split('\n')
  const subject = (lines[0] ?? '').trim()
  // Drop the blank line(s) immediately after the subject.
  let i = 1
  while (i < lines.length && lines[i].trim() === '') i++
  const body = lines.slice(i).join('\n').trim()
  return { subject, body }
}
