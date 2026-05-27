import type { GraphCommit } from '@shared/types'

export interface GraphRow {
  commit: GraphCommit
  lane: number
  mergeFrom: number[]
  liveLanes: (string | null)[]
  parentLanes: number[]
}

export interface GraphLayout {
  rows: GraphRow[]
  width: number
}

export interface ComputeLanesOptions {
  /**
   * Hashes that should always be allocated a fresh lane rather than reusing
   * a previously-freed slot. Typically the set of local branch tips — this
   * keeps sibling branches on distinct lanes so they can be rendered above /
   * below the trunk independently.
   */
  pinnedTips?: Set<string>
}

export function computeLanes(
  commits: GraphCommit[],
  opts: ComputeLanesOptions = {}
): GraphLayout {
  const pinnedTips = opts.pinnedTips ?? new Set<string>()
  const pending: (string | null)[] = []
  // Lanes claimed by a pinned tip stay reserved forever: they're never
  // reused by firstNullSlot and they survive the trailing-null trim.
  const reservedLanes = new Set<number>()
  const homeByHash = new Map<string, number>()
  const rows: GraphRow[] = []

  const firstFreeSlot = (): number => {
    for (let i = 0; i < pending.length; i++) {
      if (pending[i] === null && !reservedLanes.has(i)) return i
    }
    return pending.length
  }

  for (const commit of commits) {
    let home = pending.findIndex((h) => h === commit.hash)
    if (home === -1) {
      if (pinnedTips.has(commit.hash)) {
        // Allocate a fresh, dedicated lane for this pinned tip.
        home = pending.length
        pending.push(null)
        reservedLanes.add(home)
      } else {
        home = firstFreeSlot()
        if (home === pending.length) pending.push(null)
      }
    } else if (pinnedTips.has(commit.hash)) {
      // Hash was already in pending (some child carried it forward), but it's
      // also a pinned tip — reserve this lane for it.
      reservedLanes.add(home)
    }

    const mergeFrom: number[] = []
    for (let i = 0; i < pending.length; i++) {
      if (i !== home && pending[i] === commit.hash) {
        mergeFrom.push(i)
        pending[i] = null
      }
    }

    homeByHash.set(commit.hash, home)

    // First parent: carry on this lane unless the parent is itself a pinned
    // tip — in that case let it claim its own dedicated lane when encountered.
    const firstParent = commit.parents[0] ?? null
    pending[home] =
      firstParent !== null && pinnedTips.has(firstParent) ? null : firstParent

    for (let pi = 1; pi < commit.parents.length; pi++) {
      const p = commit.parents[pi]
      if (pinnedTips.has(p)) continue
      const slot = firstFreeSlot()
      if (slot === pending.length) pending.push(p)
      else pending[slot] = p
    }

    // Trim trailing nulls — but keep reserved lanes alive.
    while (
      pending.length > 0 &&
      pending[pending.length - 1] === null &&
      !reservedLanes.has(pending.length - 1)
    ) {
      pending.pop()
    }

    rows.push({
      commit,
      lane: home,
      mergeFrom,
      liveLanes: [...pending],
      parentLanes: []
    })
  }

  for (const row of rows) {
    row.parentLanes = row.commit.parents.map((p) => homeByHash.get(p) ?? -1)
  }

  let maxLane = 0
  for (const row of rows) {
    if (row.lane > maxLane) maxLane = row.lane
    for (let i = 0; i < row.liveLanes.length; i++) {
      if (row.liveLanes[i] !== null && i > maxLane) maxLane = i
    }
  }

  return { rows, width: maxLane + 1 }
}

export const LANE_PALETTE = [
  '#3b82f6',
  '#a855f7',
  '#22c55e',
  '#14b8a6',
  '#f97316',
  '#eab308',
  '#ec4899',
  '#64748b'
]

export function laneColor(lane: number): string {
  if (lane < 0) return LANE_PALETTE[0]
  return LANE_PALETTE[lane % LANE_PALETTE.length]
}
