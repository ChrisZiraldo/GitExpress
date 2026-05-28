import type { CheckRollupState, GraphCommit, Ref, RefSet } from '@shared/types'
import { computeLanes, type GraphRow } from '../graph/computeLanes'
import { laneColor } from './colors'

/** Optional CI status filter for branch tips. Mirrors `MetroFilters.ciStatus`
 * in the store but kept here so layout can be tested without the renderer. */
export type CiTipFilter = 'all' | 'passing' | 'failing' | 'pending' | 'none'

/** Date window enum, mirrors `DateRangeFilter` in the store. */
export type DateRangeFilter = 'all' | '7d' | '30d' | '90d'

/** Convert a `DateRangeFilter` into a UNIX-ms cutoff (or null for 'all').
 * Anchored at `now` so the cutoff slides with the user's clock. */
export function dateRangeCutoff(
  range: DateRangeFilter,
  now: number = Date.now()
): number | null {
  switch (range) {
    case '7d':
      return now - 7 * 24 * 60 * 60 * 1000
    case '30d':
      return now - 30 * 24 * 60 * 60 * 1000
    case '90d':
      return now - 90 * 24 * 60 * 60 * 1000
    default:
      return null
  }
}

/** Build the `ciByHash` map from the store's `ciByCommit` slice, keyed by
 * commit SHA → rollup state (or null for "no PR / no checks"). Entries
 * absent from this map mean "still loading" and are NOT filtered out. */
export function buildCiByHash(
  ciByCommit: Record<string, { rollup: CheckRollupState } | null>
): Map<string, CheckRollupState | null> {
  const out = new Map<string, CheckRollupState | null>()
  for (const [sha, info] of Object.entries(ciByCommit)) {
    out.set(sha, info ? info.rollup : null)
  }
  return out
}

/** Map a `CheckRollupState` (or `null` for "no PR / no data") onto the
 * categories the filter exposes. Treats unknowns conservatively: a tip
 * whose CI hasn't been fetched yet (`undefined` lookup) is reported as
 * `'unknown'` so callers can decide whether to keep or hide it. */
function ciCategory(
  rollup: CheckRollupState | null | undefined
): 'passing' | 'failing' | 'pending' | 'none' | 'unknown' {
  if (rollup === undefined) return 'unknown'
  if (rollup === null) return 'none'
  if (rollup === 'success') return 'passing'
  if (rollup === 'failure') return 'failing'
  if (rollup === 'pending') return 'pending'
  return 'none'
}

/**
 * Walks the parent graph from each starting hash and returns the union of all
 * commits reachable. Used both to compute "is this branch merged into main?"
 * and to drop unreachable commits from the layout when a branch is hidden.
 */
function reachableFrom(
  starts: Iterable<string>,
  graph: GraphCommit[]
): Set<string> {
  const byHash = new Map<string, GraphCommit>()
  for (const c of graph) byHash.set(c.hash, c)
  const out = new Set<string>()
  const queue: string[] = []
  for (const s of starts) queue.push(s)
  while (queue.length > 0) {
    const h = queue.pop()!
    if (out.has(h)) continue
    out.add(h)
    const c = byHash.get(h)
    if (!c) continue
    for (const p of c.parents) queue.push(p)
  }
  return out
}

/**
 * Applies all branch-visibility filters by dropping local branches (and their
 * unreachable commits) before layout. Always preserves the current branch and
 * the trunk (main/master) so the user can never accidentally hide everything.
 *
 * Filter semantics (all are AND-ed together):
 *   - showMerged=false: drop branches whose tip is reachable from trunk.
 *   - showStale=false:  drop branches without an upstream tracking ref.
 *   - ciFilter≠'all':   drop branches whose tip CI rollup doesn't match.
 *                       A tip whose CI is still loading (no entry in
 *                       `ciByHash`) is kept on the map — better UX than
 *                       making rows flicker as the network resolves.
 *   - author≠null:      drop branches whose tip's author email doesn't
 *                       match (case-insensitive exact match).
 *   - dateCutoffMs≠null:drop branches whose tip's commit date is older
 *                       than the cutoff.
 */
function applyVisibilityFilters(
  graph: GraphCommit[],
  refs: RefSet,
  opts: {
    showMerged: boolean
    showStale: boolean
    ciFilter: CiTipFilter
    ciByHash: Map<string, CheckRollupState | null> | null
    author: string | null
    dateCutoffMs: number | null
  }
): { graph: GraphCommit[]; refs: RefSet; hiddenLocalNames: Set<string> } {
  const hidden = new Set<string>()
  const trunk =
    refs.local.find((r) => r.name === 'main') ??
    refs.local.find((r) => r.name === 'master') ??
    null

  // Pre-compute "merged into trunk" set if we need to filter merged branches.
  let mergedHashes: Set<string> | null = null
  if (!opts.showMerged && trunk) {
    const reachableFromTrunk = reachableFrom([trunk.hash], graph)
    mergedHashes = new Set<string>()
    for (const r of refs.local) {
      if (r.hash === trunk.hash) continue
      if (r.current) continue
      if (reachableFromTrunk.has(r.hash)) mergedHashes.add(r.hash)
    }
  }

  // Index commits by hash so we can look up tip metadata cheaply.
  const byHash = new Map<string, GraphCommit>()
  for (const c of graph) byHash.set(c.hash, c)

  const wantAuthor = opts.author?.toLowerCase() ?? null

  for (const r of refs.local) {
    if (r.current) continue // never hide current branch
    if (r === trunk) continue // never hide trunk
    if (!opts.showStale && !r.upstream) {
      hidden.add(r.fullName)
      continue
    }
    if (!opts.showMerged && mergedHashes?.has(r.hash)) {
      hidden.add(r.fullName)
      continue
    }
    if (opts.ciFilter !== 'all') {
      const cat = ciCategory(opts.ciByHash?.get(r.hash))
      // Keep "unknown" so the row doesn't disappear while CI is still
      // loading — once the fetch resolves the row will re-evaluate.
      if (cat !== 'unknown' && cat !== opts.ciFilter) {
        hidden.add(r.fullName)
        continue
      }
    }
    if (wantAuthor) {
      const tip = byHash.get(r.hash)
      const email = tip?.email?.toLowerCase() ?? ''
      if (email !== wantAuthor) {
        hidden.add(r.fullName)
        continue
      }
    }
    if (opts.dateCutoffMs !== null) {
      const tip = byHash.get(r.hash)
      const t = tip?.date ? Date.parse(tip.date) : NaN
      if (!Number.isFinite(t) || t < opts.dateCutoffMs) {
        hidden.add(r.fullName)
        continue
      }
    }
  }

  if (hidden.size === 0) {
    return { graph, refs, hiddenLocalNames: new Set() }
  }

  const visibleLocal = refs.local.filter((r) => !hidden.has(r.fullName))
  const visibleTips: string[] = []
  for (const r of visibleLocal) visibleTips.push(r.hash)
  for (const r of refs.remote) visibleTips.push(r.hash)
  for (const r of refs.tags) visibleTips.push(r.hash)
  // Detached HEAD or no refs at all → keep at least the newest commit so the
  // map isn't blank.
  if (visibleTips.length === 0 && graph.length > 0) visibleTips.push(graph[0].hash)
  const reachable = reachableFrom(visibleTips, graph)
  const filteredGraph = graph.filter((c) => reachable.has(c.hash))

  return {
    graph: filteredGraph,
    refs: { local: visibleLocal, remote: refs.remote, tags: refs.tags },
    hiddenLocalNames: new Set(
      [...hidden]
        .map((full) => full.replace(/^refs\/heads\//, ''))
    )
  }
}

/**
 * Classifies a branch name as belonging above or below the main lane.
 * Returns 'auto' when we can't decide and the caller should balance it.
 */
/**
 * Pick a display name for a lane's terminus pill from the refs present on
 * its tip station. Preference order:
 *
 *   1. Local branch (`refs/heads/<name>`) — the canonical "this is your
 *      branch" signal.
 *   2. Remote-tracking branch (`refs/remotes/<remote>/<name>`, excluding
 *      `<remote>/HEAD` symbolic refs) — covers branches that exist on the
 *      remote but aren't checked out locally, so origin-only feature
 *      branches still get a labeled lane instead of an anonymous one.
 *   3. Tag (`refs/tags/<name>`) as a last resort, prefixed `tag:` so the
 *      pill clearly distinguishes a tag-anchored lane from a real branch.
 *
 * Returns null when no suitable ref is present (the lane stays anonymous
 * and won't render a pill at all).
 */
function pickLaneBranchName(stationRefs: { fullName: string; name: string }[]): string | null {
  const local = stationRefs.find((r) => r.fullName.startsWith('refs/heads/'))
  if (local) return local.name
  const remote = stationRefs.find(
    (r) =>
      r.fullName.startsWith('refs/remotes/') && !r.fullName.endsWith('/HEAD')
  )
  if (remote) {
    // r.name is typically like "origin/feature-x"; strip the first path
    // segment so the pill reads "feature-x" not "origin/feature-x".
    const slash = remote.name.indexOf('/')
    return slash >= 0 ? remote.name.slice(slash + 1) : remote.name
  }
  const tag = stationRefs.find((r) => r.fullName.startsWith('refs/tags/'))
  if (tag) return `tag: ${tag.name}`
  return null
}

function classifyLaneSide(name: string | undefined): 'above' | 'below' | 'auto' {
  if (!name) return 'auto'
  if (/^(feat|feature)\//i.test(name)) return 'above'
  if (/^(experiment|spike|prototype)\//i.test(name)) return 'above'
  if (/^(fix|bug|bugfix|hotfix|patch)\//i.test(name)) return 'below'
  if (/^(release|rel)\//i.test(name)) return 'below'
  if (/^(chore|deps?|infra|ci|build)\//i.test(name)) return 'below'
  if (/^(old|legacy|archive|stale)\//i.test(name)) return 'below'
  return 'auto'
}

interface LaneRemap {
  remap: Map<number, number>
  /** Lane index (in the post-remap space) where the chosen "main" sits. */
  mainLane: number
}

/**
 * Builds a permutation of lane indices that places "main" on the middle lane
 * and arranges the rest above/below it, sorted by recency so the busiest
 * branches sit closest to main.
 */
function buildLaneRemap(
  oldLaneCount: number,
  oldLaneBranchName: Map<number, string>,
  oldLaneFirstRow: Map<number, number>,
  currentBranch: string | null
): LaneRemap {
  // Find the "main" lane. Prefer real 'main' / 'master' refs; fall back to the
  // current branch's lane; otherwise lane 0.
  const candidates = ['main', 'master', ...(currentBranch ? [currentBranch] : [])]
  let mainLane: number | null = null
  for (const name of candidates) {
    for (const [lane, n] of oldLaneBranchName.entries()) {
      if (n === name) {
        mainLane = lane
        break
      }
    }
    if (mainLane !== null) break
  }
  if (mainLane === null) mainLane = 0

  const above: number[] = []
  const below: number[] = []
  const auto: number[] = []
  for (let l = 0; l < oldLaneCount; l++) {
    if (l === mainLane) continue
    const side = classifyLaneSide(oldLaneBranchName.get(l))
    if (side === 'above') above.push(l)
    else if (side === 'below') below.push(l)
    else auto.push(l)
  }

  // Distribute auto lanes alternating to keep both sides balanced.
  for (const l of auto) {
    if (above.length <= below.length) above.push(l)
    else below.push(l)
  }

  // Sort each side so the most-recently active branch (smallest first-row
  // index, i.e. closest to HEAD) sits adjacent to main.
  const byFirstRow = (a: number, b: number): number =>
    (oldLaneFirstRow.get(a) ?? Number.MAX_SAFE_INTEGER) -
    (oldLaneFirstRow.get(b) ?? Number.MAX_SAFE_INTEGER)
  above.sort(byFirstRow)
  below.sort(byFirstRow)

  const mainNewLane = above.length
  const remap = new Map<number, number>()
  for (let i = 0; i < above.length; i++) {
    // above[0] (most recent) goes directly above main; further-back ones go up.
    remap.set(above[i], mainNewLane - 1 - i)
  }
  remap.set(mainLane, mainNewLane)
  for (let i = 0; i < below.length; i++) {
    remap.set(below[i], mainNewLane + 1 + i)
  }
  return { remap, mainLane: mainNewLane }
}

export type StationKind = 'commit' | 'interchange' | 'tag' | 'head'

export interface MetroStation {
  hash: string
  shortHash: string
  subject: string
  author: string
  email: string
  /** ISO timestamp from `git log`; used by renderers that need the
   * absolute date (e.g. the "Start" terminus marker showing "Mar 1"). */
  date: string
  relativeDate: string
  row: number // index in the graph (0 = newest)
  lane: number
  /** x in pixels along the time axis (newest is largest x) */
  x: number
  /** y in pixels for this lane */
  y: number
  kind: StationKind
  color: string
  refs: Ref[]
  isHead: boolean
  hasTag: boolean
  /** For interchange/merge stations: the lane index of the FIRST branch
   * being merged in. Used to color the merge dot in the merging branch's
   * color (e.g. a "merge feature/auth" interchange on main is filled
   * purple, not blue). Null when the station isn't a merge or has no
   * incoming lanes. */
  mergeFromLane: number | null
  /** True when this station is the OLDEST station on a stale lane (i.e.
   * the abandoned-branch tip). Renderer treats these as terminal markers
   * with an "abandoned" glyph. */
  isAbandonedTip: boolean
}

export interface MetroLaneLabel {
  lane: number
  name: string
  color: string
  /** y coordinate of the lane (horizontal layout) */
  y: number
}

export interface MetroTerminal {
  lane: number
  name: string
  color: string
  /** x coordinate where the badge is anchored (just left of the lane's leftmost station) */
  x: number
  y: number
  /** True if the branch has no upstream / appears stale. Renderer should dash its line. */
  stale: boolean
}

export interface MetroLayout {
  rows: GraphRow[]
  stations: MetroStation[]
  laneLabels: MetroLaneLabel[]
  terminals: MetroTerminal[]
  /** Hash → boolean: lane that terminates at this commit is stale. */
  staleLanes: Set<number>
  /** Stations that should display a green tag badge along the line. */
  tagStations: MetroStation[]
  /** The HEAD station, if found. */
  headStation: MetroStation | null
  /** Number of lanes used (laneHeight rows). */
  laneCount: number
  /** Pixel size of each commit column along the time axis. */
  colWidth: number
  /** Pixel height of each lane row. */
  laneHeight: number
  leftPad: number
  rightPad: number
  topPad: number
  bottomPad: number
  width: number
  height: number
  /** Total number of commit columns. */
  cols: number
  /** y coordinate of the HEAD lane (used for the "X ahead" badge near HEAD). */
  headLaneY: number | null
  /** Commit-hash → final (post-remap) lane index, for any commit that maps
   * to a station. Consumers like the sidebar use this to look up the lane
   * (and therefore color) of a branch tip. */
  tipLane: Map<string, number>
  /** Lane index of the trunk ("main") in the post-remap space. */
  mainLane: number
  /** y coordinate of the trunk lane — used for initial scroll centering. */
  mainLaneY: number
  /** Local branch names that were filtered out by `showMerged`/`showStale`. */
  hiddenLocalNames: Set<string>
}

export interface MetroLayoutOpts {
  colWidth?: number
  laneHeight?: number
  leftPad?: number
  rightPad?: number
  topPad?: number
  bottomPad?: number
  /** Include local branches that are fully merged into main/master. Default true. */
  showMerged?: boolean
  /** Include local branches with no upstream (stale). Default true. */
  showStale?: boolean
  /** Keep only branches whose tip CI rollup matches. Default 'all'. */
  ciFilter?: CiTipFilter
  /** Cached CI rollup per branch tip. Used by `ciFilter`; missing entries
   * mean "still loading" and are kept on the map. */
  ciByHash?: Map<string, CheckRollupState | null>
  /** Keep only branches whose tip's author email matches (case-insensitive).
   * Pass null/undefined to disable. */
  author?: string | null
  /** Keep only branches whose tip commit is at or after this UNIX-ms cutoff.
   * Pass null/undefined to disable. */
  dateCutoffMs?: number | null
}

/**
 * Computes a horizontal metro-map layout where:
 *   - x axis is time (oldest → newest, left → right). graph[0] (newest)
 *     lives at the RIGHTMOST column.
 *   - y axis is branch lanes stacked top-to-bottom.
 */
export function computeMetroLayout(
  graphIn: GraphCommit[],
  refsIn: RefSet,
  currentBranch: string | null,
  opts: MetroLayoutOpts = {}
): MetroLayout {
  const colWidth = opts.colWidth ?? 52
  const laneHeight = opts.laneHeight ?? 64
  const leftPad = opts.leftPad ?? 96
  const rightPad = opts.rightPad ?? 200
  const topPad = opts.topPad ?? 48
  const bottomPad = opts.bottomPad ?? 60
  const showMerged = opts.showMerged ?? true
  const showStale = opts.showStale ?? true
  const ciFilter = opts.ciFilter ?? 'all'
  const ciByHash = opts.ciByHash ?? null
  const author = opts.author ?? null
  const dateCutoffMs = opts.dateCutoffMs ?? null

  // Apply branch-visibility filters once, then run the full layout pipeline
  // against the filtered graph + refs. This keeps the rest of the function
  // (lane assignment, remap, station placement) blissfully unaware of which
  // branches are user-hidden.
  const filtered = applyVisibilityFilters(graphIn, refsIn, {
    showMerged,
    showStale,
    ciFilter,
    ciByHash,
    author,
    dateCutoffMs
  })
  const graph = filtered.graph
  const refs = filtered.refs
  const hiddenLocalNames = filtered.hiddenLocalNames

  // Pin all local branch tips so sibling branches never share a lane.
  const pinnedTips = new Set<string>()
  for (const r of refs.local) pinnedTips.add(r.hash)

  const baseLayout = computeLanes(graph, { pinnedTips })
  const cols = baseLayout.rows.length

  // Refs by commit (used for branch-name discovery during the remap pass and
  // for ref chips later).
  const refsByCommit = new Map<string, Ref[]>()
  const pushRef = (r: Ref): void => {
    const list = refsByCommit.get(r.hash) ?? []
    list.push(r)
    refsByCommit.set(r.hash, list)
  }
  refs.local.forEach(pushRef)
  refs.remote.forEach(pushRef)
  refs.tags.forEach(pushRef)

  // ── Lane-remap pass ────────────────────────────────────────────────────
  // Pre-scan rows to discover which branch lives on which raw lane, then
  // build a remap that puts main in the middle (with features above and
  // fixes/releases/chores below). Finally rewrite each row's lane fields
  // through the remap so downstream code can treat lanes uniformly.
  const laneCandidateNames = new Map<number, string[]>()
  const oldLaneFirstRow = new Map<number, number>()
  for (let i = 0; i < baseLayout.rows.length; i++) {
    const row = baseLayout.rows[i]
    if (!oldLaneFirstRow.has(row.lane)) oldLaneFirstRow.set(row.lane, i)
    const localRefs = (refsByCommit.get(row.commit.hash) ?? []).filter((r) =>
      r.fullName.startsWith('refs/heads/')
    )
    if (localRefs.length > 0) {
      const list = laneCandidateNames.get(row.lane) ?? []
      for (const ref of localRefs) list.push(ref.name)
      laneCandidateNames.set(row.lane, list)
    }
    for (let pi = 0; pi < row.parentLanes.length; pi++) {
      const pl = row.parentLanes[pi]
      if (pl >= 0 && !oldLaneFirstRow.has(pl)) oldLaneFirstRow.set(pl, i)
    }
  }

  // For each lane, choose the most representative branch name: prefer main /
  // master / the current branch, otherwise the first ref found (which is the
  // branch that allocated this lane, since pinned tips never share lanes).
  const oldLaneBranchName = new Map<number, string>()
  for (const [lane, names] of laneCandidateNames.entries()) {
    if (names.includes('main')) oldLaneBranchName.set(lane, 'main')
    else if (names.includes('master')) oldLaneBranchName.set(lane, 'master')
    else if (currentBranch && names.includes(currentBranch))
      oldLaneBranchName.set(lane, currentBranch)
    else oldLaneBranchName.set(lane, names[0])
  }

  let oldLaneCount = 0
  for (const row of baseLayout.rows) {
    if (row.lane + 1 > oldLaneCount) oldLaneCount = row.lane + 1
    for (let l = 0; l < row.liveLanes.length; l++) {
      if (row.liveLanes[l] !== null && l + 1 > oldLaneCount) oldLaneCount = l + 1
    }
  }
  if (oldLaneCount === 0) oldLaneCount = 1

  const { remap, mainLane } = buildLaneRemap(
    oldLaneCount,
    oldLaneBranchName,
    oldLaneFirstRow,
    currentBranch
  )
  const r = (l: number): number => (l < 0 ? -1 : remap.get(l) ?? l)

  // Rewrite rows with the new lane indices. liveLanes is an array INDEXED by
  // lane, so we rebuild it with the new lane count.
  const remappedRows: GraphRow[] = baseLayout.rows.map((row) => {
    const newLive: (string | null)[] = new Array(oldLaneCount).fill(null)
    for (let l = 0; l < row.liveLanes.length; l++) {
      if (row.liveLanes[l] !== null) newLive[r(l)] = row.liveLanes[l]
    }
    return {
      commit: row.commit,
      lane: r(row.lane),
      mergeFrom: row.mergeFrom.map(r),
      liveLanes: newLive,
      parentLanes: row.parentLanes.map(r)
    }
  })

  const laneLayout = { rows: remappedRows, width: oldLaneCount }

  // Oldest (last graph row) at the LEFT; newest (row 0) at the RIGHT.
  const rx = (rowIdx: number): number =>
    leftPad + (cols - 1 - rowIdx) * colWidth + colWidth / 2
  const ly = (lane: number): number => topPad + lane * laneHeight + laneHeight / 2

  const headRef = currentBranch ? refs.local.find((r) => r.name === currentBranch) : null
  const headHash = headRef?.hash ?? graph[0]?.hash ?? null

  const stations: MetroStation[] = []
  const laneFirstRow = new Map<number, number>()
  const laneBranchName = new Map<number, string>()

  for (let i = 0; i < laneLayout.rows.length; i++) {
    const row = laneLayout.rows[i]
    const { commit, lane, parentLanes, mergeFrom } = row
    const x = rx(i)
    const y = ly(lane)
    const stationRefs = refsByCommit.get(commit.hash) ?? []
    const hasTag = stationRefs.some((r) => r.fullName.startsWith('refs/tags/'))
    const isHead = commit.hash === headHash
    const isMerge = mergeFrom.length > 0 || commit.parents.length > 1
    let kind: StationKind = 'commit'
    if (isHead) kind = 'head'
    else if (isMerge) kind = 'interchange'
    else if (hasTag) kind = 'tag'

    // For interchange stations, prefer a lane from `mergeFrom` (the lane(s)
     // that are visibly terminating into this commit). If none, fall back to
     // a non-self parent lane. We expose the FIRST such lane so the station
     // dot can be filled in the merging branch's color.
    let mergeFromLane: number | null = null
    if (isMerge) {
      const candidate = mergeFrom.find((l) => l >= 0 && l !== lane)
      if (candidate !== undefined) {
        mergeFromLane = candidate
      } else {
        const altParent = parentLanes.find((l) => l >= 0 && l !== lane)
        if (altParent !== undefined) mergeFromLane = altParent
      }
    }

    stations.push({
      hash: commit.hash,
      shortHash: commit.shortHash,
      subject: commit.subject,
      author: commit.author,
      email: commit.email,
      date: commit.date,
      relativeDate: commit.relativeDate,
      row: i,
      lane,
      x,
      y,
      kind,
      color: laneColor(lane),
      refs: stationRefs,
      isHead,
      hasTag,
      mergeFromLane,
      // Filled in below once we know which row is the lane terminus.
      isAbandonedTip: false
    })

    // Track first appearance of each lane (smallest row index = newest commit
    // on that lane). `laneBranchName` is reserved for LOCAL branch names
    // because it's the key used by stale-lane detection downstream
    // (`refs.local.find(...)`); pill display names that fall back to remote
    // or tag refs are computed separately at pill-build time.
    if (!laneFirstRow.has(lane)) {
      laneFirstRow.set(lane, i)
      const localRef = stationRefs.find((r) => r.fullName.startsWith('refs/heads/'))
      if (localRef) laneBranchName.set(lane, localRef.name)
    } else if (!laneBranchName.has(lane)) {
      const localRef = stationRefs.find((r) => r.fullName.startsWith('refs/heads/'))
      if (localRef) laneBranchName.set(lane, localRef.name)
    }

    for (let pi = 0; pi < parentLanes.length; pi++) {
      const pl = parentLanes[pi]
      if (pl >= 0 && !laneFirstRow.has(pl)) laneFirstRow.set(pl, i)
    }
  }

  // Compute laneCount from highest lane index that actually has a station / live lane.
  let laneCount = 0
  for (const row of laneLayout.rows) {
    if (row.lane + 1 > laneCount) laneCount = row.lane + 1
    for (let l = 0; l < row.liveLanes.length; l++) {
      if (row.liveLanes[l] !== null && l + 1 > laneCount) laneCount = l + 1
    }
  }
  if (laneCount === 0) laneCount = 1

  // Build the pill display name per lane, falling back from local branch →
  // remote tracking branch → tag. Done as a second pass so a station with
  // a tag at the lane's tip doesn't pre-empt a local branch that appears
  // on an OLDER commit further down the lane (the original semantic of
  // `laneBranchName` was "find a local ref ANYWHERE on this lane").
  const laneDisplayName = new Map<number, string>()
  for (const [lane, name] of laneBranchName.entries()) laneDisplayName.set(lane, name)
  if (laneDisplayName.size < laneFirstRow.size) {
    for (let i = 0; i < laneLayout.rows.length; i++) {
      const row = laneLayout.rows[i]
      const lane = row.lane
      if (laneDisplayName.has(lane)) continue
      const refsAtRow = refsByCommit.get(row.commit.hash) ?? []
      const fallback = pickLaneBranchName(refsAtRow)
      if (fallback) laneDisplayName.set(lane, fallback)
    }
  }

  const laneLabels: MetroLaneLabel[] = []
  for (const [lane] of laneFirstRow.entries()) {
    const name = laneDisplayName.get(lane)
    if (!name) continue
    laneLabels.push({
      lane,
      name,
      color: laneColor(lane),
      y: ly(lane)
    })
  }
  laneLabels.sort((a, b) => a.lane - b.lane)

  // Compute the leftmost x per lane (i.e. the oldest row index where the lane is live)
  const laneMaxRow = new Map<number, number>()
  for (let i = 0; i < laneLayout.rows.length; i++) {
    const row = laneLayout.rows[i]
    if (!laneMaxRow.has(row.lane) || (laneMaxRow.get(row.lane) ?? -1) < i)
      laneMaxRow.set(row.lane, i)
    for (let l = 0; l < row.liveLanes.length; l++) {
      if (row.liveLanes[l] !== null) {
        if (!laneMaxRow.has(l) || (laneMaxRow.get(l) ?? -1) < i) laneMaxRow.set(l, i)
      }
    }
  }

  // Stale-lane detection: branches without an upstream / not the current branch.
  const staleLanes = new Set<number>()
  for (const [lane, name] of laneBranchName.entries()) {
    const r = refs.local.find((ref) => ref.name === name)
    if (!r) continue
    if (!r.upstream && !r.current) staleLanes.add(lane)
  }

  // Mark abandoned-tip stations: the OLDEST station on a stale lane gets a
  // distinct terminal marker so the user can spot dead branch ends visually.
  for (const s of stations) {
    if (!staleLanes.has(s.lane)) continue
    if (s.row === (laneMaxRow.get(s.lane) ?? -1)) {
      s.isAbandonedTip = true
    }
  }

  const terminals: MetroTerminal[] = []
  for (const label of laneLabels) {
    const maxRow = laneMaxRow.get(label.lane) ?? 0
    const xLeftmost = rx(maxRow)
    terminals.push({
      lane: label.lane,
      name: label.name,
      color: label.color,
      x: xLeftmost - colWidth * 0.55,
      y: label.y,
      stale: staleLanes.has(label.lane)
    })
  }

  const tagStations = stations.filter((s) => s.hasTag)
  const headStation = stations.find((s) => s.isHead) ?? null
  const headLaneY = headStation ? headStation.y : null

  const width = leftPad + cols * colWidth + rightPad
  const height = topPad + laneCount * laneHeight + bottomPad

  const tipLane = new Map<string, number>()
  for (const s of stations) tipLane.set(s.hash, s.lane)

  return {
    rows: laneLayout.rows,
    stations,
    laneLabels,
    terminals,
    staleLanes,
    tagStations,
    headStation,
    laneCount,
    colWidth,
    laneHeight,
    leftPad,
    rightPad,
    topPad,
    bottomPad,
    width,
    height,
    cols,
    headLaneY,
    tipLane,
    mainLane,
    mainLaneY: ly(mainLane),
    hiddenLocalNames
  }
}
