import { useRepo } from '../store/useRepo'

export function EmptyState(): JSX.Element {
  const setActiveRepo = useRepo((s) => s.setActiveRepo)
  const setRecents = useRepo((s) => s.setRecents)
  const pushToast = useRepo((s) => s.pushToast)

  const pick = async (): Promise<void> => {
    const res = await window.git.repo.pick()
    if (!res.ok) {
      pushToast('error', res.stderr)
      return
    }
    if (!res.data) return
    setActiveRepo(res.data)
    const recents = await window.git.repo.recents()
    if (recents.ok) setRecents(recents.data)
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-semibold mb-2">Welcome to SimpleGit</h1>
        <p className="text-muted mb-6">
          A minimal, fast Git client that wraps the local <code className="font-mono">git</code> CLI.
          Pick a repository to get started.
        </p>
        <button
          onClick={pick}
          className="titlebar-nodrag px-4 py-2 rounded-md bg-accent hover:bg-accent-hover text-white font-medium"
        >
          Open repository...
        </button>
      </div>
    </div>
  )
}
