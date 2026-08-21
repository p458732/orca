// @vitest-environment happy-dom

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { VirtualItem } from '@tanstack/react-virtual'
import type { GroupHeaderRow } from '../grouping/row-types'
import { PINNED_GROUP_KEY } from '../grouping/group-keys'
import type { WorktreeSidebarHeaderDrag } from '../drag/use-header-drag'
import type { RepoHeaderProjectActions } from './repo-header-project-actions'
import { WORKTREE_SECTION_HEADER_PADDING_LEFT } from './indentation'
import { renderWorktreeSectionHeaderRow, type SectionHeaderRowContext } from './SectionHeader'

// Why: directory headers never touch repo/project-group drag bookkeeping at
// runtime, so this stub only needs to satisfy the type, not the real hook.
const NOOP_HEADER_DRAG = {
  canReorderRepoHeaders: false,
  canReorderProjectGroupHeaders: false,
  orderedHostIds: [],
  hostDrag: { state: {}, onHandlePointerDown: vi.fn() },
  repoDrag: { state: { draggingRepoId: null }, onHandlePointerDown: vi.fn() },
  projectGroupDrag: { state: { draggingGroupId: null }, onHandlePointerDown: vi.fn() },
  sidebarRepoHeaderIdsByBucket: new Map(),
  sidebarProjectGroupHeaderIdsByBucket: new Map(),
  repoHeaderIndexByRepoId: new Map(),
  repoHeaderBucketByRepoId: new Map(),
  projectGroupHeaderIndexByGroupId: new Map(),
  projectGroupHeaderBucketByGroupId: new Map(),
  repoHeaderSectionEndByRepoId: new Map(),
  projectGroupHeaderSectionEndByGroupId: new Map()
} as unknown as WorktreeSidebarHeaderDrag

const NOOP_PROJECT_ACTIONS: RepoHeaderProjectActions = {
  getWorktreeVisibilityDefaults: () => undefined,
  onOpenRepoSettings: vi.fn(),
  onOpenWorktreeVisibility: vi.fn(),
  onCreateGroupFromRepo: vi.fn(),
  onMoveProjectToGroup: vi.fn(),
  onRemoveProjectFromGroup: vi.fn(),
  onRemoveProject: vi.fn(),
  onCreateForRepo: vi.fn()
}

function makeContext(overrides: Partial<SectionHeaderRowContext> = {}): SectionHeaderRowContext {
  return {
    groupBy: 'directory',
    collapsedGroups: new Set(),
    workspaceStatuses: [],
    projectGroups: [],
    sshConnectionStates: new Map(),
    highlightedRevealRowKey: null,
    dragOverStatus: null,
    pinDragOver: false,
    headerDrag: NOOP_HEADER_DRAG,
    getCachedFolderWorkspacePathStatus: () => null,
    toggleGroupWithScrollAnchor: vi.fn(),
    projectActions: NOOP_PROJECT_ACTIONS,
    onRenameProjectGroup: vi.fn(),
    onDeleteProjectGroup: vi.fn(),
    onCreateFolderWorkspace: vi.fn(),
    onWorkspaceStatusDragOver: vi.fn(),
    onWorkspaceStatusDragLeave: vi.fn(),
    onWorkspacePinDragOver: vi.fn(),
    onWorkspacePinDragLeave: vi.fn(),
    onWorkspaceStatusDrop: vi.fn(),
    ...overrides
  }
}

function makeVirtualItem(): VirtualItem {
  return { key: 'row', index: 0, start: 0, end: 28, size: 28, lane: 0 }
}

function makeDirectoryHeaderRow(overrides: Partial<GroupHeaderRow> = {}): GroupHeaderRow {
  return {
    type: 'header',
    key: 'dir:local:/repo/group',
    label: 'group',
    count: 2,
    tone: 'text-foreground',
    ...overrides
  }
}

function renderHeader(
  row: GroupHeaderRow,
  ctxOverrides: Partial<SectionHeaderRowContext> = {}
): string {
  return renderToStaticMarkup(
    renderWorktreeSectionHeaderRow({
      ctx: makeContext(ctxOverrides),
      row,
      vItem: makeVirtualItem(),
      isActiveStickyHeader: false,
      hasStickyHost: false,
      hasHeaderTopSpacing: false,
      measureVirtualRowElement: () => {}
    })
  )
}

function paddingLeftOf(markup: string): number {
  const match = markup.match(/padding-left:(\d+)px/)
  if (!match) {
    throw new Error(`expected a padding-left declaration in markup: ${markup}`)
  }
  return Number(match[1])
}

describe('renderWorktreeSectionHeaderRow directory mode', () => {
  it('indents a nested directory header deeper than its depth-0 parent', () => {
    const depth0 = renderHeader(makeDirectoryHeaderRow({ projectGroupDepth: 0 }))
    const depth1 = renderHeader(makeDirectoryHeaderRow({ projectGroupDepth: 1 }))

    expect(paddingLeftOf(depth1)).toBeGreaterThan(paddingLeftOf(depth0))
  })

  it('exposes a collapse affordance and a boolean aria-expanded for a header with descendants', () => {
    const expanded = renderHeader(makeDirectoryHeaderRow({ key: 'dir:local:/repo/group' }))
    expect(expanded).toContain('data-repo-header-collapse-affordance=""')
    expect(expanded).toContain('aria-expanded="true"')

    const collapsed = renderHeader(makeDirectoryHeaderRow({ key: 'dir:local:/repo/group' }), {
      collapsedGroups: new Set(['dir:local:/repo/group'])
    })
    expect(collapsed).toContain('data-repo-header-collapse-affordance=""')
    expect(collapsed).toContain('aria-expanded="false"')
  })

  // Why not "count: 0": every directory node exists only as an ancestor of some
  // worktree, so collectSubtreeWorktrees roll-up guarantees count >= 1 — a
  // count-0 directory header cannot occur (see directory-group-sections.ts).

  it('does not apply directory indentation to a non-directory header rendered in directory mode', () => {
    // Why: isDirectoryHeader must key off the row's own dir: prefix, not ctx.groupBy,
    // or a header like Pinned (which also renders through directory mode) would
    // silently inherit directory chrome once it carries a projectGroupDepth.
    const pinnedRow = makeDirectoryHeaderRow({ key: PINNED_GROUP_KEY, projectGroupDepth: 2 })
    const markup = renderHeader(pinnedRow)
    expect(paddingLeftOf(markup)).toBe(WORKTREE_SECTION_HEADER_PADDING_LEFT)
  })
})
