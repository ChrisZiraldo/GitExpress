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

export interface MetroLayout {
  rows: GraphRow[]
  stations: MetroStation[]
  laneLabels: MetroLaneLabel[]
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
  const colWidth = opts.colWidth ?? 56
  const laneHeight = opts.laneHeight ?? 56
  const leftPad = opts.leftPad ?? 24
  const rightPad = opts.rightPad ?? 96
  const topPad = opts.topPad ?? 40
  const bottomPad = opts.bottomPad ?? 56

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

  const width = leftPad + cols * colWidth + rightPad
  const height = topPad + laneCount * laneHeight + bottomPad

  return {
    rows: laneLayout.rows,
    stations,
    laneLabels,
    laneCount,
    colWidth,
    laneHeight,
    leftPad,
    rightPad,
    topPad,
    bottomPad,
    width,
    height,
    cols
  }
}
