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
  git('config user.email "smoke@gitmetro.dev"')
  git('config user.name "Smoke"')
  git('config commit.gpgsign false')
  execSync('echo a > a.txt', { cwd: REPO })
  git('add .')
  git('commit -qm "init"')
  execSync('echo b > b.txt', { cwd: REPO })
  git('add .')
  git('commit -qm "add b"')

  // Feature branch (should land ABOVE main after remap)
  git('checkout -qb feature/auth')
  execSync('echo auth > auth.txt', { cwd: REPO })
  git('add .')
  git('commit -qm "auth: login"')
  git('checkout -q main')

  // Another feature branch — merged back into main
  git('checkout -qb feature/dash')
  execSync('echo dash > dash.txt', { cwd: REPO })
  git('add .')
  git('commit -qm "dash: card"')
  git('checkout -q main')
  git('merge --no-ff -q feature/dash -m "merge feature/dash"')

  // Hotfix branch (should land BELOW main after remap)
  git('checkout -qb hotfix/payment')
  execSync('echo hot > hot.txt', { cwd: REPO })
  git('add .')
  git('commit -qm "hotfix: payment"')
  git('checkout -q main')

  // Chore branch (should land BELOW main after remap)
  git('checkout -qb chore/deps')
  execSync('echo deps > deps.txt', { cwd: REPO })
  git('add .')
  git('commit -qm "chore: bump deps"')
  git('checkout -q main')

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
    console.log(`  cols:       ${layout.cols}`)
    console.log(`  lanes:      ${layout.laneCount}`)
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

    const newest = layout.stations.find((s) => s.row === 0)
    const oldest = layout.stations.find((s) => s.row === layout.cols - 1)
    console.log(`  newest x:   ${newest ? newest.x.toFixed(1) : '?'} (should be largest)`)
    console.log(`  oldest x:   ${oldest ? oldest.x.toFixed(1) : '?'} (should be smallest)`)
    console.log(`  terminals:  ${layout.terminals.length}`)
    console.log(`  headStation:${layout.headStation ? layout.headStation.shortHash : 'null'}`)
    console.log(`  tagStations:${layout.tagStations.length}`)

    // Lane positioning checks: main is in the middle, features above, hotfix/chore below.
    const lanesByName = new Map()
    for (const t of layout.terminals) lanesByName.set(t.name, t.lane)
    console.log(`  lane assignments:`)
    for (const [name, lane] of [...lanesByName.entries()].sort((a, b) => a[1] - b[1])) {
      console.log(`    lane ${lane}: ${name}`)
    }
    const mainLane = lanesByName.get('main')
    const authLane = lanesByName.get('feature/auth')
    const hotfixLane = lanesByName.get('hotfix/payment')
    const choreLane = lanesByName.get('chore/deps')

    const errors = []
    if (layout.stations.length !== graph.length)
      errors.push(`station count mismatch (got ${layout.stations.length}, want ${graph.length})`)
    if (!head) errors.push('expected a HEAD station')
    if (!tag) errors.push('expected a tag station')
    if (!interchange) errors.push('expected an interchange station for the merge commit')
    if (layout.laneLabels.length < 2)
      errors.push(`expected ≥2 lane labels (got ${layout.laneLabels.length})`)
    if (newest && oldest && newest.x <= oldest.x)
      errors.push(
        `horizontal direction wrong: newest x=${newest.x} should be > oldest x=${oldest.x}`
      )
    if (layout.terminals.length === 0)
      errors.push('expected at least one terminal badge')
    if (!layout.headStation) errors.push('expected a headStation')
    if (layout.tagStations.length === 0) errors.push('expected at least one tag station')

    if (mainLane === undefined) errors.push('expected main lane to be present')
    if (authLane !== undefined && mainLane !== undefined && authLane >= mainLane)
      errors.push(`feature/auth lane ${authLane} should be ABOVE main lane ${mainLane}`)
    if (hotfixLane !== undefined && mainLane !== undefined && hotfixLane <= mainLane)
      errors.push(`hotfix/payment lane ${hotfixLane} should be BELOW main lane ${mainLane}`)
    if (choreLane !== undefined && mainLane !== undefined && choreLane <= mainLane)
      errors.push(`chore/deps lane ${choreLane} should be BELOW main lane ${mainLane}`)

    // ── Filter assertions ──────────────────────────────────────────────────
    // Seeded repo: feature/auth, feature/dash, hotfix/payment, chore/deps —
    // none have upstreams, so all are "stale". feature/dash was merged into
    // main via merge --no-ff, so it's both stale AND merged.
    if (layout.hiddenLocalNames.size !== 0)
      errors.push(`default opts should hide nothing (got ${layout.hiddenLocalNames.size})`)

    const noStale = layoutMod.computeMetroLayout(graph, refs, 'main', {
      showStale: false
    })
    const noStaleHidden = [...noStale.hiddenLocalNames]
    console.log(`\n  showStale=false → hidden: ${noStaleHidden.join(', ') || '— none —'}`)
    for (const expected of ['feature/auth', 'hotfix/payment', 'chore/deps']) {
      if (!noStale.hiddenLocalNames.has(expected))
        errors.push(`showStale=false: expected to hide ${expected}`)
    }
    if (noStale.hiddenLocalNames.has('main'))
      errors.push('showStale=false: must NOT hide the trunk (main)')
    // Stations for hidden branches' unique commits should also be gone.
    const noStaleHashes = new Set(noStale.stations.map((s) => s.hash))
    if (noStaleHashes.size >= layout.stations.length)
      errors.push(
        `showStale=false: station count should drop (got ${noStaleHashes.size}, full ${layout.stations.length})`
      )

    const noMerged = layoutMod.computeMetroLayout(graph, refs, 'main', {
      showMerged: false
    })
    console.log(
      `  showMerged=false → hidden: ${[...noMerged.hiddenLocalNames].join(', ') || '— none —'}`
    )
    if (!noMerged.hiddenLocalNames.has('feature/dash'))
      errors.push('showMerged=false: expected to hide feature/dash (was merged into main)')
    if (noMerged.hiddenLocalNames.has('feature/auth'))
      errors.push('showMerged=false: must NOT hide feature/auth (never merged)')

    const both = layoutMod.computeMetroLayout(graph, refs, 'main', {
      showMerged: false,
      showStale: false
    })
    console.log(
      `  both off       → hidden: ${[...both.hiddenLocalNames].join(', ') || '— none —'}`
    )
    if (both.hiddenLocalNames.size < 4)
      errors.push(
        `both off: expected to hide ≥4 branches (got ${both.hiddenLocalNames.size})`
      )

    // Author filter: every commit in the seeded repo is by smoke@gitmetro.dev,
    // so filtering by that email should match all and filtering by anything
    // else should hide every non-trunk/non-current branch.
    const knownAuthor = layoutMod.computeMetroLayout(graph, refs, 'main', {
      author: 'smoke@gitmetro.dev'
    })
    if (knownAuthor.hiddenLocalNames.size !== 0)
      errors.push(
        `author=smoke@... should match all (got hidden=${[...knownAuthor.hiddenLocalNames].join(', ')})`
      )
    const wrongAuthor = layoutMod.computeMetroLayout(graph, refs, 'main', {
      author: 'someone-else@example.com'
    })
    console.log(
      `  author=other → hidden: ${[...wrongAuthor.hiddenLocalNames].join(', ') || '— none —'}`
    )
    if (wrongAuthor.hiddenLocalNames.has('main'))
      errors.push('author filter must NOT hide trunk (main)')
    if (wrongAuthor.hiddenLocalNames.size < 3)
      errors.push(
        `author=wrong: expected ≥3 branches hidden (got ${wrongAuthor.hiddenLocalNames.size})`
      )

    // Date filter: cutoff in the future hides everything; cutoff far in
    // the past keeps everything.
    const futureCutoff = layoutMod.computeMetroLayout(graph, refs, 'main', {
      dateCutoffMs: Date.now() + 24 * 60 * 60 * 1000
    })
    if (futureCutoff.hiddenLocalNames.size < 3)
      errors.push(
        `dateCutoff=future: expected ≥3 hidden (got ${futureCutoff.hiddenLocalNames.size})`
      )
    const pastCutoff = layoutMod.computeMetroLayout(graph, refs, 'main', {
      dateCutoffMs: 0
    })
    if (pastCutoff.hiddenLocalNames.size !== 0)
      errors.push(
        `dateCutoff=0: should hide nothing (got ${[...pastCutoff.hiddenLocalNames].join(', ')})`
      )

    // CI filter: build a synthetic ciByHash where feature/auth=passing,
    // hotfix/payment=failing, and the rest are intentionally missing
    // (which means "still loading" → kept on the map).
    const featAuth = refs.local.find((r) => r.name === 'feature/auth')
    const hotfix = refs.local.find((r) => r.name === 'hotfix/payment')
    const ciByHash = new Map()
    if (featAuth) ciByHash.set(featAuth.hash, 'success')
    if (hotfix) ciByHash.set(hotfix.hash, 'failure')
    const onlyFailing = layoutMod.computeMetroLayout(graph, refs, 'main', {
      ciFilter: 'failing',
      ciByHash
    })
    console.log(
      `  ci=failing   → hidden: ${[...onlyFailing.hiddenLocalNames].join(', ') || '— none —'}`
    )
    // feature/auth has known passing CI → must be hidden when filter=failing
    if (!onlyFailing.hiddenLocalNames.has('feature/auth'))
      errors.push('ci=failing: expected feature/auth (passing) to be hidden')
    // hotfix/payment has known failing CI → must NOT be hidden
    if (onlyFailing.hiddenLocalNames.has('hotfix/payment'))
      errors.push('ci=failing: hotfix/payment (failing) should be visible')
    // chore/deps has no entry → "loading" → kept visible
    if (onlyFailing.hiddenLocalNames.has('chore/deps'))
      errors.push('ci=failing: branches with unknown CI must NOT be hidden')

    // ── New layout fields (mockup-audit pass) ─────────────────────────────
    // The merge interchange should expose `mergeFromLane` so the renderer
    // can fill the dot in the merging branch's color.
    const mergeStation = layout.stations.find((s) =>
      s.subject.startsWith('merge feature/dash')
    )
    if (!mergeStation) {
      errors.push('expected a station for "merge feature/dash"')
    } else {
      // Note: in this seeded repo the merge IS the HEAD, so kind priority
      // gives us 'head'. mergeFromLane should still be populated for the
      // renderer regardless of kind.
      if (!['interchange', 'head'].includes(mergeStation.kind))
        errors.push(
          `merge station kind should be 'interchange' or 'head' (got '${mergeStation.kind}')`
        )
      if (mergeStation.mergeFromLane === null || mergeStation.mergeFromLane === undefined)
        errors.push(`merge station should expose mergeFromLane (got ${mergeStation.mergeFromLane})`)
      else if (mergeStation.mergeFromLane === mergeStation.lane)
        errors.push(
          `mergeFromLane (${mergeStation.mergeFromLane}) should differ from station lane (${mergeStation.lane})`
        )
    }

    // Non-merge commits should have mergeFromLane === null.
    const initStation = layout.stations.find((s) => s.subject === 'init')
    if (initStation && initStation.mergeFromLane !== null)
      errors.push(
        `non-merge commit "init" should have mergeFromLane=null (got ${initStation.mergeFromLane})`
      )

    // Each stale lane should have exactly ONE abandoned-tip station.
    const noStaleOpts = layoutMod.computeMetroLayout(graph, refs, 'main')
    const tipsByLane = new Map()
    for (const s of noStaleOpts.stations) {
      if (!s.isAbandonedTip) continue
      tipsByLane.set(s.lane, (tipsByLane.get(s.lane) ?? 0) + 1)
    }
    console.log(
      `  abandoned-tip stations per stale lane: ${
        [...tipsByLane.entries()].map(([l, n]) => `lane ${l}=${n}`).join(', ') ||
        '— none —'
      }`
    )
    for (const lane of noStaleOpts.staleLanes) {
      if (tipsByLane.get(lane) !== 1)
        errors.push(
          `stale lane ${lane} should have exactly 1 abandoned-tip station (got ${tipsByLane.get(lane) ?? 0})`
        )
    }
    // Non-stale lanes should never have an abandoned-tip station.
    for (const [lane, count] of tipsByLane) {
      if (!noStaleOpts.staleLanes.has(lane))
        errors.push(`lane ${lane} is not stale but has ${count} abandoned-tip stations`)
    }

    // Every station should have a non-empty `date` field (used by StartMarker).
    const missingDate = layout.stations.find((s) => !s.date || typeof s.date !== 'string')
    if (missingDate)
      errors.push(`station ${missingDate.shortHash} missing date (got ${missingDate.date})`)

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
