import { createTag, deleteTag } from '../src/main/git/tag.ts'
import { cherryPick, revert, resetToCommit } from '../src/main/git/commit-ops.ts'
void (async () => {
  const repo = process.cwd()
  await createTag(repo, 'v1.2.3', 'abcdef0', 'My release')
  await deleteTag(repo, 'v1.0.0')
  await cherryPick(repo, 'deadbeef')
  await revert(repo, 'cafebabe')
  await resetToCommit(repo, '1a2b3c4', 'soft')
  await resetToCommit(repo, '1a2b3c4', 'mixed')
  await resetToCommit(repo, '1a2b3c4', 'hard')
  console.log('Commands logged to dry-run.log')
})()
