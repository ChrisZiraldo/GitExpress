import { useEffect, useMemo, useState } from 'react'
import { useRepo } from '../store/useRepo'
import type { FileChangeType, FileEntry } from '@shared/types'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { ConflictEditor } from './ConflictEditor'

interface Props {
  onRefresh: () => Promise<void>
}

function changeBadge(entry: FileEntry): { label: string; cls: string } {
  switch (entry.changeType) {
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
    case 'untracked':
      return { label: '?', cls: 'text-muted' }
    case 'unmerged':
      return { label: '!', cls: 'text-danger' }
    case 'ignored':
      return { label: 'I', cls: 'text-muted' }
    default:
      return { label: ' ', cls: 'text-muted' }
  }
}

export function StatusPanel({ onRefresh }: Props): JSX.Element {
  const activeRepo = useRepo((s) => s.activeRepo)
  const status = useRepo((s) => s.status)
  const selectedFile = useRepo((s) => s.selectedFile)
  const setSelectedFile = useRepo((s) => s.setSelectedFile)
  const pushToast = useRepo((s) => s.pushToast)

  // Track which file key (path:staged) is in pending-confirm state for discard
  const [pendingDiscard, setPendingDiscard] = useState<string | null>(null)
  const [conflictFile, setConflictFile] = useState<string | null>(null)

  // Listen for conflict-badge click from the metro map
  useEffect(() => {
    const handler = (): void => {
      const first = useRepo.getState().status?.conflicted[0]?.path
      if (first) setConflictFile(first)
    }
    window.addEventListener('gitmetro:open-conflicts', handler)
    return () => window.removeEventListener('gitmetro:open-conflicts', handler)
  }, [])
  // Right-click context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)

  const unstagedAll = useMemo(
    () => [...(status?.unstaged ?? []), ...(status?.untracked ?? [])],
    [status]
  )
  const stagedAll = status?.staged ?? []
  const conflicted = status?.conflicted ?? []

  if (!activeRepo) return <></>

  const stage = async (paths: string[]): Promise<void> => {
    const res = await window.git.stage.add(activeRepo.path, paths)
    if (!res.ok) pushToast('error', `Stage failed: ${res.stderr}`)
    await onRefresh()
  }

  const unstage = async (paths: string[]): Promise<void> => {
    const res = await window.git.stage.reset(activeRepo.path, paths)
    if (!res.ok) pushToast('error', `Unstage failed: ${res.stderr}`)
    await onRefresh()
  }

  const discard = async (
    path: string,
    staged: boolean,
    changeType: FileChangeType
  ): Promise<void> => {
    const key = `${path}:${staged}`
    if (pendingDiscard !== key) {
      setPendingDiscard(key)
      setTimeout(() => setPendingDiscard((cur) => (cur === key ? null : cur)), 3000)
      return
    }
    setPendingDiscard(null)
    const res = await window.git.stage.discard(activeRepo.path, path, staged, changeType)
    if (!res.ok) pushToast('error', `Discard failed: ${res.stderr}`)
    else pushToast('info', `Discarded ${path}`)
    if (selectedFile?.path === path) setSelectedFile(null)
    await onRefresh()
  }

  const select = (path: string, staged: boolean): void => {
    setPendingDiscard(null)
    setSelectedFile({ path, staged })
  }

  const isSelected = (path: string, staged: boolean): boolean =>
    selectedFile?.path === path && selectedFile?.staged === staged

  const discardKey = (path: string, staged: boolean): string => `${path}:${staged}`

  const openFileContextMenu = (e: React.MouseEvent, entry: FileEntry): void => {
    e.preventDefault()
    e.stopPropagation()
    const fullPath = `${activeRepo.path}/${entry.path}`
    const items: MenuItem[] = [
      entry.staged
        ? { label: 'Unstage', onClick: () => unstage([entry.path]) }
        : { label: 'Stage', onClick: () => stage([entry.path]) },
      {
        label:
          entry.changeType === 'untracked'
            ? 'Delete file'
            : entry.staged
              ? 'Discard staged changes'
              : 'Discard changes',
        danger: true,
        onClick: () => discard(entry.path, entry.staged, entry.changeType)
      },
      { type: 'separator' },
      {
        label: 'Stash this file',
        disabled: entry.staged,
        onClick: () => {
          window.dispatchEvent(
            new CustomEvent('gitmetro:stash-files', { detail: { paths: [entry.path] } })
          )
        }
      },
      { type: 'separator' },
      {
        label: 'Open in editor',
        onClick: () => window.git.shell.openPath(fullPath)
      },
      {
        label: 'Show in Finder',
        onClick: () => window.git.shell.revealInFolder(fullPath)
      },
      { type: 'separator' },
      {
        label: 'Copy file path',
        onClick: () => navigator.clipboard.writeText(entry.path)
      },
      {
        label: 'Copy full path',
        onClick: () => navigator.clipboard.writeText(fullPath)
      },
      { type: 'separator' },
      {
        label: 'Add to .gitignore',
        onClick: async () => {
          const res = await window.git.gitignore.append(activeRepo.path, entry.path)
          if (res.ok) {
            useRepo.getState().pushToast('success', `Added ${entry.path} to .gitignore`)
            useRepo.getState().refreshSignal()
          } else {
            useRepo.getState().pushToast('error', `Failed: ${res.stderr}`)
          }
        }
      }
    ]
    setCtxMenu({ x: e.clientX, y: e.clientY, items })
  }

  // Merge continue / abort helpers
  const mergeContinue = async (): Promise<void> => {
    if (!activeRepo) return
    const res = await window.git.conflict.mergeContinue(activeRepo.path)
    if (res.ok) { useRepo.getState().pushToast('success', 'Merge continued'); useRepo.getState().refreshSignal() }
    else useRepo.getState().pushToast('error', `Merge continue failed: ${res.stderr}`)
  }
  const mergeAbort = async (): Promise<void> => {
    if (!activeRepo) return
    const res = await window.git.conflict.mergeAbort(activeRepo.path)
    if (res.ok) { useRepo.getState().pushToast('info', 'Merge aborted'); useRepo.getState().refreshSignal() }
    else useRepo.getState().pushToast('error', `Merge abort failed: ${res.stderr}`)
  }

  if (conflictFile) {
    return (
      <div className="flex-1 min-h-0">
        <ConflictEditor
          filePath={conflictFile}
          onClose={() => setConflictFile(null)}
          onResolved={() => setConflictFile(null)}
        />
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {conflicted.length > 0 && (
        <Section
          title={`Conflicts (${conflicted.length})`}
          accent="danger"
          headerExtra={
            <div className="flex gap-1">
              <button
                onClick={() => void mergeContinue()}
                className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success border border-success/30 hover:bg-success/25"
                title="Continue merge (all conflicts must be resolved)"
              >Continue</button>
              <button
                onClick={() => void mergeAbort()}
                className="text-[10px] px-1.5 py-0.5 rounded bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25"
                title="Abort merge"
              >Abort</button>
            </div>
          }
        >
          {conflicted.map((f) => (
            <FileRow
              key={`c-${f.path}`}
              entry={f}
              selected={isSelected(f.path, false)}
              onClick={() => setConflictFile(f.path)}
              actionLabel="Stage"
              onAction={() => stage([f.path])}
              confirming={pendingDiscard === discardKey(f.path, false)}
              onDiscard={() => discard(f.path, false, f.changeType)}
              onContextMenu={(e) => openFileContextMenu(e, f)}
            />
          ))}
        </Section>
      )}

      <Section
        title={`Changes (${unstagedAll.length})`}
        actionLabel={unstagedAll.length > 0 ? 'Stage all' : undefined}
        onAction={
          unstagedAll.length > 0
            ? () => stage(unstagedAll.map((f) => f.path))
            : undefined
        }
      >
        {unstagedAll.length === 0 ? (
          <Empty text="Working tree clean" />
        ) : (
          unstagedAll.map((f) => (
            <FileRow
              key={`u-${f.path}`}
              entry={f}
              selected={isSelected(f.path, false)}
              onClick={() => select(f.path, false)}
              actionLabel="Stage"
              onAction={() => stage([f.path])}
              confirming={pendingDiscard === discardKey(f.path, false)}
              onDiscard={() => discard(f.path, false, f.changeType)}
              onContextMenu={(e) => openFileContextMenu(e, f)}
            />
          ))
        )}
      </Section>

      <Section
        title={`Staged (${stagedAll.length})`}
        actionLabel={stagedAll.length > 0 ? 'Unstage all' : undefined}
        onAction={
          stagedAll.length > 0
            ? () => unstage(stagedAll.map((f) => f.path))
            : undefined
        }
      >
        {stagedAll.length === 0 ? (
          <Empty text="No staged changes" />
        ) : (
          stagedAll.map((f) => (
            <FileRow
              key={`s-${f.path}`}
              entry={f}
              selected={isSelected(f.path, true)}
              onClick={() => select(f.path, true)}
              actionLabel="Unstage"
              onAction={() => unstage([f.path])}
              confirming={pendingDiscard === discardKey(f.path, true)}
              onDiscard={() => discard(f.path, true, f.changeType)}
              onContextMenu={(e) => openFileContextMenu(e, f)}
            />
          ))
        )}
      </Section>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}

interface SectionProps {
  title: string
  accent?: 'danger'
  actionLabel?: string
  onAction?: () => void
  headerExtra?: React.ReactNode
  children: React.ReactNode
}

function Section({ title, accent, actionLabel, onAction, headerExtra, children }: SectionProps): JSX.Element {
  return (
    <div className="flex-1 min-h-0 flex flex-col border-b border-line last:border-b-0">
      <div className="h-7 px-3 flex items-center justify-between bg-bg-subtle border-b border-line">
        <span
          className={
            'text-xs uppercase tracking-wide ' +
            (accent === 'danger' ? 'text-danger' : 'text-muted')
          }
        >
          {title}
        </span>
        <div className="flex items-center gap-2">
          {headerExtra}
          {actionLabel && onAction && (
            <button
              onClick={onAction}
              className="text-xs text-accent hover:text-accent-hover"
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}

interface FileRowProps {
  entry: FileEntry
  selected: boolean
  onClick: () => void
  actionLabel: string
  onAction: () => void
  confirming: boolean
  onDiscard: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

function FileRow({
  entry,
  selected,
  onClick,
  actionLabel,
  onAction,
  confirming,
  onDiscard,
  onContextMenu
}: FileRowProps): JSX.Element {
  const badge = changeBadge(entry)
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={
        'group flex items-center px-3 py-1 text-sm cursor-pointer ' +
        (selected ? 'bg-accent/20' : 'hover:bg-bg-panel')
      }
      title={entry.path}
    >
      <span className={`font-mono w-4 text-xs ${badge.cls}`}>{badge.label}</span>
      <span className="ml-2 flex-1 truncate">{entry.path}</span>

      {/* Stage / Unstage action */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onAction()
        }}
        className="ml-1 opacity-0 group-hover:opacity-100 text-xs text-accent hover:text-accent-hover"
      >
        {actionLabel}
      </button>

      {/* Discard button — two-click confirm */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDiscard()
        }}
        className={
          'ml-1 text-xs ' +
          (confirming
            ? 'opacity-100 text-danger font-semibold animate-pulse'
            : 'opacity-0 group-hover:opacity-100 text-muted hover:text-danger')
        }
        title={
          confirming
            ? 'Click again to permanently discard changes'
            : entry.changeType === 'untracked'
              ? 'Delete file'
              : entry.staged
                ? 'Discard staged changes (restores to HEAD)'
                : 'Discard changes (restores to HEAD)'
        }
      >
        {confirming ? 'Confirm?' : '✕'}
      </button>
    </div>
  )
}

function Empty({ text }: { text: string }): JSX.Element {
  return <div className="px-3 py-2 text-xs text-muted italic">{text}</div>
}
