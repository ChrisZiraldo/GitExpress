import { useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  CircleDashed,
  Clock,
  ExternalLink,
  GitPullRequest,
  RefreshCw,
  RotateCcw,
  XCircle
} from 'lucide-react'
import { useRepo } from '../store/useRepo'
import { useCiStatus } from '../hooks/useCiStatus'
import type { CheckRollupState, CheckSummary, PullRequestInfo } from '@shared/types'

/**
 * Compact CI status badge for the current branch. Renders:
 *   • Nothing      — no open PR / `gh` not installed
 *   • A pill       — pending / success / failure / "checks pending" with PR #
 *
 * Clicking the pill toggles a small popover listing each check with a link
 * out to its details URL. The PR title doubles as a link to the PR itself.
 */
export function CiBadge(): JSX.Element | null {
  const activeRepo = useRepo((s) => s.activeRepo)
  const currentBranch = useRepo((s) => s.status?.branch?.current ?? null)
  const ciByBranch = useRepo((s) => s.ciByBranch)
  const ciLoading = useRepo((s) => s.ciLoading)
  const ciAvailable = useRepo((s) => s.ciAvailable)
  const pushToast = useRepo((s) => s.pushToast)
  const { refresh } = useCiStatus()
  const [open, setOpen] = useState(false)
  const [rerunning, setRerunning] = useState<string | null>(null) // runId being rerun, or 'all'/'failed'
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!popoverRef.current) return
      if (!popoverRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  if (!currentBranch || ciAvailable === false) return null

  const pr = ciByBranch[currentBranch]
  const loading = !!ciLoading[currentBranch]

  if (pr === undefined && !loading) return null
  if (pr === null) return null

  if (!pr && loading) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-bg-panel text-muted shrink-0">
        <RefreshCw size={11} className="animate-spin" />
        <span>CI…</span>
      </span>
    )
  }

  if (!pr) return null

  const style = ROLLUP_STYLES[pr.rollup]
  const Icon = style.icon
  const counts = countByState(pr.checks)
  const summary = summaryLabel(pr, counts)

  // Collect unique run IDs present in the checks.
  const runIds = [...new Set(pr.checks.map((c) => c.runId).filter(Boolean))] as string[]
  const failedRunIds = [...new Set(
    pr.checks.filter((c) => c.state === 'failure' && c.runId).map((c) => c.runId!)
  )]
  const hasFailures = failedRunIds.length > 0

  const handleRerun = async (runId: string, failedOnly: boolean): Promise<void> => {
    if (!activeRepo) return
    const key = failedOnly ? `failed:${runId}` : `all:${runId}`
    setRerunning(key)
    try {
      const res = await window.git.pr.rerunRun(activeRepo.path, runId, failedOnly)
      if (res.ok) {
        pushToast('success', failedOnly ? 'Rerunning failed jobs…' : 'Rerunning all jobs…')
        // Refresh CI status after a short delay to pick up the new run.
        setTimeout(() => void refresh(), 3000)
      } else {
        pushToast('error', `Rerun failed: ${res.stderr}`)
      }
    } finally {
      setRerunning(null)
    }
  }

  // Rerun all failed jobs across every run ID that has failures.
  const handleRerunAllFailed = (): void => {
    for (const id of failedRunIds) void handleRerun(id, true)
  }

  // Rerun every job in every run ID visible in this PR.
  const handleRerunAll = (): void => {
    for (const id of runIds) void handleRerun(id, false)
  }

  return (
    <div className="relative shrink-0" ref={popoverRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={`PR #${pr.number} — ${pr.title}`}
        className={
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ' +
          style.pill
        }
      >
        {loading ? (
          <RefreshCw size={11} className="animate-spin" />
        ) : (
          <Icon size={11} />
        )}
        <span className="font-mono">#{pr.number}</span>
        <span className="opacity-90">{summary}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-80 max-h-96 overflow-y-auto bg-bg-panel border border-line rounded-md shadow-xl z-40 text-sm"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-line flex items-start gap-2">
            <GitPullRequest size={14} className="mt-0.5 text-muted shrink-0" />
            <div className="flex-1 min-w-0">
              <button
                onClick={() => {
                  void window.git.shell.openExternal(pr.url)
                  setOpen(false)
                }}
                className="text-left w-full hover:text-accent transition-colors"
              >
                <div className="font-medium truncate">{pr.title}</div>
                <div className="text-xs text-muted truncate">
                  #{pr.number} · {pr.headRefName} → {pr.baseRefName}
                  {pr.isDraft && <span className="ml-1 text-warn">(draft)</span>}
                </div>
              </button>
            </div>
            <button
              onClick={() => void refresh()}
              title="Refresh CI status"
              className="p-1 rounded hover:bg-line text-muted"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Rollup summary + rerun buttons */}
          <div className="px-3 py-1.5 border-b border-line flex items-center justify-between gap-2 text-xs">
            <span className="text-muted shrink-0">
              {pr.checks.length === 0
                ? 'No checks configured'
                : `${pr.checks.length} check${pr.checks.length === 1 ? '' : 's'}`}
            </span>
            <span className={style.text + ' shrink-0'}>{ROLLUP_LABEL[pr.rollup]}</span>

            {/* Rerun buttons — only show when there are Actions-backed runs */}
            {runIds.length > 0 && (
              <div className="flex items-center gap-1 ml-auto shrink-0">
                {hasFailures && (
                  <button
                    onClick={handleRerunAllFailed}
                    disabled={rerunning !== null}
                    title="Rerun failed jobs"
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-danger/15 text-danger hover:bg-danger/25 disabled:opacity-40 text-[11px] font-medium"
                  >
                    <RotateCcw size={10} className={rerunning?.startsWith('failed:') ? 'animate-spin' : ''} />
                    Rerun failed
                  </button>
                )}
                <button
                  onClick={handleRerunAll}
                  disabled={rerunning !== null}
                  title="Rerun all jobs"
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-line text-text hover:bg-line/80 disabled:opacity-40 text-[11px] font-medium"
                >
                  <RotateCcw size={10} className={rerunning?.startsWith('all:') ? 'animate-spin' : ''} />
                  Rerun all
                </button>
              </div>
            )}
          </div>

          {/* Checks list */}
          {pr.checks.length > 0 && (
            <ul className="py-1">
              {pr.checks.map((c) => (
                <CheckRow
                  key={`${c.kind}:${c.name}`}
                  check={c}
                  cwd={activeRepo?.path ?? ''}
                  rerunning={rerunning}
                  onRerun={(runId, failedOnly) => void handleRerun(runId, failedOnly)}
                />
              ))}
            </ul>
          )}

          {/* Footer link */}
          <button
            onClick={() => {
              void window.git.shell.openExternal(pr.url)
              setOpen(false)
            }}
            className="w-full px-3 py-2 border-t border-line text-xs text-accent hover:bg-line flex items-center gap-1 justify-center"
          >
            Open PR on GitHub
            <ExternalLink size={11} />
          </button>
        </div>
      )}
    </div>
  )
}

interface CheckRowProps {
  check: CheckSummary
  cwd: string
  rerunning: string | null
  onRerun: (runId: string, failedOnly: boolean) => void
}

function CheckRow({ check, rerunning, onRerun }: CheckRowProps): JSX.Element {
  const style = ROLLUP_STYLES[check.state]
  const Icon = style.icon
  const canRerun = check.state === 'failure' && !!check.runId
  const isThisRerunning =
    rerunning === `failed:${check.runId}` || rerunning === `all:${check.runId}`

  return (
    <li className="flex items-center gap-2 px-3 py-1 group">
      <Icon size={12} className={style.text + ' shrink-0'} />
      <span className="flex-1 truncate text-xs">{check.name}</span>

      {/* Per-row rerun button — only on failed Actions checks */}
      {canRerun && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRerun(check.runId!, true)
          }}
          disabled={rerunning !== null}
          title="Rerun this failed job"
          className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-1.5 py-0.5 rounded bg-danger/15 text-danger hover:bg-danger/25 disabled:opacity-40 text-[10px] font-medium transition-opacity shrink-0"
        >
          <RotateCcw size={9} className={isThisRerunning ? 'animate-spin' : ''} />
          Rerun
        </button>
      )}

      {check.url && (
        <button
          onClick={() => void window.git.shell.openExternal(check.url!)}
          className={canRerun ? 'shrink-0' : 'shrink-0 ml-auto'}
          title="Open in GitHub"
        >
          <ExternalLink size={10} className="text-muted hover:text-text" />
        </button>
      )}
    </li>
  )
}

function countByState(checks: CheckSummary[]): Record<CheckRollupState, number> {
  const out: Record<CheckRollupState, number> = {
    none: 0,
    pending: 0,
    success: 0,
    failure: 0
  }
  for (const c of checks) out[c.state]++
  return out
}

function summaryLabel(
  pr: PullRequestInfo,
  counts: Record<CheckRollupState, number>
): string {
  if (pr.checks.length === 0) return 'no checks'
  switch (pr.rollup) {
    case 'success':
      return `${counts.success} passed`
    case 'failure':
      return `${counts.failure} failed`
    case 'pending':
      return `${counts.pending} pending`
    default:
      return ''
  }
}

const ROLLUP_LABEL: Record<CheckRollupState, string> = {
  none: 'No checks',
  pending: 'Pending',
  success: 'All passing',
  failure: 'Failing'
}

interface RollupStyle {
  pill: string
  text: string
  icon: typeof CheckCircle2
}

const ROLLUP_STYLES: Record<CheckRollupState, RollupStyle> = {
  success: {
    pill: 'bg-success/15 text-success hover:bg-success/25',
    text: 'text-success',
    icon: CheckCircle2
  },
  failure: {
    pill: 'bg-danger/15 text-danger hover:bg-danger/25',
    text: 'text-danger',
    icon: XCircle
  },
  pending: {
    pill: 'bg-warn/15 text-warn hover:bg-warn/25',
    text: 'text-warn',
    icon: Clock
  },
  none: {
    pill: 'bg-bg-panel text-muted hover:bg-line',
    text: 'text-muted',
    icon: CircleDashed
  }
}
