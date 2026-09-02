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
  return rootPath ? normalizeRuntimePathSeparators(rootPath) : resolveRuntimePath(repo.path, '..')
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

export type DirectoryChainStep = { key: string; label: string }

/** Caches the grouping root per repo: resolving it walks the workspace layouts,
 *  and a listing asks for the same handful of repos hundreds of times. */
export function createWorktreeGroupingRootResolver(
  settings: AppState['settings'] | undefined
): (repo: Repo) => string {
  const rootByRepoId = new Map<string, string>()
  return (repo) => {
    let root = rootByRepoId.get(repo.id)
    if (root === undefined) {
      root = resolveWorktreeGroupingRoot(repo, settings)
      rootByRepoId.set(repo.id, root)
    }
    return root
  }
}

/** The directory chain a worktree hangs under, outermost first. Empty when it
 *  sits at the grouping root (headerless there) or its repo is unknown.
 *
 *  One definition on purpose: the tree renders from this and reveal/collapse key
 *  off it, so a second copy would let headers stop matching their own keys —
 *  a silent UI no-op, not an error. */
export function getWorktreeDirectoryChain(args: {
  worktree: Worktree
  repoMap: Map<string, Repo>
  resolveRoot: (repo: Repo) => string
  defaultHostId: ExecutionHostId
}): DirectoryChainStep[] {
  const repo = args.repoMap.get(args.worktree.repoId)
  if (!repo) {
    return []
  }
  const root = args.resolveRoot(repo)
  const relative = relativePathInsideRoot(root, args.worktree.path)
  // Why: '' means the worktree IS the root; null means it sits outside it.
  const segments = relative ? relative.split('/').filter(Boolean) : []
  const directorySegments = segments.slice(0, -1)
  if (directorySegments.length === 0) {
    return []
  }
  const hostId = getWorktreeExecutionHostId(args.worktree, repo, args.defaultHostId)
  const chain: DirectoryChainStep[] = []
  // Why accumulate rather than re-join from the root each level: that is O(depth²)
  // string work for the same path.
  let absolute = root
  for (const label of directorySegments) {
    absolute = resolveRuntimePath(absolute, label)
    chain.push({ key: getDirectoryGroupKey(hostId, absolute), label })
  }
  return chain
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
  const resolveRoot = createWorktreeGroupingRootResolver(args.settings)

  for (const worktree of args.worktrees) {
    const chain = getWorktreeDirectoryChain({
      worktree,
      repoMap: args.repoMap,
      resolveRoot,
      defaultHostId: args.defaultHostId ?? LOCAL_EXECUTION_HOST_ID
    })
    if (chain.length === 0) {
      rootWorktrees.push(worktree)
      continue
    }
    let siblings = topLevel
    let node: DirectoryGroupNode | undefined
    for (const [depth, step] of chain.entries()) {
      let existing = nodesByKey.get(step.key)
      if (!existing) {
        existing = { key: step.key, label: step.label, depth, worktrees: [], children: [] }
        nodesByKey.set(step.key, existing)
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
