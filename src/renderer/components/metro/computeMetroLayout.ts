import type { GraphCommit, Ref, RefSet } from '@shared/types'
import { computeLanes, type GraphRow } from '../graph/computeLanes'
import { laneColor } from './colors'

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

  const laneLayout = computeLanes(graph)
  const cols = laneLayout.rows.length
  // Oldest (last graph row) at the LEFT; newest (row 0) at the RIGHT.
  const rx = (rowIdx: number): number =>
    leftPad + (cols - 1 - rowIdx) * colWidth + colWidth / 2
  const ly = (lane: number): number => topPad + lane * laneHeight + laneHeight / 2

  // Refs by commit
  const refsByCommit = new Map<string, Ref[]>()
  const pushRef = (r: Ref): void => {
    const list = refsByCommit.get(r.hash) ?? []
    list.push(r)
    refsByCommit.set(r.hash, list)
  }
  refs.local.forEach(pushRef)
  refs.remote.forEach(pushRef)
  refs.tags.forEach(pushRef)

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
    headLaneY
  }
}
