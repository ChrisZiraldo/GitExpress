import { useEffect, useMemo } from 'react'
import {
  Copy,
  X,
  XCircle,
  ExternalLink,
  Github,
  Tag,
  FileText
} from 'lucide-react'
import type { CommitFileStatus } from '@shared/types'
import { useRepo } from '../store/useRepo'
import { Avatar } from './Avatar'

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

  if (!commitDetail) {
    return (
      <div className="h-full flex items-center justify-center text-muted text-xs">
        Loading station details…
      </div>
    )
  }

  const tags = refsForCommit.filter((r) => r.fullName.startsWith('refs/tags/'))

  const githubUrl = buildGithubUrl(activeRepo?.path, commitDetail.hash)

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
            <Meta
              label="CI Status"
              value="Failed"
              icon={<XCircle size={11} className="text-danger" />}
              right={
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); pushToast('info', 'CI integration coming soon') }}
                  className="text-accent hover:text-accent-hover text-[10px] inline-flex items-center gap-0.5"
                >
                  View Run <ExternalLink size={9} />
                </a>
              }
            />
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

        {/* PRs (placeholder until real integration) */}
        <section className="border-b border-line">
          <SectionHeader title="Pull Requests" />
          <div className="px-3 py-1.5 text-[11px] text-muted italic">
            PR integration coming soon
          </div>
        </section>

        {/* Related issues (placeholder) */}
        <section className="border-b border-line">
          <SectionHeader title="Related Issues" />
          <div className="px-3 py-1.5 text-[11px] text-muted italic">
            Issue integration coming soon
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-line shrink-0">
        <a
          href={githubUrl ?? '#'}
          onClick={(e) => {
            if (!githubUrl) {
              e.preventDefault()
              pushToast('info', 'No remote configured for this repo')
            }
          }}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full px-3 py-2 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-medium flex items-center justify-center gap-2"
        >
          <Github size={13} />
          <span>View on GitHub</span>
          <ExternalLink size={11} className="opacity-80" />
        </a>
      </div>
    </div>
  )
}

function SectionHeader({ title, count }: { title: string; count?: number }): JSX.Element {
  return (
    <div className="px-3 py-1.5 flex items-center justify-between bg-bg-subtle/40 border-b border-line/50">
      <span className="text-[10px] uppercase tracking-wider text-muted font-medium">{title}</span>
      {count !== undefined && <span className="text-[10px] text-muted font-mono">{count}</span>}
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

function buildGithubUrl(path: string | undefined, commitHash: string): string | null {
  if (!path) return null
  // Try to read GIT remote URL from the renderer side via window.git — we don't have a
  // synchronous API for that, so fall back to a heuristic: assume github.com/<segment>
  // The user can configure something better later; this is just a sane default.
  // For now return null — the button will toast instead.
  void commitHash
  return null
}
