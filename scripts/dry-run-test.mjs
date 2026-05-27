/**
 * Dry-run validation script.
 *
 * Runs with SIMPLEGIT_DRY_RUN=1 so no real git commands are executed.
 * Exercises every new function added in the GitKraken Core Features plan
 * and asserts the expected command appears in dry-run.log.
 *
 * Usage:
 *   SIMPLEGIT_DRY_RUN=1 node --experimental-vm-modules \
 *     --loader ts-node/esm scripts/dry-run-test.mjs
 *
 * Or just: node scripts/dry-run-test.mjs  (uses tsx to compile on the fly)
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../')
const LOG = join(ROOT, 'dry-run.log')
const FAKE_REPO = ROOT  // use repo root as fake cwd — read-only cmds still work

// ── helpers ─────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function clearLog() {
  if (existsSync(LOG)) unlinkSync(LOG)
}

function readLog() {
  return existsSync(LOG) ? readFileSync(LOG, 'utf8') : ''
}

function assert(description, condition, detail = '') {
  if (condition) {
    console.log(`  ✓  ${description}`)
    passed++
  } else {
    console.error(`  ✗  ${description}${detail ? `\n       ${detail}` : ''}`)
    failed++
  }
}

function assertInLog(description, pattern) {
  const log = readLog()
  const ok = typeof pattern === 'string' ? log.includes(pattern) : pattern.test(log)
  assert(description, ok, ok ? '' : `Pattern not found in log.\nLog tail:\n${log.slice(-400)}`)
}

// ── run a single test via tsx (compiles TS on the fly) ──────────────────────

function runGitFn(tsSnippet) {
  // Write a tiny temp script that calls the function and exits
  const tmpFile = join(ROOT, '.dry-run-tmp.ts')
  writeFileSync(tmpFile, `
import '${join(ROOT, 'src/main/git/runner.ts').replace(/\\/g, '/')}'
${tsSnippet}
`)
  const result = spawnSync(
    'npx', ['tsx', tmpFile],
    {
      cwd: ROOT,
      env: { ...process.env, SIMPLEGIT_DRY_RUN: '1', SIMPLEGIT_DRY_RUN_LOG: LOG },
      encoding: 'utf8'
    }
  )
  if (result.error) throw result.error
  return result
}

function run(label, imports, call) {
  const src = `
${imports}
void (async () => {
  ${call}
})()
`
  const tmpFile = join(ROOT, '.dry-run-tmp.ts')
  writeFileSync(tmpFile, src, 'utf8')
  const result = spawnSync(
    'npx', ['tsx', tmpFile],
    {
      cwd: ROOT,
      env: { ...process.env, SIMPLEGIT_DRY_RUN: '1', SIMPLEGIT_DRY_RUN_LOG: LOG },
      encoding: 'utf8',
      timeout: 15000
    }
  )
  if (result.status !== 0) {
    console.error(`  [exec error] ${label}\n${result.stderr}`)
  }
  // Clean up
  try { unlinkSync(tmpFile) } catch { /* ignore */ }
}

// ── Tests ────────────────────────────────────────────────────────────────────

console.log('\n=== SimpleGit Dry-Run Validation ===\n')

// -- A. Tags ------------------------------------------------------------------
console.log('A. Tags')
clearLog()
run('createTag lightweight',
  `import { createTag } from '${ROOT}/src/main/git/tag.ts'`,
  `await createTag('${FAKE_REPO}', 'v1.0.0', 'abc1234')`
)
assertInLog('createTag (lightweight) emits: git tag v1.0.0 abc1234', 'git tag v1.0.0 abc1234')

clearLog()
run('createTag annotated',
  `import { createTag } from '${ROOT}/src/main/git/tag.ts'`,
  `await createTag('${FAKE_REPO}', 'v2.0.0', 'def5678', 'Release notes')`
)
assertInLog('createTag (annotated) emits: git tag -a v2.0.0 def5678 -m "Release notes"',
  /git tag -a v2\.0\.0 def5678 -m "Release notes"/)

clearLog()
run('deleteTag',
  `import { deleteTag } from '${ROOT}/src/main/git/tag.ts'`,
  `await deleteTag('${FAKE_REPO}', 'v1.0.0')`
)
assertInLog('deleteTag emits: git tag -d v1.0.0', 'git tag -d v1.0.0')

// -- B. Commit ops ------------------------------------------------------------
console.log('\nB. Commit operations')
clearLog()
run('cherryPick',
  `import { cherryPick } from '${ROOT}/src/main/git/commit-ops.ts'`,
  `await cherryPick('${FAKE_REPO}', 'abc1234')`
)
assertInLog('cherryPick emits: git cherry-pick abc1234', 'git cherry-pick abc1234')

clearLog()
run('revert',
  `import { revert } from '${ROOT}/src/main/git/commit-ops.ts'`,
  `await revert('${FAKE_REPO}', 'abc1234')`
)
assertInLog('revert emits: git revert --no-edit abc1234', 'git revert --no-edit abc1234')

clearLog()
run('resetToCommit soft',
  `import { resetToCommit } from '${ROOT}/src/main/git/commit-ops.ts'`,
  `await resetToCommit('${FAKE_REPO}', 'abc1234', 'soft')`
)
assertInLog('resetToCommit (soft) emits: git reset --soft abc1234', 'git reset --soft abc1234')

clearLog()
run('resetToCommit mixed',
  `import { resetToCommit } from '${ROOT}/src/main/git/commit-ops.ts'`,
  `await resetToCommit('${FAKE_REPO}', 'abc1234', 'mixed')`
)
assertInLog('resetToCommit (mixed) emits: git reset --mixed abc1234', 'git reset --mixed abc1234')

clearLog()
run('resetToCommit hard',
  `import { resetToCommit } from '${ROOT}/src/main/git/commit-ops.ts'`,
  `await resetToCommit('${FAKE_REPO}', 'abc1234', 'hard')`
)
assertInLog('resetToCommit (hard) emits: git reset --hard abc1234', 'git reset --hard abc1234')

// -- C. graphLog email field --------------------------------------------------
console.log('\nC. graphLog includes %ae in format')
// We can verify the format string directly by reading the source
const logSrc = readFileSync(join(ROOT, 'src/main/git/log.ts'), 'utf8')
assert(
  'graphLog format string includes %ae',
  logSrc.includes("'%H', '%h', '%P', '%an', '%ae', '%aI', '%ar', '%s'")
)
assert(
  'graphLog parser expects 8 fields (parts.length < 8)',
  logSrc.includes('parts.length < 8')
)
assert(
  'graphLog destructures email field',
  logSrc.includes('author, email, date')
)

// -- D. Dry-run pass-through: read-only cmds are NOT intercepted -------------
console.log('\nD. Read-only commands pass through (not logged)')
clearLog()
// git log is read-only — runner should execute it, not log it
run('git log passes through',
  `import { runGit } from '${ROOT}/src/main/git/runner.ts'`,
  `await runGit(['log', '--oneline', '-1'], { cwd: '${FAKE_REPO}' })`
)
const logAfterReadOnly = readLog()
assert(
  'git log is NOT written to dry-run log',
  !logAfterReadOnly.includes('git log')
)

// -- E. Write commands ARE intercepted (e.g. git push) ----------------------
console.log('\nE. Write commands are intercepted')
clearLog()
run('git push is intercepted',
  `import { runGitVoid } from '${ROOT}/src/main/git/runner.ts'`,
  `await runGitVoid(['push', 'origin', 'main'], { cwd: '${FAKE_REPO}' })`
)
assertInLog('git push origin main is logged', 'git push origin main')

// -- F. Input validation guards work ----------------------------------------
console.log('\nF. Input validation — empty inputs return error, not logged')
clearLog()
run('createTag empty name returns error',
  `import { createTag } from '${ROOT}/src/main/git/tag.ts'`,
  `
  const res = await createTag('${FAKE_REPO}', '', 'abc1234')
  if (!res.ok) process.stdout.write('GUARD_OK')
  `
)
// Nothing should be in the log because the guard returned early
assert(
  'empty tag name: nothing logged',
  !readLog().includes('git tag')
)

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.error('\nFinal dry-run.log contents:')
  console.error(readLog())
  process.exit(1)
} else {
  console.log('\nAll checks passed ✓')
}
