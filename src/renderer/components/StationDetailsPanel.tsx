import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Copy,
  X,
  XCircle,
  CheckCircle2,
  CircleDashed,
  Clock,
  ExternalLink,
  GitPullRequest,
  Github,
  RefreshCw,
  RotateCcw,
  Tag,
  FileText
} from 'lucide-react'
import type {
  CheckRollupState,
  CheckSummary,
  CommitChecksInfo,
  CommitFileStatus,
  CommitPullRequestRef
} from '@shared/types'
import { useRepo } from '../store/useRepo'
import { Avatar } from './Avatar'
import { ContextMenu } from './ContextMenu'

function fileBadge(status: CommitFileStatus): { label: string; cls: string } {
  switch (status) {
    case 'added':
      return { label: 'A', cls: 'text-success' }
    case 'modified':
      return { label: 'M', cls: 'text-accent' }
    case 'deleted':
      return { label: 'D', cls: 'text-danger' }
    case 'renamed':
      return { label: 'R', cls: 'text-warn' }
    case 'copied':
      return { label: 'C', cls: 'text-warn' }
    default:
      return { label: '·', cls: 'text-muted' }
  }
}

export function StationDetailsPanel(): JSX.Element {
  const activeRepo = useRepo((s) => s.activeRepo)
  const selectedCommit = useRepo((s) => s.selectedCommit)
  const setSelectedCommit = useRepo((s) => s.setSelectedCommit)
  const commitDetail = useRepo((s) => s.commitDetail)
  const setCommitDetail = useRepo((s) => s.setCommitDetail)
  const setSelectedCommitFile = useRepo((s) => s.setSelectedCommitFile)
  const selectedCommitFile = useRepo((s) => s.selectedCommitFile)
  const setSelectedFile = useRepo((s) => s.setSelectedFile)
  const refs = useRepo((s) => s.refs)
  const status = useRepo((s) => s.status)
  const pushToast = useRepo((s) => s.pushToast)
  const ciAvailable = useRepo((s) => s.ciAvailable)
  const ciByCommit = useRepo((s) => s.ciByCommit)
  const ciCommitLoading = useRepo((s) => s.ciCommitLoading)
  const setCiForCommit = useRepo((s) => s.setCiForCommit)
  const setCiCommitLoading = useRepo((s) => s.setCiCommitLoading)

  // Load commit detail when selection changes
  useEffect(() => {
    if (!activeRepo || !selectedCommit) {
      setCommitDetail(null)
      return
    }
    let cancelled = false
    void window.git.commitInspect.show(activeRepo.path, selectedCommit).then((res) => {
      if (cancelled) return
      if (res.ok) setCommitDetail(res.data)
      else pushToast('error', `Failed to load commit: ${res.stderr}`)
    })
    return () => { cancelled = true }
  }, [activeRepo, selectedCommit, setCommitDetail, pushToast])

  // Fetch CI status (check-runs + statuses + associated PRs) for the selected
  // commit. Cached in the store keyed by full SHA so re-selecting the same
  // commit is instant. Skip entirely when `gh` isn't available.
  //
  // IMPORTANT: deps must NOT include `ciByCommit` / `ciCommitLoading` — those
  // store slices change on every fetch and would re-trigger this effect,
  // creating an infinite loop of `gh` calls. We dedupe via a ref instead and
  // read the latest cache via `useRepo.getState()`.
  //
  // Also: don't cancel pending writes when the user clicks to a different
  // station mid-fetch. `setCiForCommit` is a Zustand store update keyed by
  // SHA — writing it after the user has moved on is harmless and means the
  // result is cached so re-selecting that commit is instant. (The previous
  // version dropped the result if the selection changed before the fetch
  // resolved, which manifested as "I clicked a station, CI didn't appear,
  // I clicked away and back, then it showed up".)
  const inFlightCommitFetch = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!activeRepo || !selectedCommit) return
    if (ciAvailable === false) return
    const sha = selectedCommit
    const cached = useRepo.getState().ciByCommit[sha]
    if (cached !== undefined) return
    if (inFlightCommitFetch.current.has(sha)) return
    inFlightCommitFetch.current.add(sha)
    setCiCommitLoading(sha, true)
    void window.git.ci
      .commitChecks(activeRepo.path, sha)
      .then((res) => {
        setCiForCommit(sha, res.ok ? res.data : null)
      })
      .finally(() => {
        inFlightCommitFetch.current.delete(sha)
        setCiCommitLoading(sha, false)
      })
  }, [activeRepo, selectedCommit, ciAvailable, setCiForCommit, setCiCommitLoading])

  const refsForCommit = useMemo(() => {
    if (!commitDetail) return []
    return [...refs.local, ...refs.remote, ...refs.tags].filter(
      (r) => r.hash === commitDetail.hash
    )
  }, [commitDetail, refs])

  const branchLineRef = useMemo(() => {
    if (!commitDetail) return null
    // Best-effort: pick the first matching local branch, fall back to current branch.
    return (
      refs.local.find((r) => r.hash === commitDetail.hash) ??
      refs.local.find((r) => r.name === status?.branch.current) ??
      null
    )
  }, [commitDetail, refs.local, status?.branch.current])

  const [rerunning, setRerunning] = useState<string | null>(null)

  const handleRerun = async (runId: string, failedOnly: boolean): Promise<void> => {
    if (!activeRepo) return
    const key = failedOnly ? `failed:${runId}` : `all:${runId}`
    setRerunning(key)
    try {
      const res = await window.git.pr.rerunRun(activeRepo.path, runId, failedOnly)
      if (res.ok) {
        pushToast('success', failedOnly ? 'Rerunning failed jobs…' : 'Rerunning all jobs…')
        const sha = useRepo.getState().selectedCommit
        if (sha) {
          setTimeout(() => {
            useRepo.getState().setCiForCommit(sha, null)
          }, 5000)
        }
      } else {
        pushToast('error', `Rerun failed: ${res.stderr}`)
      }
    } finally {
      setRerunning(null)
    }
  }

  const handleRerunLatest = async (failedOnly: boolean): Promise<void> => {
    if (!activeRepo) return
    const key = failedOnly ? 'failed:latest' : 'all:latest'
    setRerunning(key)
    try {
      const res = await window.git.pr.rerunLatest(activeRepo.path, failedOnly)
      if (res.ok) {
        pushToast('success', failedOnly ? 'Rerunning failed jobs…' : 'Rerunning all jobs…')
        const sha = useRepo.getState().selectedCommit
        if (sha) {
          setTimeout(() => { useRepo.getState().setCiForCommit(sha, null) }, 5000)
        }
      } else {
        pushToast('error', `Rerun failed: ${res.stderr}`)
      }
    } finally {
      setRerunning(null)
    }
  }

  const openExternal = (url: string | undefined): void => {
    if (!url) return
    void window.git.shell.openExternal(url)
  }

  if (!commitDetail) {
    return (
      <div className="h-full flex items-center justify-center text-muted text-xs">
        Loading station details…
      </div>
    )
  }

  const tags = refsForCommit.filter((r) => r.fullName.startsWith('refs/tags/'))

  const ciInfo = ciByCommit[commitDetail.hash]
  const ciLoading = !!ciCommitLoading[commitDetail.hash]
  const ciStyle = ciInfo ? ROLLUP_STYLES[ciInfo.rollup] : null
  const CiIcon = ciStyle?.icon ?? null
  const firstCheckUrl = ciInfo?.checks.find((c) => !!c.url)?.url
  const firstPrUrl = ciInfo?.pulls[0]?.url
  const showCiRow =
    ciAvailable !== false &&
    (ciLoading || (!!ciInfo && ciInfo.checks.length > 0))
  const showPrSection =
    ciAvailable !== false &&
    (ciLoading || (!!ciInfo && ciInfo.pulls.length > 0))
  const viewRunUrl =
    (ciInfo?.pulls[0]
      ? `${ciInfo.pulls[0].url}/checks`
      : undefined) ??
    firstCheckUrl ??
    firstPrUrl

  return (
    <div className="h-full flex flex-col bg-bg-panel/30">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-line flex items-center justify-between shrink-0">
        <span className="text-[11px] uppercase tracking-wider text-muted font-medium">
          Station Details
        </span>
        <button
          onClick={() => setSelectedCommit(null)}
          className="text-muted hover:text-text"
          title="Close (Esc)"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Title + hash */}
        <div className="px-3 py-3 border-b border-line">
          <div className="flex items-start gap-2 mb-2">
            <div
              className="w-7 h-7 rounded-full bg-accent/15 border-2 border-accent shrink-0 flex items-center justify-center mt-0.5"
            >
              <span className="w-2 h-2 rounded-full bg-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold leading-snug">{commitDetail.subject}</div>
              <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted">
                <span className="font-mono">{commitDetail.shortHash}</span>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(commitDetail.hash)
                    pushToast('success', 'Hash copied')
                  }}
                  className="hover:text-text"
                  title="Copy full hash"
                >
                  <Copy size={11} />
                </button>
              </div>
            </div>
          </div>

          {/* Author + date */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line/60">
            <Avatar email={commitDetail.email} author={commitDetail.author} size={28} />
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium truncate">{commitDetail.author}</span>
              <span className="text-[11px] text-muted truncate">{commitDetail.email}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-3 text-[11px]">
            <Meta label="Date" value={commitDetail.relativeDate} />
            {branchLineRef && (
              <Meta
                label="Branch Line"
                value={branchLineRef.name}
                color="#5b8cff"
              />
            )}
            {showCiRow && (
              <Meta
                label="CI Status"
                value={
                  ciLoading
                    ? 'Loading…'
                    : ciInfo
                      ? CI_LABELS[ciInfo.rollup]
                      : '—'
                }
                icon={
                  ciLoading ? (
                    <RefreshCw size={11} className="animate-spin text-muted" />
                  ) : CiIcon && ciStyle ? (
                    <CiIcon size={11} className={ciStyle.text} />
                  ) : undefined
                }
                right={
                  viewRunUrl ? (
                    <button
                      onClick={() => openExternal(viewRunUrl)}
                      className="text-accent hover:text-accent-hover text-[10px] inline-flex items-center gap-0.5"
                    >
                      View Run <ExternalLink size={9} />
                    </button>
                  ) : undefined
                }
              />
            )}
            <Meta
              label="Parents"
              value={
                commitDetail.parents.length === 0
                  ? 'root commit'
                  : commitDetail.parents.map((p) => p.slice(0, 7)).join(', ')
              }
            />
          </div>
        </div>

        {/* CI check details (only when there's something to show) */}
        {ciAvailable !== false && ciInfo && ciInfo.checks.length > 0 && (
          <CiChecksSection
            ciInfo={ciInfo}
            ciStyle={ciStyle}
            rerunning={rerunning}
            onOpen={openExternal}
            onRerun={handleRerun}
            onRerunLatest={handleRerunLatest}
          />
        )}

        {/* Files changed */}
        <section className="border-b border-line">
          <SectionHeader title="Files Changed" count={commitDetail.files.length} />
          <div>
            {commitDetail.files.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-muted italic">No file changes</div>
            ) : (
              commitDetail.files.slice(0, 8).map((f) => {
                const badge = fileBadge(f.status)
                const isSelected = selectedCommitFile === f.path
                return (
                  <div
                    key={f.path}
                    onClick={() => {
                      setSelectedCommitFile(f.path)
                      // Trigger overlay-diff via selectedFile (cleaner for the overlay logic)
                      setSelectedFile({ path: f.path, staged: false })
                    }}
                    className={
                      'group flex items-center gap-2 px-3 py-1 text-[12px] cursor-pointer ' +
                      (isSelected ? 'bg-accent/15 text-text' : 'hover:bg-bg-panel')
                    }
                    title={f.path}
                  >
                    <span className={`font-mono w-3 text-[10px] ${badge.cls}`}>{badge.label}</span>
                    <FileText size={11} className="text-muted shrink-0" />
                    <span className="truncate flex-1 font-mono">{f.path}</span>
                  </div>
                )
              })
            )}
            {commitDetail.files.length > 8 && (
              <div className="px-3 py-1 text-[11px] text-muted">
                + {commitDetail.files.length - 8} more file{commitDetail.files.length - 8 === 1 ? '' : 's'}
              </div>
            )}
          </div>
        </section>

        {/* Commit message body */}
        {commitDetail.body.trim() && (
          <section className="border-b border-line">
            <SectionHeader title="Commit Message" />
            <pre className="px-3 py-2 text-[11px] text-muted whitespace-pre-wrap font-mono">
              {commitDetail.body.trim()}
            </pre>
          </section>
        )}

        {/* Tags */}
        <section className="border-b border-line">
          <SectionHeader title="Tags" />
          {tags.length === 0 ? (
            <div className="px-3 py-1.5 text-[11px] text-muted italic">No tags</div>
          ) : (
            <div className="px-3 py-1.5 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span
                  key={t.fullName}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-warn/15 border border-warn/30 text-warn"
                >
                  <Tag size={9} /> {t.name}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Pull Requests — real data from gh api */}
        {showPrSection && (
          <section className="border-b border-line">
            <SectionHeader title="Pull Requests" count={ciInfo?.pulls.length} />
            {!ciInfo && ciLoading ? (
              <div className="px-3 py-1.5 text-[11px] text-muted italic flex items-center gap-1">
                <RefreshCw size={10} className="animate-spin" /> Loading…
              </div>
            ) : (
              <div>
                {ciInfo?.pulls.map((p) => (
                  <PrRow key={p.number} pr={p} onOpen={openExternal} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-line shrink-0">
        <button
          onClick={() => {
            const url = firstPrUrl ?? buildGithubCommitUrl(ciInfo?.pulls, commitDetail.hash)
            if (!url) {
              pushToast('info', 'No remote configured for this repo')
              return
            }
            openExternal(url)
          }}
          className="w-full px-3 py-2 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-medium flex items-center justify-center gap-2"
        >
          <Github size={13} />
          <span>{firstPrUrl ? `Open PR #${ciInfo?.pulls[0]?.number}` : 'View on GitHub'}</span>
          <ExternalLink size={11} className="opacity-80" />
        </button>
      </div>
    </div>
  )
}

type CheckMenuState = { x: number; y: number; check: CheckSummary } | null

function CiChecksSection({
  ciInfo,
  ciStyle,
  rerunning,
  onOpen,
  onRerun,
  onRerunLatest
}: {
  ciInfo: CommitChecksInfo
  ciStyle: { text: string; icon: typeof CheckCircle2 } | null
  rerunning: string | null
  onOpen: (url: string | undefined) => void
  onRerun: (runId: string, failedOnly: boolean) => Promise<void>
  onRerunLatest: (failedOnly: boolean) => Promise<void>
}): JSX.Element {
  const [menu, setMenu] = useState<CheckMenuState>(null)

  const allRunIds = [...new Set(ciInfo.checks.map((c) => c.runId).filter(Boolean))] as string[]
  const failedRunIds = [...new Set(
    ciInfo.checks.filter((c) => c.state === 'failure' && c.runId).map((c) => c.runId!)
  )]

  const menuItems = useMemo((): import('./ContextMenu').MenuItem[] => {
    if (!menu) return []
    const { check } = menu
    const items: import('./ContextMenu').MenuItem[] = []
    if (check.url) {
      items.push({ label: 'Open in GitHub', onClick: () => onOpen(check.url) })
    }
    if (items.length > 0) items.push({ type: 'separator' })
    // If we have specific run IDs use them; otherwise fall back to rerunning the
    // most recent run on the current branch via `gh run list`.
    if (failedRunIds.length > 0) {
      items.push({
        label: 'Rerun failed jobs',
        disabled: rerunning !== null,
        onClick: () => { for (const id of failedRunIds) void onRerun(id, true) }
      })
    } else {
      items.push({
        label: 'Rerun failed jobs',
        disabled: rerunning !== null,
        onClick: () => void onRerunLatest(true)
      })
    }
    if (allRunIds.length > 0) {
      items.push({
        label: 'Rerun all jobs',
        disabled: rerunning !== null,
        onClick: () => { for (const id of allRunIds) void onRerun(id, false) }
      })
    } else {
      items.push({
        label: 'Rerun all jobs',
        disabled: rerunning !== null,
        onClick: () => void onRerunLatest(false)
      })
    }
    return items
  }, [menu, failedRunIds, allRunIds, rerunning, onOpen, onRerun, onRerunLatest])

  return (
    <section className="border-b border-line">
      <SectionHeader
        title="CI Checks"
        count={ciInfo.checks.length}
        right={
          <span className={`text-[10px] font-medium ${ciStyle?.text ?? 'text-muted'}`}>
            {CI_LABELS[ciInfo.rollup]}
          </span>
        }
      />
      <div>
        {ciInfo.checks.map((c) => (
          <CheckRow
            key={`${c.kind}:${c.name}`}
            check={c}
            rerunning={rerunning}
            menuOpen={menu?.check === c}
            onOpen={onOpen}
            onContextMenu={(x, y) => setMenu({ x, y, check: c })}
          />
        ))}
      </div>
      {menu && menuItems.length > 0 && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={menuItems}
        />
      )}
    </section>
  )
}

function CheckRow({
  check,
  rerunning,
  menuOpen,
  onOpen,
  onContextMenu
}: {
  check: CheckSummary
  rerunning: string | null
  menuOpen: boolean
  onOpen: (url: string | undefined) => void
  onContextMenu: (x: number, y: number) => void
}): JSX.Element {
  const style = ROLLUP_STYLES[check.state] ?? ROLLUP_STYLES.none
  const Icon = style.icon
  const isThisRerunning =
    rerunning === `failed:${check.runId}` || rerunning === `all:${check.runId}`

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    onContextMenu(e.clientX, e.clientY)
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1 hover:bg-bg-panel cursor-default select-none ${menuOpen ? 'bg-bg-panel' : ''}`}
      title={check.description ?? check.name}
      onContextMenu={handleContextMenu}
    >
      {isThisRerunning
        ? <RotateCcw size={11} className={style.text + ' shrink-0 animate-spin'} />
        : <Icon size={11} className={style.text + ' shrink-0'} />
      }
      <span className="flex-1 truncate text-[11px]">{check.name}</span>
      {check.url && (
        <button
          onClick={() => onOpen(check.url)}
          className="shrink-0"
          title="Open in GitHub"
        >
          <ExternalLink size={9} className="text-muted hover:text-text" />
        </button>
      )}
    </div>
  )
}

function PrRow({
  pr,
  onOpen
}: {
  pr: CommitPullRequestRef
  onOpen: (url: string | undefined) => void
}): JSX.Element {
  const stateCls =
    pr.state === 'MERGED'
      ? 'text-accent'
      : pr.state === 'CLOSED'
        ? 'text-danger'
        : 'text-success'
  return (
    <button
      onClick={() => onOpen(pr.url)}
      className="w-full flex items-center gap-2 px-3 py-1 hover:bg-bg-panel text-left"
      title={pr.title}
    >
      <GitPullRequest size={11} className={`${stateCls} shrink-0`} />
      <span className="font-mono text-[10px] text-muted shrink-0">#{pr.number}</span>
      <span className="flex-1 truncate text-[11px]">{pr.title}</span>
      <ExternalLink size={9} className="text-muted shrink-0" />
    </button>
  )
}

function SectionHeader({
  title,
  count,
  right
}: {
  title: string
  count?: number
  right?: JSX.Element
}): JSX.Element {
  return (
    <div className="px-3 py-1.5 flex items-center justify-between bg-bg-subtle/40 border-b border-line/50">
      <span className="text-[10px] uppercase tracking-wider text-muted font-medium">{title}</span>
      <div className="flex items-center gap-2">
        {count !== undefined && <span className="text-[10px] text-muted font-mono">{count}</span>}
        {right}
      </div>
    </div>
  )
}

function Meta({
  label,
  value,
  color,
  icon,
  right
}: {
  label: string
  value: string
  color?: string
  icon?: JSX.Element
  right?: JSX.Element
}): JSX.Element {
  return (
    <div className="flex items-center min-w-0">
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
        <span
          className="font-mono truncate flex items-center gap-1"
          style={color ? { color } : undefined}
        >
          {icon}
          {value}
        </span>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

/**
 * Best-effort commit URL: if we know an associated PR, GitHub will redirect
 * `<pr-url>/commits/<sha>` to the right place. Returns null when there's no
 * PR context to derive the repo from — caller should toast in that case.
 */
function buildGithubCommitUrl(
  pulls: CommitPullRequestRef[] | undefined,
  sha: string
): string | null {
  const pr = pulls?.[0]
  if (!pr) return null
  // pr.url looks like https://github.com/owner/repo/pull/N — strip the pull
  // segment to get the repo root and append /commit/<sha>.
  const m = pr.url.match(/^(https:\/\/github\.com\/[^/]+\/[^/]+)\//)
  if (!m) return null
  return `${m[1]}/commit/${sha}`
}

const CI_LABELS: Record<CheckRollupState, string> = {
  none: 'No checks',
  pending: 'Pending',
  success: 'Passing',
  failure: 'Failed'
}

interface RollupStyle {
  text: string
  icon: typeof CheckCircle2
}

const ROLLUP_STYLES: Record<CheckRollupState, RollupStyle> = {
  success: { text: 'text-success', icon: CheckCircle2 },
  failure: { text: 'text-danger', icon: XCircle },
  pending: { text: 'text-warn', icon: Clock },
  none: { text: 'text-muted', icon: CircleDashed }
}
