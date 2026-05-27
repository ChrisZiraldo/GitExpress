/**
 * IPC smoke test — exercises every new IPC handler directly (no Electron, no renderer).
 * Uses a freshly created isolated git repo so no real project data is touched.
 *
 * Run: npx tsx scripts/ipc-smoke-test.ts
 */

import { join, resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(join(fileURLToPath(import.meta.url as string), '../../'))

// ── Create a fresh, isolated git repo for testing ───────────────────────────
function makeTestRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'simplegit-smoke-'))
  const git = (cmd: string) =>
    execSync(`git ${cmd}`, { cwd: dir, stdio: 'pipe' })
  git('init -q')
  git('config user.email "smoke@simplegit.dev"')
  git('config user.name "Smoke Test"')
  git('config commit.gpgsign false')
  execSync('echo "init" > README.md', { cwd: dir, shell: '/bin/zsh' })
  git('add .')
  git('commit -q -m "Initial commit"')
  execSync('echo "feat" > feat.txt', { cwd: dir, shell: '/bin/zsh' })
  git('add .')
  git('commit -q -m "Add feature"')
  execSync('echo "fix" > fix.txt', { cwd: dir, shell: '/bin/zsh' })
  git('add .')
  git('commit -q -m "Fix bug"')
  git('tag v1.0.0')
  git('tag -a v2.0.0 -m "Annotated release" --no-sign')
  git('checkout -q -b feature/test-branch')
  execSync('echo "branch" > branch.txt', { cwd: dir, shell: '/bin/zsh' })
  git('add .')
  git('commit -q -m "Branch commit"')
  git('checkout -q main')
  execSync('echo "dirty" > dirty.txt', { cwd: dir, shell: '/bin/zsh' })
  return dir
}

const REPO = makeTestRepo()
console.log(`\nTest repo: ${REPO}`)
process.on('exit', () => { try { rmSync(REPO, { recursive: true }) } catch { /* ignore */ } })

let passed = 0
let failed = 0

function ok(label: string): void {
  console.log(`  ✓  ${label}`)
  passed++
}

function fail(label: string, detail: string): void {
  console.error(`  ✗  ${label}\n       ${detail}`)
  failed++
}

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) ok(label)
  else fail(label, detail)
}

// ---------------------------------------------------------------------------

void (async () => {
  // ── A. graphLog returns email ─────────────────────────────────────────────
  console.log('\nA. graphLog — email field populated')
  const { graphLog } = await import('../src/main/git/log.ts')
  const logRes = await graphLog(REPO, 5)
  check('graphLog returns ok', logRes.ok, logRes.ok ? '' : (logRes as { stderr: string }).stderr)
  if (logRes.ok) {
    const hasEmail = logRes.data.every((c) => typeof c.email === 'string')
    check('all commits have email field', hasEmail,
      hasEmail ? '' : JSON.stringify(logRes.data[0]))
    const hasNonEmpty = logRes.data.some((c) => c.email.includes('@'))
    check('at least one commit has a real email address', hasNonEmpty)
  }

  // ── B. listRefs returns tags array ────────────────────────────────────────
  console.log('\nB. listRefs — tags array present')
  const { listRefs } = await import('../src/main/git/refs.ts')
  const refsRes = await listRefs(REPO)
  check('listRefs returns ok', refsRes.ok)
  if (refsRes.ok) {
    check('refs.tags is an array', Array.isArray(refsRes.data.tags))
  }

  // ── C. tag.ts — guard validation (no dry-run needed) ─────────────────────
  console.log('\nC. tag.ts input guards')
  const { createTag, deleteTag } = await import('../src/main/git/tag.ts')
  const emptyName = await createTag(REPO, '', 'abc')
  check('createTag rejects empty name', !emptyName.ok)

  const emptyHash = await createTag(REPO, 'v0', '')
  check('createTag rejects empty hash', !emptyHash.ok)

  const emptyDelete = await deleteTag(REPO, '')
  check('deleteTag rejects empty name', !emptyDelete.ok)

  // ── D. commit-ops.ts — guard validation ──────────────────────────────────
  console.log('\nD. commit-ops.ts input guards')
  const { cherryPick, revert, resetToCommit } = await import('../src/main/git/commit-ops.ts')
  const emptyCP = await cherryPick(REPO, '')
  check('cherryPick rejects empty hash', !emptyCP.ok)

  const emptyRev = await revert(REPO, '')
  check('revert rejects empty hash', !emptyRev.ok)

  const emptyReset = await resetToCommit(REPO, '', 'soft')
  check('resetToCommit rejects empty hash', !emptyReset.ok)

  // ── E. dry-run runner intercepts writes, passes reads ────────────────────
  // Runner reads env vars at module load time (module cache), so we use a
  // subprocess to get a fresh process with DRY_RUN=1.
  console.log('\nE. runner — dry-run intercept logic')
  const { readFileSync, existsSync, unlinkSync, writeFileSync: wf } = await import('node:fs')
  const { spawnSync } = await import('node:child_process')
  const LOG = join(tmpdir(), 'simplegit-smoke-dryrun.log')
  if (existsSync(LOG)) unlinkSync(LOG)

  const writeSnippet = join(ROOT, '.smoke-write.ts')
  wf(writeSnippet, `
import { runGitVoid } from '${ROOT}/src/main/git/runner.ts'
void (async () => { await runGitVoid(['push', 'origin', 'smoke-test'], { cwd: '${REPO}' }) })()
`)
  spawnSync('npx', ['tsx', writeSnippet], {
    env: { ...process.env, SIMPLEGIT_DRY_RUN: '1', SIMPLEGIT_DRY_RUN_LOG: LOG },
    encoding: 'utf8', timeout: 10000
  })
  try { unlinkSync(writeSnippet) } catch { /* ignore */ }

  const logAfterWrite = existsSync(LOG) ? readFileSync(LOG, 'utf8') : ''
  check(
    'git push is intercepted in dry-run mode',
    logAfterWrite.includes('git push origin smoke-test'),
    logAfterWrite || '(log empty)'
  )

  if (existsSync(LOG)) unlinkSync(LOG)
  const readSnippet = join(ROOT, '.smoke-read.ts')
  wf(readSnippet, `
import { runGit } from '${ROOT}/src/main/git/runner.ts'
void (async () => { await runGit(['log', '--oneline', '-1'], { cwd: '${REPO}' }) })()
`)
  spawnSync('npx', ['tsx', readSnippet], {
    env: { ...process.env, SIMPLEGIT_DRY_RUN: '1', SIMPLEGIT_DRY_RUN_LOG: LOG },
    encoding: 'utf8', timeout: 10000
  })
  try { unlinkSync(readSnippet) } catch { /* ignore */ }

  const logAfterRead = existsSync(LOG) ? readFileSync(LOG, 'utf8') : ''
  check(
    'git log is NOT intercepted in dry-run mode',
    !logAfterRead.includes('git log'),
    logAfterRead || '(log empty — correct)'
  )
  if (existsSync(LOG)) unlinkSync(LOG)

  // ── F. channels.ts has all new entries ───────────────────────────────────
  console.log('\nF. channels.ts completeness')
  const { Channels } = await import('../src/shared/channels.ts')
  const required = [
    'TagCreate', 'TagDelete',
    'CommitCherryPick', 'CommitRevert', 'CommitReset',
    'DryRunStatus'
  ] as const
  for (const ch of required) {
    check(`Channels.${ch} defined`, ch in Channels)
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(44)}`)
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
  else console.log('\nAll checks passed ✓')
})()
