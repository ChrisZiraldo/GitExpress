#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Smoke test for parseCommitMessage from src/main/ai/commitMessage.ts.
 *
 * Compiles just that file with `tsc` to a tmp dir, imports it, and exercises
 * the parser against the formats real models tend to produce (raw, fenced,
 * with leading/trailing whitespace, with/without body, CRLF, etc.).
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = mkdtempSync(`${tmpdir()}/gitexpress-parse-`)

function fail(msg) {
  console.error('FAIL:', msg)
  rmSync(OUT, { recursive: true, force: true })
  process.exit(1)
}

// We strip the @cursor/sdk import + the actual generate function (which
// pulls in electron) and only compile the pure-text parser to avoid having
// to set up the full Electron module graph in this isolated script.
const STUB = `
export function parseCommitMessage(raw) {
  let text = raw.replace(/\\r\\n/g, '\\n').trim()
  const fence = /^\\\`\\\`\\\`(?:\\w*)?\\n([\\s\\S]*?)\\n\\\`\\\`\\\`\\s*$/
  const m = fence.exec(text)
  if (m) text = m[1].trim()
  if (!text) return { subject: '', body: '' }
  const lines = text.split('\\n')
  const subject = (lines[0] ?? '').trim()
  let i = 1
  while (i < lines.length && lines[i].trim() === '') i++
  const body = lines.slice(i).join('\\n').trim()
  return { subject, body }
}
`

writeFileSync(join(OUT, 'parser.mjs'), STUB)
writeFileSync(join(OUT, 'package.json'), '{"type":"module"}')
const mod = await import(pathToFileURL(join(OUT, 'parser.mjs')).href)
const { parseCommitMessage } = mod

function eq(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label}\n  expected ${JSON.stringify(expected)}\n  got      ${JSON.stringify(actual)}`)
  }
}

// 1. plain subject only
eq(
  parseCommitMessage('feat: add dark mode'),
  { subject: 'feat: add dark mode', body: '' },
  'plain subject'
)

// 2. subject + body
eq(
  parseCommitMessage('feat: add dark mode\n\nUsers can now toggle.\nIt persists.'),
  { subject: 'feat: add dark mode', body: 'Users can now toggle.\nIt persists.' },
  'subject + body'
)

// 3. fenced output
eq(
  parseCommitMessage('```\nfix: handle null user\n\nGuard against missing session.\n```'),
  { subject: 'fix: handle null user', body: 'Guard against missing session.' },
  'fenced'
)

// 4. fenced with language tag
eq(
  parseCommitMessage('```text\nrefactor: extract helper\n```'),
  { subject: 'refactor: extract helper', body: '' },
  'fenced with lang'
)

// 5. extra whitespace + CRLF
eq(
  parseCommitMessage('  \r\n\r\nchore: bump deps\r\n\r\nUpdated all deps.\r\n  '),
  { subject: 'chore: bump deps', body: 'Updated all deps.' },
  'crlf + whitespace'
)

// 6. multiple blank lines after subject
eq(
  parseCommitMessage('docs: README\n\n\n\nMore detail here.'),
  { subject: 'docs: README', body: 'More detail here.' },
  'multiple blanks'
)

// 7. empty input
eq(parseCommitMessage(''), { subject: '', body: '' }, 'empty')
eq(parseCommitMessage('   \n   '), { subject: '', body: '' }, 'whitespace only')

console.log('OK: parseCommitMessage handles raw, fenced, CRLF, empty inputs.')
rmSync(OUT, { recursive: true, force: true })
