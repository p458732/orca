import { FolderTree } from 'lucide-react'
import type { DirectoryGrouping, DirectoryGroupNode } from './directory-grouping'
import type { RenderableFolderWorkspace } from './folder-workspace-lanes'
import { compareFolderWorkspacesForDisplay } from './folder-workspace-lanes'
import type { SectionAppendContext } from './group-sections'
import { appendWorktreeRows, buildFolderWorkspaceRow } from './row-builders'

/** Section key for headerless root-level rows. Deliberately not '' — an empty
 *  sectionKey would produce the rowKey ':<identity>' and an empty
 *  data-worktree-section-key attribute. Cannot collide with getDirectoryGroupKey,
 *  which always emits 'dir:<hostId>:<path>'. */
export const DIRECTORY_ROOT_SECTION_KEY = 'directory-root'

function appendDirectoryNode(
  ctx: SectionAppendContext,
  node: DirectoryGroupNode,
  depth: number
): void {
  const isCollapsed = ctx.collapsedGroups.has(node.key)
  ctx.result.push({
    type: 'header',
    key: node.key,
    label: node.label,
    count: node.worktrees.length,
    tone: 'text-foreground',
    icon: FolderTree,
    projectGroupDepth: depth,
    worktreeIds: node.worktrees.map((worktree) => worktree.id)
  })
  if (isCollapsed) {
    return
  }
  appendWorktreeRows(ctx.result, node.worktrees, ctx.repoMap, ctx.lineageById, ctx.worktreeMap, {
    nestLineage: ctx.nestLineage,
    collapsedGroups: ctx.collapsedGroups,
    groupDepth: depth,
    sectionKey: node.key,
    hostContextLabelByWorktreeIdentity: ctx.mixedWorktreeHostContextLabels,
    cyclicLineageIds: ctx.cyclicLineageIds
  })
  for (const child of node.children) {
    appendDirectoryNode(ctx, child, depth + 1)
  }
}

/** Emits root-level worktrees (headerless) then one nested section per directory. */
export function appendDirectorySections(
  ctx: SectionAppendContext,
  args: {
    grouping: DirectoryGrouping
    folderWorkspaces: readonly RenderableFolderWorkspace[]
  }
): void {
  appendWorktreeRows(
    ctx.result,
    args.grouping.rootWorktrees,
    ctx.repoMap,
    ctx.lineageById,
    ctx.worktreeMap,
    {
      nestLineage: ctx.nestLineage,
      collapsedGroups: ctx.collapsedGroups,
      groupDepth: 0,
      sectionKey: DIRECTORY_ROOT_SECTION_KEY,
      hostContextLabelByWorktreeIdentity: ctx.mixedWorktreeHostContextLabels,
      cyclicLineageIds: ctx.cyclicLineageIds
    }
  )
  for (const pair of [...args.folderWorkspaces].sort((left, right) =>
    compareFolderWorkspacesForDisplay(left.folderWorkspace, right.folderWorkspace)
  )) {
    ctx.result.push(buildFolderWorkspaceRow(pair, 0))
  }
  for (const node of args.grouping.nodes) {
    appendDirectoryNode(ctx, node, 0)
  }
}
