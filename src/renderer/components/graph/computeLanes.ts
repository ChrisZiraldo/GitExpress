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

function firstNullSlot(lanes: (string | null)[]): number {
  for (let i = 0; i < lanes.length; i++) {
    if (lanes[i] === null) return i
  }
  return lanes.length
}

export function computeLanes(commits: GraphCommit[]): GraphLayout {
  const pending: (string | null)[] = []
  const homeByHash = new Map<string, number>()
  const rows: GraphRow[] = []

  for (const commit of commits) {
    let home = pending.findIndex((h) => h === commit.hash)
    if (home === -1) {
      home = firstNullSlot(pending)
      if (home === pending.length) pending.push(null)
    }

    const mergeFrom: number[] = []
    for (let i = 0; i < pending.length; i++) {
      if (i !== home && pending[i] === commit.hash) {
        mergeFrom.push(i)
        pending[i] = null
      }
    }

    homeByHash.set(commit.hash, home)

    pending[home] = commit.parents[0] ?? null

    for (let pi = 1; pi < commit.parents.length; pi++) {
      const slot = firstNullSlot(pending)
      if (slot === pending.length) pending.push(commit.parents[pi])
      else pending[slot] = commit.parents[pi]
    }

    while (pending.length > 0 && pending[pending.length - 1] === null) {
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
  '#5b8cff',
  '#3ecf8e',
  '#f5a623',
  '#ff5d6c',
  '#a672ff',
  '#56cfe1',
  '#ff8fab',
  '#ffe066'
]

export function laneColor(lane: number): string {
  if (lane < 0) return LANE_PALETTE[0]
  return LANE_PALETTE[lane % LANE_PALETTE.length]
}
