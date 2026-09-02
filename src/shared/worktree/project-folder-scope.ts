import { normalizeRuntimePathForComparison } from '../cross-platform-path'
import { createDescendantMatcher } from './visibility-sources'

/** Pins the project-folder visibility scope on or off. Absent means auto:
 *  decide from the layout. Mirrors `externalWorktreeVisibility`, where an unset
 *  field is the computed default rather than a third literal. */
export type ProjectFolderScopeMode = 'always' | 'never'

/** Why this is the auto signal: a project that keeps worktrees inside its own
 *  folder owns a self-contained nest (an expmonkey series, say), so anything
 *  outside belongs to a sibling project sharing the same git graph. A project
 *  whose worktrees all live elsewhere has no nest to scope to. */
export function hasNestedProjectWorktrees(
  repoPath: string,
  worktreePaths: readonly string[]
): boolean {
  const isDescendant = createDescendantMatcher(repoPath)
  return worktreePaths.some((path) => isDescendant(normalizeRuntimePathForComparison(path)))
}

export function isProjectFolderScopeActive(args: {
  mode: ProjectFolderScopeMode | undefined
  hasNestedWorktrees: boolean
}): boolean {
  if (args.mode) {
    return args.mode === 'always'
  }
  return args.hasNestedWorktrees
}
