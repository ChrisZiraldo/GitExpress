// Smoke test: run computeMetroLayout against a synthetic GraphCommit + RefSet
// shaped like a real repo (feature/auth, fix/login, release/1.2, chore/deps
// stale, merges into main). We bundle the relevant TS modules with esbuild
// on-the-fly so we don't need a tsx runner.
import { build } from 'esbuild'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const dir = mkdtempSync(path.join(tmpdir(), 'metro-smoke-'))
const outFile = path.join(dir, 'out.mjs')

await build({
  entryPoints: [
    path.resolve('src/renderer/components/metro/computeMetroLayout.ts')
  ],
  bundle: true,
  format: 'esm',
  outfile: outFile,
  platform: 'node',
  alias: { '@shared': path.resolve('src/shared') },
  external: ['react', 'react-dom']
})

const { computeMetroLayout } = await import(outFile)

// Build a small synthetic git history:
//  main:        m4 ← m3 ← m2 ← m1 ← m0(merge: m1 + featTip)
//  feature/auth (above main): featTip ← feat1 ← feat0(branched off m2)
//  fix/login (below main): fixTip ← fix0(branched off m3)
//  chore/deps (stale, no upstream): choreTip ← chore0(branched off m4)
const c = (hash, parents, subject) => ({
  hash,
  shortHash: hash.slice(0, 7),
  parents,
  author: 'Smoke',
  email: 's@example.com',
  date: '2025-01-01T00:00:00Z',
  relativeDate: 'just now',
  subject
})

const graph = [
  c('m0_______', ['m1_______', 'feat2____'], 'Merge feature/auth'),
  c('feat2____', ['feat1____'], 'feat: polish auth'),
  c('feat1____', ['feat0____'], 'feat: oauth'),
  c('feat0____', ['m2_______'], 'feat: scaffold'),
  c('fix1_____', ['fix0_____'], 'fix: redirect'),
  c('fix0_____', ['m3_______'], 'fix: handle null'),
  c('chore1___', ['chore0___'], 'chore: bump deps'),
  c('chore0___', ['m4_______'], 'chore: yarn upgrade'),
  c('m1_______', ['m2_______'], 'main: docs'),
  c('m2_______', ['m3_______'], 'main: ci'),
  c('m3_______', ['m4_______'], 'main: setup'),
  c('m4_______', [], 'init')
]

const refs = {
  local: [
    { name: 'main', fullName: 'refs/heads/main', hash: 'm0_______', upstream: 'origin/main', current: true, ahead: 0, behind: 0 },
    { name: 'feature/auth', fullName: 'refs/heads/feature/auth', hash: 'feat2____', upstream: 'origin/feature/auth', current: false, ahead: 0, behind: 0 },
    { name: 'fix/login', fullName: 'refs/heads/fix/login', hash: 'fix1_____', upstream: 'origin/fix/login', current: false, ahead: 0, behind: 0 },
    { name: 'chore/deps', fullName: 'refs/heads/chore/deps', hash: 'chore1___', upstream: null, current: false, ahead: 0, behind: 0 } // stale
  ],
  remote: [],
  tags: []
}

const layout = computeMetroLayout(graph, refs, 'main', {})

const checks = []
function check(name, cond, detail) { checks.push({ name, ok: !!cond, detail }) }

check('layout has stations', layout.stations.length === graph.length, `${layout.stations.length} stations`)
check('main lane is centered', typeof layout.mainLane === 'number')
check('terminal for feature/auth exists', layout.terminals.some(t => t.name === 'feature/auth'))
check('terminal for fix/login exists', layout.terminals.some(t => t.name === 'fix/login'))
check('terminal for chore/deps is stale', layout.terminals.find(t => t.name === 'chore/deps')?.stale === true)
check('chore/deps lane is in staleLanes', layout.terminals.find(t => t.name === 'chore/deps') &&
  layout.staleLanes.has(layout.terminals.find(t => t.name === 'chore/deps').lane))
check('merge commit (m0) is interchange', layout.stations.find(s => s.hash === 'm0_______')?.kind === 'interchange')
check('HEAD station is m0', layout.headStation?.hash === 'm0_______')
check('width > 0', layout.width > 0)
check('height > 0', layout.height > 0)

// Sanity: feature should be ABOVE main (smaller lane index), fix below.
const featStation = layout.stations.find(s => s.hash === 'feat2____')
const fixStation = layout.stations.find(s => s.hash === 'fix1_____')
const mainStation = layout.stations.find(s => s.hash === 'm0_______')
check('feature lane is above main', featStation && mainStation && featStation.lane < mainStation.lane,
  `feat lane=${featStation?.lane}, main lane=${mainStation?.lane}`)
check('fix lane is below main', fixStation && mainStation && fixStation.lane > mainStation.lane,
  `fix lane=${fixStation?.lane}, main lane=${mainStation?.lane}`)

let pass = 0, fail = 0
for (const t of checks) {
  if (t.ok) { pass++; console.log('  ok', t.name, t.detail ? `(${t.detail})` : '') }
  else { fail++; console.log('  FAIL', t.name, '->', t.detail) }
}
console.log(`\n${pass}/${checks.length} passed`)
process.exit(fail === 0 ? 0 : 1)
