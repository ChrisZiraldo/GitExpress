import { useCallback, useEffect } from 'react'
import { useRepo } from '../store/useRepo'

export function useGitStatus(): { refresh: () => Promise<void> } {
  const activeRepo = useRepo((s) => s.activeRepo)
  const refreshVersion = useRepo((s) => s.refreshVersion)
  const setStatus = useRepo((s) => s.setStatus)
  const setBranches = useRepo((s) => s.setBranches)
  const setRefs = useRepo((s) => s.setRefs)
  const setStashes = useRepo((s) => s.setStashes)
  const setGraph = useRepo((s) => s.setGraph)
  const setCommits = useRepo((s) => s.setCommits)
  const pushToast = useRepo((s) => s.pushToast)

  const refresh = useCallback(async () => {
    if (!activeRepo) {
      setStatus(null)
      setBranches([])
      setRefs({ local: [], remote: [], tags: [] })
      setStashes([])
      setGraph([])
      setCommits([])
      return
    }
    const [statusRes, branchesRes, refsRes, stashesRes, graphRes, logRes] =
      await Promise.all([
        window.git.status.get(activeRepo.path),
        window.git.branch.list(activeRepo.path),
        window.git.refs.list(activeRepo.path),
        window.git.stash.list(activeRepo.path),
        window.git.log.graph(activeRepo.path, 500),
        window.git.log.recent(activeRepo.path, 50)
      ])
    if (statusRes.ok) setStatus(statusRes.data)
    else pushToast('error', `Status failed: ${statusRes.stderr}`)
    if (branchesRes.ok) setBranches(branchesRes.data)
    if (refsRes.ok) setRefs(refsRes.data)
    if (stashesRes.ok) setStashes(stashesRes.data)
    if (graphRes.ok) setGraph(graphRes.data)
    if (logRes.ok) setCommits(logRes.data)
  }, [
    activeRepo,
    setStatus,
    setBranches,
    setRefs,
    setStashes,
    setGraph,
    setCommits,
    pushToast
  ])

  useEffect(() => {
    void refresh()
  }, [refresh, refreshVersion])

  useEffect(() => {
    const onFocus = (): void => {
      void refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  return { refresh }
}
