import { useEffect } from 'react'
import { useRepo } from '../store/useRepo'
import type { MetroViewTab } from '../store/useRepo'

/**
 * Central keyboard shortcut registry. Mount once in App.tsx.
 *
 * Key bindings:
 *   f               – Fetch origin
 *   p               – Push
 *   P (Shift+p)     – Pull
 *   1–4             – Switch metro view tab
 *   /               – Focus sidebar branch filter
 *   Cmd/Ctrl+f      – Open commit search (dispatches gitmetro:search)
 *   Escape          – Clear selection / dismiss search
 *   Cmd/Ctrl+z      – Undo last destructive operation
 *   ?               – Toggle shortcuts overlay
 */
export function useHotkeys(
  opts: {
    onFetch?: () => void
    onPush?: () => void
    onPull?: () => void
    onFocusBranchFilter?: () => void
    onToggleShortcuts?: () => void
  } = {}
): void {
  const setMetroViewTab = useRepo((s) => s.setMetroViewTab)
  const setSelectedCommit = useRepo((s) => s.setSelectedCommit)
  const setCommitQuery = useRepo((s) => s.setCommitQuery)
  const busy = useRepo((s) => s.busy)
  const popUndoEntry = useRepo((s) => s.popUndoEntry)
  const pushToast = useRepo((s) => s.pushToast)
  const activeRepo = useRepo((s) => s.activeRepo)
  const refreshSignal = useRepo((s) => s.refreshSignal)

  useEffect(() => {
    const TAB_MAP: Record<string, MetroViewTab> = {
      '1': 'history',
      '2': 'prs',
      '3': 'insights',
      '4': 'authors'
    }

    const handler = (e: KeyboardEvent): void => {
      // Skip when focus is in any text input / textarea / contenteditable
      const target = e.target as HTMLElement
      const isEditing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      const meta = e.metaKey || e.ctrlKey

      // Cmd+Z: undo — allowed even in inputs (normal browser undo still handled by browser)
      if (meta && !e.shiftKey && e.key === 'z') {
        const entry = popUndoEntry()
        if (!entry || !activeRepo) return
        void (async () => {
          const res = await window.git.gitUndo.undo(activeRepo.path, entry.beforeSha)
          if (res.ok) {
            pushToast('success', `Undid: ${entry.label}`)
            refreshSignal()
          } else {
            pushToast('error', `Undo failed: ${res.stderr}`)
          }
        })()
        e.preventDefault()
        return
      }

      if (isEditing) return
      if (busy) return

      // Cmd+F: open commit search
      if (meta && e.key === 'f') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('gitmetro:search'))
        return
      }

      // Escape: clear selection / close search
      if (e.key === 'Escape') {
        setSelectedCommit(null)
        setCommitQuery('')
        window.dispatchEvent(new CustomEvent('gitmetro:search-close'))
        return
      }

      // Tab switching: 1-4
      if (TAB_MAP[e.key]) {
        setMetroViewTab(TAB_MAP[e.key])
        return
      }

      // /: focus branch filter
      if (e.key === '/') {
        e.preventDefault()
        opts.onFocusBranchFilter?.()
        window.dispatchEvent(new CustomEvent('gitmetro:focus-branch-filter'))
        return
      }

      // ?: toggle shortcuts overlay
      if (e.key === '?') {
        opts.onToggleShortcuts?.()
        window.dispatchEvent(new CustomEvent('gitmetro:toggle-shortcuts'))
        return
      }

      // f: fetch
      if (e.key === 'f') {
        opts.onFetch?.()
        return
      }

      // p: push
      if (e.key === 'p') {
        opts.onPush?.()
        return
      }

      // P (Shift+p): pull
      if (e.key === 'P') {
        opts.onPull?.()
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    setMetroViewTab,
    setSelectedCommit,
    setCommitQuery,
    busy,
    popUndoEntry,
    pushToast,
    activeRepo,
    refreshSignal,
    opts.onFetch,
    opts.onPush,
    opts.onPull,
    opts.onFocusBranchFilter,
    opts.onToggleShortcuts
  ])
}

/** Human-readable list of shortcuts for the overlay. */
export const SHORTCUT_LIST = [
  { key: 'f', desc: 'Fetch origin' },
  { key: 'p', desc: 'Push current branch' },
  { key: 'P', desc: 'Pull current branch' },
  { key: '1 – 4', desc: 'Switch tab (Map / PRs / Insights / Authors)' },
  { key: '/', desc: 'Focus branch filter' },
  { key: '⌘F', desc: 'Open commit search' },
  { key: 'Esc', desc: 'Clear selection / close search' },
  { key: '⌘Z', desc: 'Undo last operation' },
  { key: '?', desc: 'Toggle this help' },
]
