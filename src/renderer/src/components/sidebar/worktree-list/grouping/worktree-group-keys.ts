import type { ProjectGroup } from '../../../../../../shared/project-group-types'
import type { Repo } from '../../../../../../shared/repo-types'
import type { WorkspaceStatusDefinition, Worktree } from '../../../../../../shared/worktree/types'
import { getWorkspaceStatus, getWorkspaceStatusGroupKey } from '../../workspace-status'
import { cloneDefaultWorkspaceStatuses } from '../../../../../../shared/workspace-statuses'
import type { AppState } from '../../../../store/types'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../../../shared/execution-host'
import type { ExecutionHostId } from '../../../../../../shared/execution-host'
import { ALL_GROUP_KEY, getPRGroupKey, getProjectGroupHeaderKey } from './group-keys'
import { createWorktreeGroupingRootResolver, getWorktreeDirectoryChain } from './directory-grouping'
import { buildProjectGroupingIndex, getProjectGroupingForRepo } from './project-grouping'
import type { ProjectGroupingModel } from './project-grouping'
import type { WorktreeGroupBy } from './row-types'

/** Collapsing any ancestor hides the whole subtree, so reveal callers need every
 *  key, not just the leaf. */
function getDirectoryGroupKeyChain(
  worktree: Worktree,
  repoMap: Map<string, Repo>,
  settings: AppState['settings'] | undefined,
  defaultHostId: ExecutionHostId
): string[] {
  return getWorktreeDirectoryChain({
    worktree,
    repoMap,
    resolveRoot: createWorktreeGroupingRootResolver(settings),
    defaultHostId
  }).map((step) => step.key)
}

export function getGroupKeyForWorktree(
  groupBy: WorktreeGroupBy,
  worktree: Worktree,
  repoMap: Map<string, Repo>,
  prCache: Record<string, unknown> | null,
  workspaceStatuses: readonly WorkspaceStatusDefinition[] = cloneDefaultWorkspaceStatuses(),
  settings?: AppState['settings'],
  projectGrouping?: ProjectGroupingModel,
  defaultHostId: ExecutionHostId = LOCAL_EXECUTION_HOST_ID
): string | null {
  // Exhaustive with no `default:` so a new WorktreeGroupBy variant is a compile
  // error here rather than silently falling into the pr: branch (as 'directory' did).
  switch (groupBy) {
    case 'none':
      return ALL_GROUP_KEY
    case 'workspace-status':
      return getWorkspaceStatusGroupKey(getWorkspaceStatus(worktree, workspaceStatuses))
    case 'repo':
      return getProjectGroupingForRepo(
        worktree.repoId,
        repoMap,
        buildProjectGroupingIndex(projectGrouping)
      ).key
    case 'pr-status':
      return `pr:${getPRGroupKey(worktree, repoMap, prCache, settings)}`
    case 'directory':
      return getDirectoryGroupKeyChain(worktree, repoMap, settings, defaultHostId).at(-1) ?? null
  }
}

export function getGroupKeysForWorktree(
  groupBy: WorktreeGroupBy,
  worktree: Worktree,
  repoMap: Map<string, Repo>,
  prCache: Record<string, unknown> | null,
  workspaceStatuses: readonly WorkspaceStatusDefinition[] = cloneDefaultWorkspaceStatuses(),
  settings?: AppState['settings'],
  projectGroups: readonly ProjectGroup[] = [],
  projectGrouping?: ProjectGroupingModel,
  defaultHostId: ExecutionHostId = LOCAL_EXECUTION_HOST_ID
): string[] {
  if (groupBy === 'directory') {
    // Why not getGroupKeyForWorktree: reveal must expand every ancestor, not
    // just the leaf, or a collapsed parent keeps hiding the whole subtree.
    return getDirectoryGroupKeyChain(worktree, repoMap, settings, defaultHostId)
  }
  const groupKey = getGroupKeyForWorktree(
    groupBy,
    worktree,
    repoMap,
    prCache,
    workspaceStatuses,
    settings,
    projectGrouping,
    defaultHostId
  )
  if (!groupKey) {
    return []
  }
  if (groupBy !== 'repo') {
    return [groupKey]
  }
  const repo = repoMap.get(worktree.repoId)
  const groupIds: string[] = []
  const groupsById = new Map(projectGroups.map((group) => [group.id, group]))
  const visited = new Set<string>()
  let currentGroupId = repo?.projectGroupId ?? null
  while (currentGroupId && !visited.has(currentGroupId)) {
    const group = groupsById.get(currentGroupId)
    if (!group) {
      // Why: repos can arrive before their remote Project Group metadata; reveal
      // keys must match the top-level fallback rows buildRows actually renders.
      break
    }
    visited.add(currentGroupId)
    groupIds.unshift(currentGroupId)
    const parentId = group.parentGroupId ?? null
    currentGroupId = parentId && groupsById.has(parentId) ? parentId : null
  }
  return [...groupIds.map((id) => getProjectGroupHeaderKey(id)), groupKey]
}
