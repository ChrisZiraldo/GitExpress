import type { GraphCommit, Ref, RefSet } from '@shared/types'
import { computeLanes, type GraphRow } from '../graph/computeLanes'
import { laneColor } from './colors'

/**
 * Classifies a branch name as belonging above or below the main lane.
 * Returns 'auto' when we can't decide and the caller should balance it.
 */
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
): Map<number, number> {
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
  return remap
}

export type StationKind = 'commit' | 'interchange' | 'tag' | 'head'

export interface MetroStation {
  hash: string
  shortHash: string
  subject: string
  author: string
  email: string
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
}

export interface MetroLayoutOpts {
  colWidth?: number
  laneHeight?: number
  leftPad?: number
  rightPad?: number
  topPad?: number
  bottomPad?: number
}

/**
 * Computes a horizontal metro-map layout where:
 *   - x axis is time (oldest → newest, left → right). graph[0] (newest)
 *     lives at the RIGHTMOST column.
 *   - y axis is branch lanes stacked top-to-bottom.
 */
export function computeMetroLayout(
  graph: GraphCommit[],
  refs: RefSet,
  currentBranch: string | null,
  opts: MetroLayoutOpts = {}
): MetroLayout {
  const colWidth = opts.colWidth ?? 92
  const laneHeight = opts.laneHeight ?? 80
  const leftPad = opts.leftPad ?? 120
  const rightPad = opts.rightPad ?? 240
  const topPad = opts.topPad ?? 64
  const bottomPad = opts.bottomPad ?? 72

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

  const remap = buildLaneRemap(
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

    stations.push({
      hash: commit.hash,
      shortHash: commit.shortHash,
      subject: commit.subject,
      author: commit.author,
      email: commit.email,
      relativeDate: commit.relativeDate,
      row: i,
      lane,
      x,
      y,
      kind,
      color: laneColor(lane),
      refs: stationRefs,
      isHead,
      hasTag
    })

    // Track first appearance of each lane (smallest row index = newest commit on that lane)
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

  const laneLabels: MetroLaneLabel[] = []
  for (const [lane] of laneFirstRow.entries()) {
    const name = laneBranchName.get(lane)
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
    tipLane
  }
}
