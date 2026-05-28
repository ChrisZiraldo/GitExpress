#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Smoke test for hunk-level *and* line-level staging / discarding.
 *
 * Builds a throwaway repo in /tmp, edits a tracked file with two non-adjacent
 * hunks, parses the diff with `parseDiffHunks` + `parseDiff`, then verifies:
 *
 *   ── Hunk-level round trip ──────────────────────────────────────────
 *   • staging only the second hunk leaves the first hunk unstaged.
 *   • discarding the first hunk restores those lines in the working tree
 *     while leaving the second hunk's staged change intact.
 *
 *   ── Line-level round trip ──────────────────────────────────────────
 *   • a multi-line edit ("two replaced lines + one added line") can be
 *     staged with only the middle add line included via
 *     `buildLineSubsetPatch`, and the unstaged diff afterward holds
 *     exactly the lines we did *not* select.
 *
 * Run with: node scripts/smoke-hunk.mjs
 */
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execSync, spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const REPO = mkdtempSync(`${tmpdir()}/gitexpress-hunk-`)
const git = (cmd, opts = {}) =>
  execSync(`git ${cmd}`, { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'], ...opts }).toString()

function applyPatch(args, patch) {
  const r = spawnSync('git', ['apply', ...args, '-'], { cwd: REPO, input: patch, encoding: 'utf8' })
  if (r.status !== 0) {
    console.error('git apply failed:', r.stderr)
    console.error('--- patch ---\n' + patch)
    process.exit(1)
  }
}

function setupRepo() {
  git('init -q -b main')
  git('config user.email "smoke@simplegit.dev"')
  git('config user.name "Smoke"')
  git('config commit.gpgsign false')
  const orig = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n') + '\n'
  writeFileSync(join(REPO, 'a.txt'), orig)
  git('add .')
  git('commit -qm "init"')
  return orig
}

function fail(msg) {
  console.error('FAIL:', msg)
  rmSync(REPO, { recursive: true, force: true })
  process.exit(1)
}

async function run() {
  const orig = setupRepo()

  // Compile the parser straight from src so the script reflects current code.
  const tsc = spawnSync(
    'npx',
    [
      'tsc',
      '--target',
      'es2022',
      '--module',
      'esnext',
      '--moduleResolution',
      'bundler',
      '--outDir',
      REPO,
      'src/renderer/utils/diffHunks.ts'
    ],
    { cwd: ROOT, stdio: 'inherit' }
  )
  if (tsc.status !== 0) fail('tsc compile of diffHunks.ts failed')
  writeFileSync(join(REPO, 'package.json'), '{"type":"module"}')

  const mod = await import(pathToFileURL(join(REPO, 'diffHunks.js')).href)
  const { parseDiffHunks, parseDiff, buildLineSubsetPatch } = mod

  // ── PART 1: hunk-level round trip ────────────────────────────────────
  // Touch line 3 (top hunk) and line 25 (bottom hunk).
  {
    const lines = orig.split('\n')
    lines[2] = 'line 3 CHANGED'
    lines[24] = 'line 25 CHANGED'
    writeFileSync(join(REPO, 'a.txt'), lines.join('\n'))
  }

  const diff1 = git('diff --no-color -- a.txt')
  const hunks = parseDiffHunks(diff1)
  if (hunks.length !== 2) fail(`expected 2 hunks, got ${hunks.length}\n${diff1}`)
  if (hunks[0].filePath !== 'a.txt') fail(`expected filePath a.txt, got ${hunks[0].filePath}`)

  applyPatch(['--cached', '--recount', '--whitespace=nowarn'], hunks[1].patch)

  let cached = git('diff --cached --no-color')
  if (!cached.includes('line 25 CHANGED')) fail(`staged diff missing hunk 2:\n${cached}`)
  if (cached.includes('line 3 CHANGED')) fail(`staged diff includes hunk 1 (shouldn't):\n${cached}`)

  const unstaged = git('diff --no-color')
  const unstagedHunks = parseDiffHunks(unstaged)
  if (unstagedHunks.length !== 1) fail(`expected 1 unstaged hunk, got ${unstagedHunks.length}`)
  if (!unstagedHunks[0].hunkBody.includes('line 3 CHANGED')) {
    fail(`unstaged hunk 1 missing change:\n${unstagedHunks[0].hunkBody}`)
  }

  applyPatch(['--reverse', '--recount', '--whitespace=nowarn'], unstagedHunks[0].patch)

  const final1 = readFileSync(join(REPO, 'a.txt'), 'utf8')
  if (final1.includes('line 3 CHANGED')) fail(`hunk discard didn't restore line 3:\n${final1}`)
  if (!final1.includes('line 25 CHANGED')) fail(`hunk discard erased staged line 25:\n${final1}`)
  if (!git('diff --cached --no-color').includes('line 25 CHANGED')) {
    fail(`staged hunk 2 was lost during hunk-level discard`)
  }

  console.log('OK: hunk-level stage + reverse-apply round trip.')

  // ── Reset to a clean state and exercise line-level ───────────────────
  git('reset --hard -q HEAD')

  // Touch lines 10, 11, 12 (three adjacent changes that share one hunk).
  // line 10: replaced ("-line 10 / +line 10 X")
  // line 11: replaced ("-line 11 / +line 11 Y")
  // line 12: replaced ("-line 12 / +line 12 Z")
  {
    const lines = orig.split('\n')
    lines[9] = 'line 10 X'
    lines[10] = 'line 11 Y'
    lines[11] = 'line 12 Z'
    writeFileSync(join(REPO, 'a.txt'), lines.join('\n'))
  }

  const diff2 = git('diff --no-color -- a.txt')
  const files = parseDiff(diff2)
  if (files.length !== 1) fail(`expected 1 file, got ${files.length}`)
  if (files[0].hunks.length !== 1) fail(`expected 1 hunk, got ${files[0].hunks.length}`)

  // Find the indices of the "-line 11" and "+line 11 Y" entries in the hunk.
  const hunk = files[0].hunks[0]
  let delIdx = -1
  let addIdx = -1
  for (let i = 0; i < hunk.lines.length; i++) {
    const ln = hunk.lines[i]
    if (ln.kind === 'del' && ln.content === 'line 11') delIdx = i
    if (ln.kind === 'add' && ln.content === 'line 11 Y') addIdx = i
  }
  if (delIdx < 0 || addIdx < 0) fail(`couldn't locate line-11 change in hunk:\n${diff2}`)

  // Build a subset patch staging ONLY the line-11 replacement.
  const sel = new Set([`0:${delIdx}`, `0:${addIdx}`])
  const { patch, changeCount } = buildLineSubsetPatch(files[0], sel, 'forward')
  if (changeCount !== 2) fail(`expected 2 change lines in subset, got ${changeCount}`)
  if (!patch) fail('subset patch was empty')

  applyPatch(['--cached', '--recount', '--whitespace=nowarn'], patch)

  // Index ↔ HEAD diff should now contain JUST the line-11 swap.
  cached = git('diff --cached --no-color')
  if (!cached.includes('line 11 Y')) fail(`staged diff missing line 11 swap:\n${cached}`)
  if (cached.includes('line 10 X') || cached.includes('line 12 Z')) {
    fail(`staged diff unexpectedly carries adjacent changes:\n${cached}`)
  }

  // Working tree ↔ index should still hold the line-10 and line-12 swaps,
  // but line 11 Y should appear ONLY as context (present in both sides) —
  // never as a `+` or `-` line, since we already staged it.
  const unstagedAfter = git('diff --no-color')
  if (!/^\+line 10 X$/m.test(unstagedAfter)) fail(`unstaged missing +line 10 X`)
  if (!/^\+line 12 Z$/m.test(unstagedAfter)) fail(`unstaged missing +line 12 Z`)
  if (/^[+-]line 11 Y$/m.test(unstagedAfter)) {
    fail(`unstaged unexpectedly includes line-11 swap as a change:\n${unstagedAfter}`)
  }

  // Now exercise the reverse path: discard the remaining line-10 swap in the
  // working tree.  We rebuild the structured diff and select just those lines.
  const filesAfter = parseDiff(unstagedAfter)
  const hunkAfter = filesAfter[0].hunks[0]
  let delIdx2 = -1
  let addIdx2 = -1
  for (let i = 0; i < hunkAfter.lines.length; i++) {
    const ln = hunkAfter.lines[i]
    if (ln.kind === 'del' && ln.content === 'line 10') delIdx2 = i
    if (ln.kind === 'add' && ln.content === 'line 10 X') addIdx2 = i
  }
  if (delIdx2 < 0 || addIdx2 < 0) fail(`couldn't find line-10 swap in remaining hunk`)
  const sel2 = new Set([`0:${delIdx2}`, `0:${addIdx2}`])
  // 'reverse' mode: the patch's post-image must match the worktree (the
  // input to `git apply --reverse`), so unselected `+` lines stay as context.
  const { patch: discardPatch } = buildLineSubsetPatch(filesAfter[0], sel2, 'reverse')
  applyPatch(['--reverse', '--recount', '--whitespace=nowarn'], discardPatch)

  const final2 = readFileSync(join(REPO, 'a.txt'), 'utf8')
  if (final2.includes('line 10 X')) fail(`line-level discard didn't restore line 10:\n${final2}`)
  if (!final2.includes('line 12 Z')) fail(`line-level discard erased line 12:\n${final2}`)
  if (!final2.includes('line 11 Y')) fail(`line-level discard lost staged line 11:\n${final2}`)

  console.log('OK: line-level subset patch (stage + discard) round trip.')

  rmSync(REPO, { recursive: true, force: true })
}

run().catch((err) => {
  console.error(err)
  rmSync(REPO, { recursive: true, force: true })
  process.exit(1)
})
