import type { GraphCommit, Ref, RefSet, StatusResult } from '@shared/types'

/**
 * Realistic mock data used to render an enticing metro map on the welcome
 * screen when no repository is open. Real git data takes precedence whenever a
 * repo is loaded — these structures are only consumed by EmptyState / preview.
 */

const author = (name: string, email: string) => ({ author: name, email })

export const MOCK_GRAPH: GraphCommit[] = [
  {
    hash: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
    shortHash: 'a1b2c3d',
    parents: ['b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1'],
    ...author('Jason Miller', 'jason@acme.io'),
    date: '2025-05-20T16:00:00Z',
    relativeDate: '2 hours ago',
    subject: 'main HEAD — release/1.3 preview'
  },
  {
    hash: 'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1',
    shortHash: 'b2c3d4e',
    parents: ['c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2'],
    ...author('Jason Miller', 'jason@acme.io'),
    date: '2025-05-18T13:34:00Z',
    relativeDate: '2 days ago',
    subject: 'update docs'
  },
  {
    hash: 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2',
    shortHash: 'c3d4e5f',
    parents: ['d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3'],
    ...author('Riley Park', 'riley@acme.io'),
    date: '2025-05-17T10:10:00Z',
    relativeDate: '3 days ago',
    subject: 'refactor API'
  },
  {
    hash: 'd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3',
    shortHash: 'd4e5f6a',
    parents: [
      'e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4',
      'f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5'
    ],
    ...author('Jason Miller', 'jason@acme.io'),
    date: '2025-05-16T09:00:00Z',
    relativeDate: '4 days ago',
    subject: 'merge feature/dashboard'
  },
  {
    hash: 'e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4',
    shortHash: 'e5f6a7b',
    parents: ['a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6'],
    ...author('Jason Miller', 'jason@acme.io'),
    date: '2025-05-15T14:34:00Z',
    relativeDate: '5 days ago',
    subject: 'fix login redirect'
  },
  {
    hash: 'f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5',
    shortHash: 'f6a7b8c',
    parents: ['a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6'],
    ...author('Maya Singh', 'maya@acme.io'),
    date: '2025-05-13T11:00:00Z',
    relativeDate: '7 days ago',
    subject: 'dashboard: tests'
  },
  {
    hash: 'a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6',
    shortHash: 'a7b8c9d',
    parents: ['b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7'],
    ...author('Maya Singh', 'maya@acme.io'),
    date: '2025-05-10T15:30:00Z',
    relativeDate: '10 days ago',
    subject: 'add dashboard'
  },
  {
    hash: 'b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7',
    shortHash: 'b8c9d0e',
    parents: ['c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8'],
    ...author('Jason Miller', 'jason@acme.io'),
    date: '2025-05-08T12:00:00Z',
    relativeDate: '12 days ago',
    subject: 'merge feature/auth'
  },
  {
    hash: 'c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8',
    shortHash: 'c9d0e1f',
    parents: ['d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9'],
    ...author('Riley Park', 'riley@acme.io'),
    date: '2025-05-05T09:30:00Z',
    relativeDate: '15 days ago',
    subject: 'auth: ui polish'
  },
  {
    hash: 'd0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9',
    shortHash: 'd0e1f2a',
    parents: ['e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0'],
    ...author('Jason Miller', 'jason@acme.io'),
    date: '2025-05-02T16:00:00Z',
    relativeDate: '18 days ago',
    subject: 'setup CI'
  },
  {
    hash: 'e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0',
    shortHash: 'e1f2a3b',
    parents: ['f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1'],
    ...author('Riley Park', 'riley@acme.io'),
    date: '2025-04-28T10:00:00Z',
    relativeDate: '23 days ago',
    subject: 'add repo structure'
  },
  {
    hash: 'f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1',
    shortHash: 'f2a3b4c',
    parents: [],
    ...author('Jason Miller', 'jason@acme.io'),
    date: '2025-04-25T08:00:00Z',
    relativeDate: '26 days ago',
    subject: 'init auth'
  }
]

const mkRef = (
  partial: { name: string; hash: string; fullName: string; upstream?: string; current?: boolean }
): Ref => partial

export const MOCK_REFS: RefSet = {
  local: [
    mkRef({
      name: 'main',
      fullName: 'refs/heads/main',
      hash: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
      upstream: 'origin/main',
      current: true
    }),
    mkRef({
      name: 'feature/dashboard',
      fullName: 'refs/heads/feature/dashboard',
      hash: 'f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5',
      upstream: 'origin/feature/dashboard'
    }),
    mkRef({
      name: 'feature/auth',
      fullName: 'refs/heads/feature/auth',
      hash: 'c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8',
      upstream: 'origin/feature/auth'
    })
  ],
  remote: [],
  tags: [
    mkRef({
      name: 'v1.2.0',
      fullName: 'refs/tags/v1.2.0',
      hash: 'b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7'
    })
  ]
}

export const MOCK_STATUS: StatusResult = {
  branch: {
    current: 'main',
    upstream: 'origin/main',
    ahead: 2,
    behind: 0,
    detached: false
  },
  staged: [],
  unstaged: [],
  untracked: [],
  conflicted: []
}
