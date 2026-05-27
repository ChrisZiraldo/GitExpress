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
  row: number // row index in the graph (0 = newest)
  lane: number
  x: number
  y: number
  kind: StationKind
  color: string
  refs: Ref[]
  isHead: boolean
  hasTag: boolean
}

export interface MetroLaneLabel {
  /** lane index */
  lane: number
  /** the branch / ref name shown above the lane (best effort) */
  name: string
  color: string
  /** x coordinate of the label */
  x: number
  /** top y where the label is drawn */
  y: number
}

export interface MetroLayout {
  rows: GraphRow[]
  stations: MetroStation[]
  laneLabels: MetroLaneLabel[]
  /** map of lane index -> y of first appearance (used for labels) */
  laneFirstY: Map<number, number>
  rowHeight: number
  laneWidth: number
  leftPad: number
  topPad: number
  width: number
  height: number
}

export interface MetroLayoutOpts {
  rowHeight?: number
  laneWidth?: number
  leftPad?: number
  topPad?: number
  bottomPad?: number
}

export function computeMetroLayout(
  graph: GraphCommit[],
  refs: RefSet,
  currentBranch: string | null,
  opts: MetroLayoutOpts = {}
): MetroLayout {
  const rowHeight = opts.rowHeight ?? 40
  const laneWidth = opts.laneWidth ?? 28
  const leftPad = opts.leftPad ?? 28
  const topPad = opts.topPad ?? 36
  const bottomPad = opts.bottomPad ?? 48

  const laneLayout = computeLanes(graph)
  const cx = (lane: number): number => leftPad + lane * laneWidth + laneWidth / 2
  const cy = (rowIdx: number): number => topPad + rowIdx * rowHeight + rowHeight / 2

  // Build refs-by-commit map
  const refsByCommit = new Map<string, Ref[]>()
  const push = (r: Ref): void => {
    const list = refsByCommit.get(r.hash) ?? []
    list.push(r)
    refsByCommit.set(r.hash, list)
  }
  refs.local.forEach(push)
  refs.remote.forEach(push)
  refs.tags.forEach(push)

  const headRef = currentBranch ? refs.local.find((r) => r.name === currentBranch) : null
  const headHash = headRef?.hash ?? graph[0]?.hash ?? null

  // Track first-seen y per lane (for branch-name labels)
  const laneFirstRow = new Map<number, number>()
  const laneFirstBranch = new Map<number, string>()

  const stations: MetroStation[] = []

  for (let i = 0; i < laneLayout.rows.length; i++) {
    const row = laneLayout.rows[i]
    const { commit, lane, parentLanes, mergeFrom } = row
    const x = cx(lane)
    const y = cy(i)
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

    // Remember the first row a lane is used on, and the most descriptive local-branch name.
    if (!laneFirstRow.has(lane)) {
      laneFirstRow.set(lane, i)
      const localRef = stationRefs.find((r) => r.fullName.startsWith('refs/heads/'))
      if (localRef) laneFirstBranch.set(lane, localRef.name)
    } else if (!laneFirstBranch.has(lane)) {
      // If we didn't capture a name on first row, try again later
      const localRef = stationRefs.find((r) => r.fullName.startsWith('refs/heads/'))
      if (localRef) laneFirstBranch.set(lane, localRef.name)
    }

    // Also track parent lanes that diverge — they may be the first appearance of a new lane.
    for (let pi = 0; pi < parentLanes.length; pi++) {
      const pl = parentLanes[pi]
      if (pl >= 0 && !laneFirstRow.has(pl)) {
        laneFirstRow.set(pl, i)
      }
    }
  }

  // Build lane labels (one per lane with a known branch name)
  const laneLabels: MetroLaneLabel[] = []
  const laneFirstY = new Map<number, number>()
  for (const [lane, rowIdx] of laneFirstRow.entries()) {
    laneFirstY.set(lane, cy(rowIdx))
    const name = laneFirstBranch.get(lane)
    if (!name) continue
    laneLabels.push({
      lane,
      name,
      color: laneColor(lane),
      x: cx(lane),
      y: Math.max(topPad - 18, 6)
    })
  }

  const width = leftPad + Math.max(1, laneLayout.width) * laneWidth + leftPad
  const height = topPad + laneLayout.rows.length * rowHeight + bottomPad

  return {
    rows: laneLayout.rows,
    stations,
    laneLabels,
    laneFirstY,
    rowHeight,
    laneWidth,
    leftPad,
    topPad,
    width,
    height
  }
}
