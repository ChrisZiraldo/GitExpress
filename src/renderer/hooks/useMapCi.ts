import { useEffect, useRef } from 'react'
import { useRepo } from '../store/useRepo'

/**
 * Bulk-fetches CI status for a set of commits and caches the result in the
 * `ciByCommit` store slice. The map renderer hands this hook a viewport-
 * filtered list of station hashes; this hook then fans out `gh`-backed
 * fetches with a concurrency cap so a fast scroll doesn't spawn dozens of
 * parallel CLI invocations.
 *
 * Uses three layers of dedupe:
 *   1. Cache check — if `ciByCommit[sha]` is already set we never refetch.
 *   2. In-flight set — prevents two effects from queueing the same SHA.
 *   3. Concurrency semaphore — caps the number of simultaneous `gh` calls.
 *
 * Skipped entirely when `gh` isn't installed/authed.
 *
 * @param hashes Full SHAs of the commits to prefetch CI status for.
 */
export function useMapCi(hashes: string[]): void {
  const activeRepo = useRepo((s) => s.activeRepo)
  const ciAvailable = useRepo((s) => s.ciAvailable)
  const setCiForCommit = useRepo((s) => s.setCiForCommit)
  const setCiCommitLoading = useRepo((s) => s.setCiCommitLoading)
  const refreshVersion = useRepo((s) => s.refreshVersion)

  // Stable string key so the effect doesn't re-fire on every render due to
  // a fresh array reference. Sorted so order doesn't matter.
  const key = [...hashes].sort().join(',')

  // Dedupe in-flight fetches across renders — without this the effect would
  // refire on store updates and stack duplicate `gh` invocations.
  const inFlight = useRef<Set<string>>(new Set())
  // Tiny semaphore: cap how many `gh` calls run at once. GitHub's API is
  // happy with this; the bound exists mainly to avoid spawning ~30 child
  // processes simultaneously when a user scrolls a busy map.
  const sem = useRef<{ active: number; waiters: Array<() => void> }>({
    active: 0,
    waiters: []
  })

  // Note: deliberately no cancellation flag. `setCiForCommit` is a Zustand
  // cache write keyed by SHA — letting late results land is correct, and
  // dropping them caused the "click station, no CI; click again, CI shows"
  // bug because a quick selection change would orphan the in-flight result.
  useEffect(() => {
    if (!activeRepo) return
    if (ciAvailable === false) return
    if (hashes.length === 0) return

    const CONCURRENCY = 4
    const acquire = (): Promise<void> =>
      new Promise((resolve) => {
        const s = sem.current
        if (s.active < CONCURRENCY) {
          s.active++
          resolve()
        } else {
          s.waiters.push(() => {
            s.active++
            resolve()
          })
        }
      })
    const release = (): void => {
      const s = sem.current
      s.active--
      const next = s.waiters.shift()
      if (next) next()
    }

    const cache = useRepo.getState().ciByCommit
    const cwd = activeRepo.path
    for (const sha of hashes) {
      if (!sha) continue
      if (cache[sha] !== undefined) continue
      if (inFlight.current.has(sha)) continue
      inFlight.current.add(sha)
      setCiCommitLoading(sha, true)
      void (async () => {
        await acquire()
        try {
          const res = await window.git.ci.commitChecks(cwd, sha)
          setCiForCommit(sha, res.ok ? res.data : null)
        } finally {
          inFlight.current.delete(sha)
          setCiCommitLoading(sha, false)
          release()
        }
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRepo, ciAvailable, key, refreshVersion])
}
