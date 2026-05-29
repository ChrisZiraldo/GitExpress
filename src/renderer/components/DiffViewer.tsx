import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRepo } from '../store/useRepo'
import {
  buildHunkPatch,
  buildLineSubsetPatch,
  parseDiff,
  type DiffFile,
  type DiffHunk,
  type DiffLine
} from '../utils/diffHunks'

interface DiffViewerProps {
  onClose?: () => void
}

type ApplyAction = 'stage' | 'unstage' | 'discard'

export function DiffViewer({ onClose }: DiffViewerProps = {}): JSX.Element {
  const activeRepo = useRepo((s) => s.activeRepo)
  const selectedFile = useRepo((s) => s.selectedFile)
  const stashView = useRepo((s) => s.stashView)
  const diff = useRepo((s) => s.diff)
  const diffLoading = useRepo((s) => s.diffLoading)
  const setDiff = useRepo((s) => s.setDiff)
  const setDiffLoading = useRepo((s) => s.setDiffLoading)
  const pushToast = useRepo((s) => s.pushToast)
  const setBusy = useRepo((s) => s.setBusy)
  const refreshSignal = useRepo((s) => s.refreshSignal)
  const status = useRepo((s) => s.status)

  const isStash = stashView !== null
  const headerPath = isStash ? stashView!.filePath : selectedFile?.path ?? null

  // ── Fetch the diff whenever the selection or repo state changes ────────
  useEffect(() => {
    if (!activeRepo) {
      setDiff('')
      return
    }
    let cancelled = false

    const fetchDiff = async (): Promise<void> => {
      setDiffLoading(true)
      try {
        let res: { ok: true; data: string } | { ok: false; stderr: string }
        if (isStash && stashView) {
          res = await window.git.stash.fileDiff(
            activeRepo.path,
            stashView.stashIndex,
            stashView.filePath
          )
        } else if (selectedFile) {
          res = await window.git.diff.file(activeRepo.path, {
            path: selectedFile.path,
            staged: selectedFile.staged
          })
        } else {
          setDiff('')
          return
        }
        if (cancelled) return
        if (res.ok) setDiff(res.data)
        else {
          setDiff('')
          pushToast('error', `Diff failed: ${res.stderr}`)
        }
      } finally {
        if (!cancelled) setDiffLoading(false)
      }
    }

    void fetchDiff()
    return () => {
      cancelled = true
    }
  }, [activeRepo, selectedFile, stashView, isStash, status, setDiff, setDiffLoading, pushToast])

  // ── Esc handling (clears selection first, then closes the panel) ──────
  // We use a ref so the keydown handler can read the current selection
  // without forcing the effect to re-bind on every selection change.
  const selectedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (selectedRef.current.size > 0) {
        setSelected(new Set())
        return
      }
      if (onClose) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // ── Parse the diff into a structured tree ──────────────────────────────
  const files = useMemo<DiffFile[]>(() => parseDiff(diff), [diff])
  const file = files[0] ?? null

  // Hunk-level / line-level actions only make sense for tracked working-tree
  // / staged files.  Stash diffs, untracked, unmerged are read-only.
  const fileEntry = useMemo(() => {
    if (!status || !selectedFile) return null
    const pool = selectedFile.staged ? status.staged : [...status.unstaged, ...status.untracked]
    return pool.find((f) => f.path === selectedFile.path) ?? null
  }, [status, selectedFile])

  const actionsEnabled =
    !isStash &&
    !!selectedFile &&
    !!fileEntry &&
    fileEntry.changeType !== 'untracked' &&
    fileEntry.changeType !== 'ignored' &&
    fileEntry.changeType !== 'unmerged'

  const stagedDiff = !!selectedFile?.staged

  // ── Selection state ─────────────────────────────────────────────────────
  // Keys are `"<hunkIndex>:<lineIndex>"` strings; only `add`/`del` lines are
  // ever selectable (context is meaningless here).
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const lastClickKeyRef = useRef<string | null>(null)
  // Mirror `selected` into a ref so window-level keyboard handlers can read
  // the latest value without re-binding on every change.
  selectedRef.current = selected

  // Drop any selection when the user navigates to a different file or diff.
  useEffect(() => {
    setSelected(new Set())
    lastClickKeyRef.current = null
  }, [selectedFile?.path, selectedFile?.staged, stashView?.stashIndex, stashView?.filePath])

  // Stale selection cleanup: keep only keys that still point at change lines.
  useEffect(() => {
    if (!file || selected.size === 0) return
    const valid = new Set<string>()
    for (let hi = 0; hi < file.hunks.length; hi++) {
      for (let li = 0; li < file.hunks[hi].lines.length; li++) {
        const ln = file.hunks[hi].lines[li]
        if (ln.kind !== 'add' && ln.kind !== 'del') continue
        const key = `${hi}:${li}`
        if (selected.has(key)) valid.add(key)
      }
    }
    if (valid.size !== selected.size) setSelected(valid)
  }, [file, selected])

  // ── Pending-action tracking (one in-flight at a time) ──────────────────
  const [pending, setPending] = useState<{
    scope: 'hunk' | 'lines'
    action: ApplyAction
    hunkIndex?: number
  } | null>(null)
  const [discardArmed, setDiscardArmed] = useState<{
    scope: 'hunk' | 'lines'
    hunkIndex?: number
  } | null>(null)
  const discardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearDiscardArm = useCallback((): void => {
    if (discardTimerRef.current) {
      clearTimeout(discardTimerRef.current)
      discardTimerRef.current = null
    }
    setDiscardArmed(null)
  }, [])

  useEffect(() => () => {
    if (discardTimerRef.current) clearTimeout(discardTimerRef.current)
  }, [])

  // Clear arming when the user changes selection or navigates away.
  useEffect(() => {
    clearDiscardArm()
  }, [selectedFile?.path, selectedFile?.staged, clearDiscardArm])

  // ── Line click (toggle / range / additive) ─────────────────────────────
  const onLineClick = useCallback(
    (hunkIndex: number, lineIndex: number, ev: React.MouseEvent): void => {
      if (!file || !actionsEnabled) return
      const hunk = file.hunks[hunkIndex]
      const ln = hunk?.lines[lineIndex]
      if (!ln || (ln.kind !== 'add' && ln.kind !== 'del')) return

      const key = `${hunkIndex}:${lineIndex}`
      const additive = ev.metaKey || ev.ctrlKey
      const range = ev.shiftKey && lastClickKeyRef.current !== null

      setSelected((prev) => {
        const next = new Set(prev)

        if (range) {
          const last = lastClickKeyRef.current!
          const want = !prev.has(key) ? true : false
          const between = collectChangeKeysBetween(file, last, key)
          for (const k of between) {
            if (want) next.add(k)
            else next.delete(k)
          }
          return next
        }

        if (additive) {
          if (next.has(key)) next.delete(key)
          else next.add(key)
          return next
        }

        // Plain click: toggle just this one.
        if (next.has(key) && next.size === 1) next.delete(key)
        else {
          next.clear()
          next.add(key)
        }
        return next
      })
      lastClickKeyRef.current = key
    },
    [file, actionsEnabled]
  )

  // ── Apply a patch + refresh ────────────────────────────────────────────
  const applyPatch = useCallback(
    async (
      action: ApplyAction,
      patch: string,
      scopeLabel: string,
      onDone?: () => void
    ): Promise<void> => {
      if (!activeRepo || !patch) return
      setBusy(true)
      try {
        const cwd = activeRepo.path
        const res =
          action === 'stage'
            ? await window.git.hunk.stage(cwd, patch)
            : action === 'unstage'
              ? await window.git.hunk.unstage(cwd, patch)
              : await window.git.hunk.discard(cwd, patch)
        if (res.ok) {
          const verb =
            action === 'stage' ? 'Staged' : action === 'unstage' ? 'Unstaged' : 'Discarded'
          pushToast('success', `${verb} ${scopeLabel}`)
          onDone?.()
          refreshSignal()
        } else {
          pushToast('error', `${action} failed: ${res.stderr}`)
        }
      } finally {
        setBusy(false)
      }
    },
    [activeRepo, pushToast, refreshSignal, setBusy]
  )

  // ── Hunk action handler ────────────────────────────────────────────────
  const runHunkAction = useCallback(
    async (hunkIndex: number, action: ApplyAction): Promise<void> => {
      if (!file || pending) return

      if (action === 'discard') {
        const armed = discardArmed
        if (!armed || armed.scope !== 'hunk' || armed.hunkIndex !== hunkIndex) {
          if (discardTimerRef.current) clearTimeout(discardTimerRef.current)
          setDiscardArmed({ scope: 'hunk', hunkIndex })
          discardTimerRef.current = setTimeout(() => {
            setDiscardArmed((cur) =>
              cur?.scope === 'hunk' && cur.hunkIndex === hunkIndex ? null : cur
            )
            discardTimerRef.current = null
          }, 2500)
          return
        }
      }

      clearDiscardArm()
      setPending({ scope: 'hunk', action, hunkIndex })
      try {
        const patch = buildHunkPatch(file, hunkIndex)
        await applyPatch(action, patch, `hunk in ${file.path || 'file'}`)
      } finally {
        setPending(null)
      }
    },
    [file, pending, discardArmed, clearDiscardArm, applyPatch]
  )

  // ── Selection-bar action handler ───────────────────────────────────────
  const runLinesAction = useCallback(
    async (action: ApplyAction): Promise<void> => {
      if (!file || pending) return
      if (selected.size === 0) return

      if (action === 'discard') {
        const armed = discardArmed
        if (!armed || armed.scope !== 'lines') {
          if (discardTimerRef.current) clearTimeout(discardTimerRef.current)
          setDiscardArmed({ scope: 'lines' })
          discardTimerRef.current = setTimeout(() => {
            setDiscardArmed((cur) => (cur?.scope === 'lines' ? null : cur))
            discardTimerRef.current = null
          }, 2500)
          return
        }
      }

      clearDiscardArm()
      setPending({ scope: 'lines', action })
      try {
        // 'stage' is a forward apply; 'unstage' and 'discard' are reverse —
        // they need a patch whose POST-image matches the index/worktree, so
        // unselected `+` lines stay as context instead of being dropped.
        const mode = action === 'stage' ? 'forward' : 'reverse'
        const { patch, changeCount } = buildLineSubsetPatch(file, selected, mode)
        if (!patch) {
          pushToast('error', 'No applicable lines selected')
          return
        }
        await applyPatch(
          action,
          patch,
          `${changeCount} line${changeCount === 1 ? '' : 's'}`,
          () => setSelected(new Set())
        )
      } finally {
        setPending(null)
      }
    },
    [file, pending, selected, discardArmed, clearDiscardArm, applyPatch, pushToast]
  )

  // ── Stash file actions (unchanged) ─────────────────────────────────────
  const applyStashFile = useCallback(async (): Promise<void> => {
    if (!activeRepo || !stashView) return
    setBusy(true)
    try {
      const res = await window.git.stash.applyFile(
        activeRepo.path,
        stashView.stashIndex,
        stashView.filePath
      )
      if (res.ok) {
        pushToast('success', `Applied ${stashView.filePath} from stash`)
        refreshSignal()
      } else {
        pushToast('error', `Apply failed: ${res.stderr}`)
      }
    } finally {
      setBusy(false)
    }
  }, [activeRepo, stashView, setBusy, pushToast, refreshSignal])

  if (!headerPath) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-muted text-sm">
        Select a file to view its diff
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col relative">
      <div className="h-8 px-3 flex items-center bg-bg-subtle border-b border-line text-xs gap-2 shrink-0">
        {isStash && stashView ? (
          <>
            <span className="text-muted shrink-0">📦 stash@{'{' + stashView.stashIndex + '}'}</span>
            <span className="text-line shrink-0">·</span>
            <span className="font-mono truncate flex-1">{stashView.filePath}</span>
            <button
              onClick={() => void applyStashFile()}
              className="shrink-0 px-2 py-0.5 rounded bg-accent/20 text-accent hover:bg-accent/30 text-xs"
              title="Apply this file to working tree"
            >
              Apply this file
            </button>
          </>
        ) : (
          selectedFile && (
            <>
              <span className="font-mono truncate flex-1">{selectedFile.path}</span>
              <span className="text-muted shrink-0">
                {selectedFile.staged ? 'staged' : 'working tree'}
              </span>
            </>
          )
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="shrink-0 ml-1 text-muted hover:text-text text-base leading-none"
            title="Close diff (Escape)"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto diff-target">
        {diffLoading ? (
          <div className="p-4 text-muted text-sm">Loading diff…</div>
        ) : !file ? (
          <div className="p-4 text-muted text-sm italic">No textual diff available.</div>
        ) : (
          <div className="p-3 d2h-wrapper">
            <div className="d2h-file-wrapper">
              <table className="d2h-diff-table w-full">
                <tbody className="d2h-diff-tbody">
                  {file.hunks.map((hunk, hi) => (
                    <HunkSection
                      key={hi}
                      hunk={hunk}
                      hunkIndex={hi}
                      selectedKeys={selected}
                      actionsEnabled={actionsEnabled}
                      stagedDiff={stagedDiff}
                      pendingHunkIndex={
                        pending?.scope === 'hunk' && pending.action ? pending.hunkIndex : undefined
                      }
                      pendingAction={pending?.scope === 'hunk' ? pending.action : undefined}
                      discardArmedHunkIndex={
                        discardArmed?.scope === 'hunk' ? discardArmed.hunkIndex : undefined
                      }
                      onLineClick={onLineClick}
                      onHunkAction={runHunkAction}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {selected.size > 0 && actionsEnabled && (
        <SelectionBar
          count={selected.size}
          stagedDiff={stagedDiff}
          pending={pending?.scope === 'lines' ? pending.action : null}
          discardArmed={discardArmed?.scope === 'lines'}
          onAction={runLinesAction}
          onClear={() => {
            setSelected(new Set())
            clearDiscardArm()
          }}
        />
      )}
    </div>
  )
}

// ── Hunk section ─────────────────────────────────────────────────────────

interface HunkSectionProps {
  hunk: DiffHunk
  hunkIndex: number
  selectedKeys: Set<string>
  actionsEnabled: boolean
  stagedDiff: boolean
  pendingAction: ApplyAction | undefined
  pendingHunkIndex: number | undefined
  discardArmedHunkIndex: number | undefined
  onLineClick: (hunkIndex: number, lineIndex: number, ev: React.MouseEvent) => void
  onHunkAction: (hunkIndex: number, action: ApplyAction) => void
}

function HunkSection({
  hunk,
  hunkIndex,
  selectedKeys,
  actionsEnabled,
  stagedDiff,
  pendingAction,
  pendingHunkIndex,
  discardArmedHunkIndex,
  onLineClick,
  onHunkAction
}: HunkSectionProps): JSX.Element {
  const isPending = pendingHunkIndex === hunkIndex
  const isDiscardArmed = discardArmedHunkIndex === hunkIndex
  const pendingLabel =
    isPending && pendingAction
      ? pendingAction === 'stage'
        ? 'Staging…'
        : pendingAction === 'unstage'
          ? 'Unstaging…'
          : 'Discarding…'
      : null

  return (
    <>
      <tr>
        <td className="d2h-code-linenumber d2h-info" />
        <td className="d2h-info">
          <div className="d2h-code-line flex items-center justify-between gap-2">
            <span className="truncate">{hunk.header}</span>
            {actionsEnabled && (
              <span className="shrink-0 inline-flex gap-1.5 items-center">
                {stagedDiff ? (
                  <HunkButton
                    label={pendingLabel ?? 'Unstage Hunk'}
                    title="Move just this hunk back out of the index"
                    tone="warn"
                    disabled={isPending}
                    onClick={() => onHunkAction(hunkIndex, 'unstage')}
                  />
                ) : (
                  <>
                    <HunkButton
                      label={
                        isDiscardArmed
                          ? 'Confirm Discard?'
                          : pendingLabel && pendingAction === 'discard'
                            ? pendingLabel
                            : 'Discard Hunk'
                      }
                      title="Revert this hunk in the working tree (cannot be undone)"
                      tone="danger"
                      disabled={isPending}
                      onClick={() => onHunkAction(hunkIndex, 'discard')}
                    />
                    <HunkButton
                      label={
                        pendingLabel && pendingAction === 'stage' ? pendingLabel : 'Stage Hunk'
                      }
                      title="Stage just this hunk to the index"
                      tone="accent"
                      disabled={isPending}
                      onClick={() => onHunkAction(hunkIndex, 'stage')}
                    />
                  </>
                )}
              </span>
            )}
          </div>
        </td>
      </tr>
      {hunk.lines.map((ln, li) => (
        <LineRow
          key={li}
          line={ln}
          selectable={actionsEnabled && (ln.kind === 'add' || ln.kind === 'del')}
          selected={selectedKeys.has(`${hunkIndex}:${li}`)}
          onClick={(ev) => onLineClick(hunkIndex, li, ev)}
        />
      ))}
    </>
  )
}

// ── Single line ──────────────────────────────────────────────────────────

interface LineRowProps {
  line: DiffLine
  selectable: boolean
  selected: boolean
  onClick: (ev: React.MouseEvent) => void
}

function LineRow({ line, selectable, selected, onClick }: LineRowProps): JSX.Element {
  if (line.kind === 'noeol') {
    return (
      <tr>
        <td className="d2h-code-linenumber d2h-info" />
        <td className="d2h-info">
          <div className="d2h-code-line text-muted italic">
            <span className="d2h-code-line-prefix"> </span>
            <span className="d2h-code-line-ctn">\ {line.content}</span>
          </div>
        </td>
      </tr>
    )
  }

  const sideClass =
    line.kind === 'add' ? 'd2h-ins' : line.kind === 'del' ? 'd2h-del' : 'd2h-cntx'
  const marker = line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '
  const oldNum = line.oldNum?.toString() ?? ''
  const newNum = line.newNum?.toString() ?? ''

  const handleClick = selectable ? onClick : undefined
  const gutterStyle: React.CSSProperties = {
    cursor: selectable ? 'pointer' : 'default',
    userSelect: 'none'
  }
  const rowClass = selected ? 'simplegit-line-selected' : undefined

  return (
    <tr className={rowClass}>
      <td
        className={'d2h-code-linenumber ' + sideClass}
        onClick={handleClick}
        style={gutterStyle}
        title={
          selectable
            ? 'Click to select line · ⇧ click to extend · ⌘/Ctrl click to add'
            : undefined
        }
      >
        <div className="line-num1">{oldNum}</div>
        <div className="line-num2">{newNum}</div>
      </td>
      <td className={sideClass}>
        <div className="d2h-code-line">
          <span
            className="d2h-code-line-prefix"
            onClick={handleClick}
            style={gutterStyle}
          >
            {marker}
          </span>
          <span className="d2h-code-line-ctn">{line.content}</span>
        </div>
      </td>
    </tr>
  )
}

// ── Hunk action button (inline, in the @@ header) ────────────────────────

interface HunkButtonProps {
  label: string
  title: string
  tone: 'accent' | 'danger' | 'warn'
  disabled: boolean
  onClick: () => void
}

const HUNK_BTN_PALETTE: Record<HunkButtonProps['tone'], string> = {
  accent: 'bg-accent/20 text-accent hover:bg-accent/30',
  danger: 'bg-danger/15 text-danger hover:bg-danger/25',
  warn: 'bg-warn/20 text-warn hover:bg-warn/30'
}

function HunkButton({ label, title, tone, disabled, onClick }: HunkButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!disabled) onClick()
      }}
      disabled={disabled}
      title={title}
      className={
        'px-2 py-0.5 rounded text-[11px] font-medium transition-opacity disabled:opacity-50 ' +
        HUNK_BTN_PALETTE[tone]
      }
    >
      {label}
    </button>
  )
}

// ── Floating selection action bar (bottom-right) ─────────────────────────

interface SelectionBarProps {
  count: number
  stagedDiff: boolean
  pending: ApplyAction | null
  discardArmed: boolean
  onAction: (action: ApplyAction) => void
  onClear: () => void
}

function SelectionBar({
  count,
  stagedDiff,
  pending,
  discardArmed,
  onAction,
  onClear
}: SelectionBarProps): JSX.Element {
  const verbing =
    pending === 'stage'
      ? 'Staging…'
      : pending === 'unstage'
        ? 'Unstaging…'
        : pending === 'discard'
          ? 'Discarding…'
          : null

  return (
    <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2 bg-bg-panel border border-line rounded-md shadow-xl px-3 py-1.5">
      <span className="text-xs text-muted">
        {count} line{count === 1 ? '' : 's'} selected
      </span>
      <span className="h-4 w-px bg-line" />
      {stagedDiff ? (
        <HunkButton
          label={verbing && pending === 'unstage' ? verbing : `Unstage ${count}`}
          title="Move the selected lines back out of the index"
          tone="warn"
          disabled={pending !== null}
          onClick={() => onAction('unstage')}
        />
      ) : (
        <>
          <HunkButton
            label={
              discardArmed
                ? 'Confirm Discard?'
                : verbing && pending === 'discard'
                  ? verbing
                  : `Discard ${count}`
            }
            title="Revert the selected lines in the working tree (cannot be undone)"
            tone="danger"
            disabled={pending !== null}
            onClick={() => onAction('discard')}
          />
          <HunkButton
            label={verbing && pending === 'stage' ? verbing : `Stage ${count}`}
            title="Stage just the selected lines to the index"
            tone="accent"
            disabled={pending !== null}
            onClick={() => onAction('stage')}
          />
        </>
      )}
      <button
        type="button"
        onClick={onClear}
        title="Clear selection (Esc)"
        className="text-muted hover:text-text text-xs px-1"
      >
        ✕
      </button>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────

function collectChangeKeysBetween(file: DiffFile, fromKey: string, toKey: string): string[] {
  const flat: string[] = []
  for (let hi = 0; hi < file.hunks.length; hi++) {
    const lines = file.hunks[hi].lines
    for (let li = 0; li < lines.length; li++) {
      const kind = lines[li].kind
      if (kind === 'add' || kind === 'del') flat.push(`${hi}:${li}`)
    }
  }
  const a = flat.indexOf(fromKey)
  const b = flat.indexOf(toKey)
  if (a < 0 || b < 0) return [toKey]
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return flat.slice(lo, hi + 1)
}
