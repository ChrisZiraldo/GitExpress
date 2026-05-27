#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Smoke test for the Git Express metro layout.
 *
 * Creates a throwaway repo in /tmp, seeds it with a few branches and commits,
 * runs `git log` the same way the renderer does, and computes a metro layout.
 * Verifies the layout has the expected number of stations, lanes, and that
 * HEAD / tags are detected.
 *
 * Run with: node scripts/smoke-metro.mjs
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execSync, execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const SEP = '\x1f'
const REC = '\x1e'

// ── 1. Build a throwaway repo ──────────────────────────────────────────────
const REPO = mkdtempSync(`${tmpdir()}/gitexpress-smoke-`)
const git = (cmd) =>
  execSync(`git ${cmd}`, { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] }).toString()

function setup() {
  git('init -q -b main')
  git('config user.email "smoke@gitexpress.dev"')
  git('config user.name "Smoke"')
  git('config commit.gpgsign false')
  execSync('echo a > a.txt', { cwd: REPO })
  git('add .')
  git('commit -qm "init"')
  execSync('echo b > b.txt', { cwd: REPO })
  git('add .')
  git('commit -qm "add b"')
  git('checkout -qb feature/auth')
  execSync('echo auth > auth.txt', { cwd: REPO })
  git('add .')
  git('commit -qm "auth: login"')
  git('checkout -q main')
  git('checkout -qb feature/dash')
  execSync('echo dash > dash.txt', { cwd: REPO })
  git('add .')
  git('commit -qm "dash: card"')
  git('checkout -q main')
  git('merge --no-ff -q feature/dash -m "merge feature/dash"')
  git('tag v0.1')
}

function teardown() {
  rmSync(REPO, { recursive: true, force: true })
}

// ── 2. Read graph + refs ───────────────────────────────────────────────────
function readGraph() {
  const fmt = ['%H', '%h', '%P', '%an', '%ae', '%aI', '%ar', '%s'].join(SEP) + REC
  const raw = execFileSync(
    'git',
    [
      'log',
      '--all',
      '--branches',
      '--remotes',
      '--date-order',
      '--max-count=500',
      `--pretty=format:${fmt}`,
      '--no-color'
    ],
    { cwd: REPO }
  ).toString()
  const out = []
  for (const rec of raw.split(REC)) {
    const t = rec.trim()
    if (!t) continue
    const parts = t.split(SEP)
    if (parts.length < 8) continue
    const [hash, shortHash, parentStr, author, email, date, relativeDate, subject] = parts
    const parents = parentStr.trim() ? parentStr.trim().split(/\s+/) : []
    out.push({ hash, shortHash, parents, author, email, date, relativeDate, subject })
  }
  return out
}

function readRefs() {
  const local = []
  const tags = []
  const lines = execFileSync(
    'git',
    ['for-each-ref', '--format=%(refname)%01%(objectname)%01%(upstream:short)%01%(HEAD)'],
    { cwd: REPO }
  )
    .toString()
    .split('\n')
    .filter(Boolean)
  for (const line of lines) {
    const [fullName, hash, upstream, head] = line.split('\x01')
    if (fullName.startsWith('refs/heads/')) {
      const name = fullName.replace(/^refs\/heads\//, '')
      local.push({ name, fullName, hash, upstream: upstream || undefined, current: head === '*' })
    } else if (fullName.startsWith('refs/tags/')) {
      const name = fullName.replace(/^refs\/tags\//, '')
      tags.push({ name, fullName, hash })
    }
  }
  return { local, remote: [], tags }
}

// ── 3. Run computeMetroLayout (transpile via esbuild) ──────────────────────
async function loadLayout() {
  const esbuild = await import(pathToFileURL(join(ROOT, 'node_modules/esbuild/lib/main.js')).href).catch(
    () => null
  )
  if (esbuild) {
    const res = await esbuild.build({
      entryPoints: [join(ROOT, 'src/renderer/components/metro/computeMetroLayout.ts')],
      bundle: true,
      write: false,
      platform: 'node',
      format: 'esm',
      external: [],
      tsconfig: join(ROOT, 'tsconfig.web.json'),
      alias: { '@shared/types': join(ROOT, 'src/shared/types.ts') }
    })
    const code = res.outputFiles[0].text
    const tmpFile = join(REPO, '__layout.mjs')
    writeFileSync(tmpFile, code)
    return await import(pathToFileURL(tmpFile).href)
  }
  // Fallback: dynamic import directly (Node 22+ supports TS via --experimental-strip-types)
  return await import(
    pathToFileURL(join(ROOT, 'src/renderer/components/metro/computeMetroLayout.ts')).href
  )
}

async function main() {
  setup()
  try {
    const graph = readGraph()
    const refs = readRefs()
    console.log(`✓ Seeded repo at ${REPO}`)
    console.log(`  graph: ${graph.length} commits`)
    console.log(`  refs:  ${refs.local.length} local, ${refs.tags.length} tags`)

    const layoutMod = await loadLayout()
    const layout = layoutMod.computeMetroLayout(graph, refs, 'main')

    console.log(`✓ Metro layout computed`)
    console.log(`  stations:   ${layout.stations.length}`)
    console.log(`  lane labels:${layout.laneLabels.length}`)
    console.log(`  width:      ${layout.width}px`)
    console.log(`  height:     ${layout.height}px`)

    const head = layout.stations.find((s) => s.isHead)
    const tag = layout.stations.find((s) => s.hasTag)
    const interchange = layout.stations.find((s) => s.kind === 'interchange')
    console.log(`  head:       ${head ? head.shortHash + ' "' + head.subject + '"' : '— none —'}`)
    console.log(`  tag:        ${tag ? tag.shortHash + ' "' + tag.subject + '"' : '— none —'}`)
    console.log(
      `  merge:      ${interchange ? interchange.shortHash + ' "' + interchange.subject + '"' : '— none —'}`
    )

    const errors = []
    if (layout.stations.length !== graph.length)
      errors.push(`station count mismatch (got ${layout.stations.length}, want ${graph.length})`)
    if (!head) errors.push('expected a HEAD station')
    if (!tag) errors.push('expected a tag station')
    if (!interchange) errors.push('expected an interchange station for the merge commit')
    if (layout.laneLabels.length < 2)
      errors.push(`expected ≥2 lane labels (got ${layout.laneLabels.length})`)

    if (errors.length) {
      console.error('\n✗ Smoke test failed:')
      for (const e of errors) console.error(`  - ${e}`)
      process.exit(1)
    }
    console.log('\n✓ All metro layout assertions passed.')
  } finally {
    teardown()
  }
}

main().catch((err) => {
  teardown()
  console.error(err)
  process.exit(1)
})
