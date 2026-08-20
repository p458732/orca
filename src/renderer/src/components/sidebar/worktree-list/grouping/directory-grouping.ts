import {
  normalizeRuntimePathForComparison,
  normalizeRuntimePathSeparators,
  relativePathInsideRoot,
  resolveRuntimePath
} from '../../../../../../shared/cross-platform-path'
import type { ExecutionHostId } from '../../../../../../shared/execution-host'
import {
  getWorktreeExecutionHostId,
  LOCAL_EXECUTION_HOST_ID
} from '../../../../../../shared/execution-host'
import type { Repo } from '../../../../../../shared/repo-types'
import { buildKnownOrcaWorkspaceLayouts } from '../../../../../../shared/worktree/ownership'
import type { Worktree } from '../../../../../../shared/worktree/types'
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

export type DirectoryGroupNode = {
  key: string
  label: string
  depth: number
  worktrees: Worktree[]
  children: DirectoryGroupNode[]
}

export type DirectoryGrouping = {
  /** Worktrees sitting directly in the grouping root; rendered before every header. */
  rootWorktrees: Worktree[]
  nodes: DirectoryGroupNode[]
}

function sortDirectoryNodes(nodes: DirectoryGroupNode[]): void {
  nodes.sort((left, right) => left.label.localeCompare(right.label))
  for (const node of nodes) {
    sortDirectoryNodes(node.children)
  }
}

export function buildDirectoryGrouping(args: {
  worktrees: readonly Worktree[]
  repoMap: Map<string, Repo>
  settings: AppState['settings'] | undefined
  defaultHostId?: ExecutionHostId
}): DirectoryGrouping {
  const rootWorktrees: Worktree[] = []
  const nodesByKey = new Map<string, DirectoryGroupNode>()
  const topLevel: DirectoryGroupNode[] = []
  const rootByRepoId = new Map<string, string>()

  for (const worktree of args.worktrees) {
    const repo = args.repoMap.get(worktree.repoId)
    if (!repo) {
      rootWorktrees.push(worktree)
      continue
    }
    let root = rootByRepoId.get(repo.id)
    if (root === undefined) {
      root = resolveWorktreeGroupingRoot(repo, args.settings)
      rootByRepoId.set(repo.id, root)
    }
    const relative = relativePathInsideRoot(root, worktree.path)
    // Why: '' means the worktree IS the root; null means it sits outside it.
    const segments = relative ? relative.split('/').filter(Boolean) : []
    const directorySegments = segments.slice(0, -1)
    if (directorySegments.length === 0) {
      rootWorktrees.push(worktree)
      continue
    }
    const hostId = getWorktreeExecutionHostId(
      worktree,
      repo,
      args.defaultHostId ?? LOCAL_EXECUTION_HOST_ID
    )
    let siblings = topLevel
    let node: DirectoryGroupNode | undefined
    for (let depth = 0; depth < directorySegments.length; depth++) {
      const absolute = resolveRuntimePath(root, directorySegments.slice(0, depth + 1).join('/'))
      const key = getDirectoryGroupKey(hostId, absolute)
      let existing = nodesByKey.get(key)
      if (!existing) {
        existing = {
          key,
          label: directorySegments[depth]!,
          depth,
          worktrees: [],
          children: []
        }
        nodesByKey.set(key, existing)
        siblings.push(existing)
      }
      siblings = existing.children
      node = existing
    }
    node!.worktrees.push(worktree)
  }

  sortDirectoryNodes(topLevel)
  return { rootWorktrees, nodes: topLevel }
}
