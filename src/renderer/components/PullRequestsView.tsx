import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, GitMerge, GitPullRequest, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { useRepo } from '../store/useRepo'
import type { CheckRollupState, PrListItem } from '@shared/types'

// Max concurrent CI fetches so we don't hammer the GitHub API.
const CI_CONCURRENCY = 3

export function PullRequestsView(): JSX.Element {
  const activeRepo = useRepo((s) => s.activeRepo)
  const [prs, setPrs] = useState<PrListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Per-PR CI rollup keyed by PR number.
  const [ciRollup, setCiRollup] = useState<Record<number, CheckRollupState>>({})
  const abortRef = useRef<AbortController | null>(null)

  const fetchPrs = useCallback(async (): Promise<void> => {
    if (!activeRepo) return

    // Cancel any in-flight CI fetches from a previous load.
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setError(null)
    setCiRollup({})
    try {
      const res = await window.git.pr.list(activeRepo.path)
      if (ctrl.signal.aborted) return
      if (!res.ok) {
        setError(res.stderr)
        return
      }
      setPrs(res.data)

      // Kick off lazy CI loading after the list renders.
      void loadCiLazy(activeRepo.path, res.data, ctrl.signal, setCiRollup)
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [activeRepo])

  useEffect(() => {
    void fetchPrs()
    return () => { abortRef.current?.abort() }
  }, [fetchPrs])

  const openPr = (url: string): void => {
    void window.git.shell.openExternal(url)
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-bg">
      {/* Header bar */}
      <div className="h-10 px-4 flex items-center justify-between border-b border-line shrink-0 bg-bg-subtle">
        <span className="text-sm font-medium">
          {loading
            ? 'Loading…'
            : `${prs.length} open pull request${prs.length === 1 ? '' : 's'}`}
        </span>
        <button
          onClick={() => void fetchPrs()}
          disabled={loading}
          title="Refresh"
          className="p-1.5 rounded hover:bg-line text-muted hover:text-text disabled:opacity-40 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {error ? (
          <GhUnavailable message={error} />
        ) : loading && prs.length === 0 ? (
          <LoadingSkeleton />
        ) : prs.length === 0 ? (
          <EmptyState />
        ) : (
          <ul>
            {prs.map((pr) => (
              <PrRow
                key={pr.number}
                pr={pr}
                ciRollup={ciRollup[pr.number] ?? 'none'}
                ciLoading={!(pr.number in ciRollup) && !error}
                onClick={() => openPr(pr.url)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── Lazy CI loader ────────────────────────────────────────────────────────

async function loadCiLazy(
  cwd: string,
  prs: PrListItem[],
  signal: AbortSignal,
  setRollup: React.Dispatch<React.SetStateAction<Record<number, CheckRollupState>>>
): Promise<void> {
  // Work through the list CI_CONCURRENCY at a time.
  let i = 0
  const workers = Array.from({ length: CI_CONCURRENCY }, async () => {
    while (i < prs.length) {
      if (signal.aborted) return
      const pr = prs[i++]
      try {
        const res = await window.git.ci.prStatus(cwd, pr.headRefName)
        if (signal.aborted) return
        if (res.ok) {
          setRollup((prev) => ({
            ...prev,
            [pr.number]: res.data?.rollup ?? 'none'
          }))
        } else {
          // Mark as unknown on error so the spinner clears.
          setRollup((prev) => ({ ...prev, [pr.number]: 'none' }))
        }
      } catch {
        if (!signal.aborted) {
          setRollup((prev) => ({ ...prev, [pr.number]: 'none' }))
        }
      }
    }
  })
  await Promise.all(workers)
}

// ── PR row ────────────────────────────────────────────────────────────────

interface PrRowProps {
  pr: PrListItem
  ciRollup: CheckRollupState
  ciLoading: boolean
  onClick: () => void
}

function PrRow({ pr, ciRollup, ciLoading, onClick }: PrRowProps): JSX.Element {
  const relative = relativeTime(pr.updatedAt)

  return (
    <li
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 border-b border-line hover:bg-bg-subtle cursor-pointer group"
    >
      {/* CI dot */}
      <CiDot state={ciRollup} loading={ciLoading} />

      {/* PR number */}
      <span className="text-xs font-mono text-muted shrink-0 w-10 text-right">
        #{pr.number}
      </span>

      {/* Badges */}
      <div className="flex items-center gap-1 shrink-0">
        {pr.isDraft && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-line text-muted">
            Draft
          </span>
        )}
        {pr.mergeable === 'CONFLICTING' && (
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-danger/15 text-danger"
            title="Has merge conflicts"
          >
            Conflict
          </span>
        )}
        {pr.labels.slice(0, 3).map((l) => (
          <span
            key={l}
            className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent/15 text-accent"
          >
            {l}
          </span>
        ))}
      </div>

      {/* Title */}
      <span className="flex-1 min-w-0 text-sm font-medium truncate group-hover:text-accent transition-colors">
        {pr.title}
      </span>

      {/* Meta: author · base ← head · age */}
      <div className="flex items-center gap-2 text-xs text-muted shrink-0">
        <span>{pr.author}</span>
        <span className="text-line">·</span>
        <span className="font-mono truncate max-w-[200px]">
          {pr.baseRefName}
          <span className="mx-1 text-line">←</span>
          {pr.headRefName}
        </span>
        <span className="text-line">·</span>
        <span>{relative}</span>
      </div>
    </li>
  )
}

// ── CI dot ────────────────────────────────────────────────────────────────

function CiDot({ state, loading }: { state: CheckRollupState; loading: boolean }): JSX.Element {
  if (loading) {
    return (
      <span className="shrink-0 w-3.5 h-3.5 rounded-full border border-line animate-pulse bg-line" />
    )
  }
  if (state === 'success') {
    return (
      <span title="Checks passed" className="shrink-0">
        <CheckCircle2 size={14} className="text-success" />
      </span>
    )
  }
  if (state === 'failure') {
    return (
      <span title="Checks failed" className="shrink-0">
        <AlertCircle size={14} className="text-danger" />
      </span>
    )
  }
  if (state === 'pending') {
    return (
      <span title="Checks pending" className="shrink-0">
        <Clock size={14} className="text-warn" />
      </span>
    )
  }
  return (
    <span title="No checks" className="shrink-0">
      <GitPullRequest size={14} className="text-muted" />
    </span>
  )
}

// ── Empty / error states ──────────────────────────────────────────────────

function EmptyState(): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8 py-16">
      <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
        <GitMerge size={24} className="text-success" />
      </div>
      <div>
        <div className="font-medium text-sm">All clear</div>
        <div className="text-xs text-muted mt-1">No open pull requests for this repository.</div>
      </div>
    </div>
  )
}

function GhUnavailable({ message }: { message: string }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8 py-16">
      <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center">
        <AlertCircle size={24} className="text-danger" />
      </div>
      <div>
        <div className="font-medium text-sm">Could not load pull requests</div>
        <div className="text-xs text-muted mt-1 max-w-xs font-mono break-words">{message}</div>
        <div className="text-xs text-muted mt-2">
          Make sure <code className="bg-bg-subtle px-1 rounded">gh</code> is installed and
          authenticated.
        </div>
      </div>
    </div>
  )
}

function LoadingSkeleton(): JSX.Element {
  return (
    <ul>
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3 border-b border-line animate-pulse">
          <div className="w-3.5 h-3.5 rounded-full bg-line shrink-0" />
          <div className="w-8 h-3 rounded bg-line shrink-0" />
          <div className="flex-1 h-3 rounded bg-line" style={{ maxWidth: `${40 + (i % 4) * 12}%` }} />
          <div className="w-24 h-3 rounded bg-line shrink-0" />
        </li>
      ))}
    </ul>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}
