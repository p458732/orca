import { isExplicitlyImportedExternalWorktreePath } from './external-worktree-inbox'
import {
  effectiveAgentWorktreeVisibility,
  effectiveExternalWorktreeVisibility
} from './external-worktree-visibility'
import { isPathInsideOrEqual } from './cross-platform-path'
import {
  effectiveWorktreeSourceVisibility,
  type WorktreeVisibilitySourceMatcher
} from './worktree/visibility-sources'
import type { GlobalSettings } from './global-settings-types'
import type { Repo } from './repo-types'
import type { Worktree, WorktreeOwnership } from './worktree/types'

export function shouldShowWorktree(args: {
  worktree: Pick<Worktree, 'path'>
  ownership: WorktreeOwnership
  repo: Repo
  isLegacyRepoForVisibility: boolean
  isSelectedCheckout: boolean
  visibilityDefaults?: GlobalSettings['worktreeVisibilityDefaults']
  importedExternalWorktreePaths?: readonly string[] | undefined
  visibilitySource?: ReturnType<WorktreeVisibilitySourceMatcher>
  projectFolderScopeActive?: boolean
}): boolean {
  if (args.isSelectedCheckout || args.ownership === 'orca-managed') {
    return true
  }
  if (
    isExplicitlyImportedExternalWorktreePath(args.worktree.path, {
      importedExternalWorktreePaths: args.importedExternalWorktreePaths
    })
  ) {
    return true
  }
  if (args.visibilitySource) {
    return (
      effectiveWorktreeSourceVisibility(
        args.repo,
        args.visibilitySource,
        args.visibilityDefaults
      ) === 'show'
    )
  }
  if (args.ownership === 'agent-scratch') {
    return effectiveAgentWorktreeVisibility(args.repo) === 'show'
  }
  // Why below the source and scratch tiers: those already model "worktrees under
  // root R get visibility V", and both typically sit inside the project folder —
  // ranking the scope above them would silently un-hide agent plumbing. Why
  // decisive in both directions once reached: a nested worktree must survive a
  // repo-wide `hide` to be reachable at all.
  if (args.projectFolderScopeActive) {
    return isPathInsideOrEqual(args.repo.path, args.worktree.path)
  }
  if (args.ownership === 'unknown-legacy' && args.isLegacyRepoForVisibility) {
    return true
  }
  return (
    effectiveExternalWorktreeVisibility(
      args.repo,
      args.isLegacyRepoForVisibility,
      args.visibilityDefaults
    ) === 'show'
  )
}
