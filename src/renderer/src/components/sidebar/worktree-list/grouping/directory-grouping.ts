import {
  normalizeRuntimePathForComparison,
  normalizeRuntimePathSeparators
} from '../../../../../../shared/cross-platform-path'
import type { ExecutionHostId } from '../../../../../../shared/execution-host'
import type { Repo } from '../../../../../../shared/repo-types'
import { buildKnownOrcaWorkspaceLayouts } from '../../../../../../shared/worktree/ownership'
import type { AppState } from '../../../../store/types'

export const DIRECTORY_GROUP_PREFIX = 'dir:'

export function getDirectoryGroupKey(hostId: ExecutionHostId, absoluteDirectory: string): string {
  return `${DIRECTORY_GROUP_PREFIX}${hostId}:${normalizeRuntimePathForComparison(absoluteDirectory)}`
}

// Why: the repo may sit at a drive/posix root, where slicing off the last
// segment would otherwise produce `C:` or an empty string instead of a root.
function getRuntimeParentPath(value: string): string {
  const normalized = normalizeRuntimePathSeparators(value).replace(/\/+$/, '')
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash === -1) {
    return normalized
  }
  if (lastSlash === 0) {
    return '/'
  }
  const parent = normalized.slice(0, lastSlash)
  return /^[A-Za-z]:$/.test(parent) ? `${parent}/` : parent
}

/** The directory a repo's worktrees are grouped relative to.
 *  buildKnownOrcaWorkspaceLayouts already yields worktreeBasePath first and
 *  workspaceDir second, with relative paths resolved against the repo. */
export function resolveWorktreeGroupingRoot(
  repo: Repo,
  settings: AppState['settings'] | undefined
): string {
  const rootPath = buildKnownOrcaWorkspaceLayouts(
    {
      workspaceDir: settings?.workspaceDir ?? '',
      nestWorkspaces: settings?.nestWorkspaces ?? false,
      workspaceDirHistory: settings?.workspaceDirHistory ?? []
    },
    repo
  )[0]?.path
  return rootPath ? normalizeRuntimePathSeparators(rootPath) : getRuntimeParentPath(repo.path)
}
