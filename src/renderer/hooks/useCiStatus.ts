import { useCallback, useEffect, useRef } from 'react'
import { useRepo } from '../store/useRepo'

/**
 * Loads pull-request + CI status for the current branch and exposes a manual
 * `refresh()` callback. Auto-refreshes when:
 *   • The active repo changes
 *   • The current branch changes
 *   • The global `refreshVersion` signal increments (e.g. after fetch/push)
 *
 * The result is cached per-branch in the store under `ciByBranch`, so other
 * components (TopBar badge, sidebar, etc.) can read it without triggering
 * their own fetches.
 */
export function useCiStatus(): { refresh: () => Promise<void> } {
  const activeRepo = useRepo((s) => s.activeRepo)
  const refreshVersion = useRepo((s) => s.refreshVersion)
  const currentBranch = useRepo((s) => s.status?.branch?.current ?? null)
  const ciAvailable = useRepo((s) => s.ciAvailable)
  const setCiAvailable = useRepo((s) => s.setCiAvailable)
  const setCiForBranch = useRepo((s) => s.setCiForBranch)
  const setCiLoading = useRepo((s) => s.setCiLoading)

  // Suppress duplicate concurrent fetches per (repo,branch). We don't need a
  // full request graph — just "is one already in flight for this branch?".
  const inFlight = useRef<Set<string>>(new Set())

  // One-time check: does the user have `gh` installed + authed? Avoids
  // hammering the CLI when there's no point.
  useEffect(() => {
    if (ciAvailable !== null) return
    void (async () => {
      try {
        const res = await window.git.ci.available()
        setCiAvailable(res.ok ? res.data : false)
      } catch {
        setCiAvailable(false)
      }
    })()
  }, [ciAvailable, setCiAvailable])

  const refresh = useCallback(async () => {
    if (!activeRepo || !currentBranch) return
    if (ciAvailable === false) return
    const key = `${activeRepo.path}::${currentBranch}`
    if (inFlight.current.has(key)) return
    inFlight.current.add(key)
    setCiLoading(currentBranch, true)
    try {
      const res = await window.git.ci.prStatus(activeRepo.path, currentBranch)
      if (res.ok) {
        setCiForBranch(currentBranch, res.data)
      } else {
        // Treat any error (no remote, network, etc.) as "no PR" rather than
        // a hard failure so the UI stays quiet.
        setCiForBranch(currentBranch, null)
      }
    } finally {
      inFlight.current.delete(key)
      setCiLoading(currentBranch, false)
    }
  }, [activeRepo, currentBranch, ciAvailable, setCiForBranch, setCiLoading])

  useEffect(() => {
    void refresh()
  }, [refresh, refreshVersion])

  return { refresh }
}
