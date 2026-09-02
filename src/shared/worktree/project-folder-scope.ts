import { normalizeRuntimePathForComparison } from '../cross-platform-path'
import { createDescendantMatcher } from './visibility-sources'

/** Why this is the signal: a project that keeps worktrees inside its own folder
 *  owns a self-contained nest (an expmonkey series, say), so anything outside
 *  belongs to a sibling project sharing the same git graph. A project whose
 *  worktrees all live elsewhere has no nest to scope to. */
export function hasNestedProjectWorktrees(
  repoPath: string,
  worktreePaths: readonly string[]
): boolean {
  const isDescendant = createDescendantMatcher(repoPath)
  return worktreePaths.some((path) => isDescendant(normalizeRuntimePathForComparison(path)))
}
