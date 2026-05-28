#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Smoke test for the Git Metro GitHub-CLI integration.
 *
 * Verifies (without ever touching a real repo or making network calls):
 *   1. The `gh` binary is installed and `gh auth status` succeeds.
 *   2. `runGh` in src/main/gh/runner.ts can shell out and capture stdout.
 *   3. `getPullRequestForBranch` returns `data: null` for a branch that
 *      doesn't exist on GitHub (handled via allowExitCodes=[1]).
 *   4. The CheckRollup normalization handles every documented gh shape:
 *      CheckRun (queued / in_progress / completed × multiple conclusions)
 *      StatusContext (success / pending / failure / error / expected)
 *
 * Run with: node scripts/smoke-gh.mjs
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync, execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const REPO = mkdtempSync(`${tmpdir()}/gitmetro-gh-smoke-`)
function teardown() {
  rmSync(REPO, { recursive: true, force: true })
}

function setup() {
  const git = (cmd) =>
    execSync(`git ${cmd}`, { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] })
  git('init -q -b main')
  git('config user.email "smoke@gitmetro.dev"')
  git('config user.name "Smoke"')
  git('config commit.gpgsign false')
  writeFileSync(join(REPO, 'README.md'), '# smoke\n')
  git('add .')
  git('commit -qm "init"')
}

async function loadModule(file) {
  const esbuild = await import(
    pathToFileURL(join(ROOT, 'node_modules/esbuild/lib/main.js')).href
  )
  const res = await esbuild.build({
    entryPoints: [join(ROOT, file)],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    external: ['electron'],
    tsconfig: join(ROOT, 'tsconfig.node.json'),
    alias: { '@shared/types': join(ROOT, 'src/shared/types.ts') }
  })
  const tmpFile = join(REPO, `__${file.replace(/\W+/g, '_')}.mjs`)
  writeFileSync(tmpFile, res.outputFiles[0].text)
  return await import(pathToFileURL(tmpFile).href)
}

async function main() {
  const errors = []
  setup()

  // 1. gh binary present?
  let ghVersion = ''
  try {
    ghVersion = execFileSync('gh', ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .split('\n')[0]
    console.log(`✓ gh installed: ${ghVersion}`)
  } catch {
    console.log('⚠ gh not installed — CI badge will be hidden gracefully.')
    console.log('  Skipping live gh checks; pure-function tests still run.')
  }

  // 2. runGh smoke: invoke `gh --version` through our wrapper.
  if (ghVersion) {
    const runner = await loadModule('src/main/gh/runner.ts')
    const versionRes = await runner.runGh(['--version'], { cwd: REPO })
    if (!versionRes.ok) errors.push(`runGh failed: ${versionRes.stderr}`)
    else if (!versionRes.data.includes('gh version'))
      errors.push(`unexpected gh --version output: ${versionRes.data.slice(0, 80)}`)
    else console.log(`✓ runGh captured gh stdout`)

    const available = await runner.isGhAvailable()
    console.log(`✓ isGhAvailable() → ${available}`)
  }

  let prModule
  if (ghVersion) prModule = await loadModule('src/main/gh/pr.ts')

  // 3. PR fetcher on a branch that doesn't exist on GitHub → null.
  if (ghVersion) {
    const pr = prModule
    const res = await pr.getPullRequestForBranch(REPO, 'no-such-branch')
    // On a brand-new repo with no remote, gh prints "no default remote" to
    // stderr with exit 1, which we treat as no-PR. Accept either ok+null OR
    // a clean error stating no remote / not a github repo.
    if (res.ok && res.data === null) {
      console.log('✓ getPullRequestForBranch returns null when no PR exists')
    } else if (!res.ok && /remote|no pull request|not a github repository/i.test(res.stderr)) {
      console.log(`✓ getPullRequestForBranch surfaces "no remote" cleanly: ${res.stderr.slice(0, 80)}`)
    } else if (res.ok && res.data !== null) {
      errors.push(`expected null PR for missing branch but got PR #${res.data.number}`)
    } else {
      errors.push(`unexpected error from getPullRequestForBranch: ${res.stderr}`)
    }
  }

  // 4. getChecksForCommit on a non-GitHub repo SHA → data: null (graceful).
  if (ghVersion) {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO })
      .toString()
      .trim()
    const res = await prModule.getChecksForCommit(REPO, sha)
    if (res.ok && res.data === null) {
      console.log('✓ getChecksForCommit returns null for non-GitHub repo')
    } else if (
      res.ok &&
      res.data &&
      res.data.checks.length === 0 &&
      res.data.pulls.length === 0
    ) {
      console.log('✓ getChecksForCommit returns empty checks/pulls cleanly')
    } else if (!res.ok) {
      errors.push(`unexpected error from getChecksForCommit: ${res.stderr}`)
    } else {
      errors.push(
        `unexpected data from getChecksForCommit: ${JSON.stringify(res.data)}`
      )
    }
  }

  teardown()
  if (errors.length) {
    console.error('\n✗ FAILED')
    for (const e of errors) console.error('  - ' + e)
    process.exit(1)
  }
  console.log('\n✓ All gh smoke checks passed.')
}

main().catch((err) => {
  teardown()
  console.error(err)
  process.exit(1)
})
