import { describe, expect, it } from 'vitest'
import { buildRows } from './worktree-list/grouping/build-rows'
import {
  getGroupKeyForWorktree,
  getGroupKeysForWorktree
} from './worktree-list/grouping/worktree-group-keys'
import { getRenderedNaturalAnchorRepoIds } from './worktree-list/grouping/section-order'
import { addHostSectionRows } from './host-section-rows'
import { repo, worktree } from './worktree-list-groups-test-fixtures'
import { cloneDefaultWorkspaceStatuses } from '../../../../shared/workspace-statuses'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { AppState } from '../../store/types'

const emRepo: Repo = {
  ...repo,
  id: 'repo-em',
  path: '/home/me/proj/.em/repo',
  worktreeBasePath: '../..'
}
const repoMap = new Map([[emRepo.id, emRepo]])
const settings = {
  workspaceDir: '/home/me/orca/workspaces',
  nestWorkspaces: true,
  workspaceDirHistory: []
} as unknown as AppState['settings']

function wt(id: string, path: string, overrides: Partial<Worktree> = {}): Worktree {
  return { ...worktree, id, repoId: emRepo.id, path, displayName: id, ...overrides }
}

function rowsFor(worktrees: Worktree[], collapsed: Set<string> = new Set<string>()) {
  return buildRows(
    'directory',
    worktrees,
    repoMap,
    null,
    collapsed,
    undefined,
    undefined,
    'manual',
    {},
    new Map(worktrees.map((entry) => [entry.id, entry])),
    false,
    settings
  )
}

describe('buildRows directory grouping', () => {
  const quick = wt('quick', '/home/me/proj/quick')
  const baseline = wt('baseline', '/home/me/proj/series.tune_lr/baseline')
  const lr1 = wt('lr1', '/home/me/proj/series.tune_lr/lr1')
  const probe = wt('probe', '/home/me/proj/series.gaze/probe')

  it('renders root worktrees before every header, with no header of their own', () => {
    const rows = rowsFor([baseline, quick])
    expect(rows[0]).toMatchObject({ type: 'item', worktree: { id: 'quick' } })
    expect(rows.findIndex((row) => row.type === 'header')).toBe(1)
  })

  it('emits one header per directory, ordered by name', () => {
    const rows = rowsFor([lr1, probe, baseline])
    const headers = rows.filter((row) => row.type === 'header')
    expect(headers.map((row) => (row as { label: string }).label)).toEqual([
      'series.gaze',
      'series.tune_lr'
    ])
  })

  it('counts the worktrees in each directory header', () => {
    const rows = rowsFor([lr1, baseline, probe])
    const tuneHeader = rows.find(
      (row) => row.type === 'header' && (row as { label: string }).label === 'series.tune_lr'
    )
    expect(tuneHeader).toMatchObject({ count: 2 })
  })

  it('nests an intermediate directory that holds no worktree of its own', () => {
    const deep = wt('deep', '/home/me/proj/series.a/series.b/deep')
    const rows = rowsFor([deep])
    const headers = rows.filter((row) => row.type === 'header') as {
      label: string
      projectGroupDepth?: number
    }[]
    expect(headers.map((row) => [row.label, row.projectGroupDepth])).toEqual([
      ['series.a', 0],
      ['series.b', 1]
    ])
  })

  it('reports the descendant count on an intermediate directory holding only a subdirectory', () => {
    const deep = wt('deep', '/home/me/proj/series.a/series.b/deep')
    const rows = rowsFor([deep])
    const seriesAHeader = rows.find(
      (row) => row.type === 'header' && (row as { label: string }).label === 'series.a'
    )
    expect(seriesAHeader).toMatchObject({ count: 1, worktreeIds: ['deep'] })
  })

  it('hides the whole subtree when a parent directory is collapsed', () => {
    const deep = wt('deep', '/home/me/proj/series.a/series.b/deep')
    const open = rowsFor([deep])
    const parentKey = (open.find((row) => row.type === 'header') as { key: string }).key
    const collapsed = rowsFor([deep], new Set([parentKey]))
    expect(collapsed.filter((row) => row.type === 'header')).toHaveLength(1)
    expect(collapsed.some((row) => row.type === 'item')).toBe(false)
  })

  it('keeps pinned worktrees in the pinned section, not in their directory', () => {
    const pinned = wt('pinned', '/home/me/proj/series.tune_lr/pinned', { isPinned: true })
    const rows = rowsFor([pinned, baseline])
    const pinnedHeader = rows.find(
      (row) => row.type === 'header' && (row as { key: string }).key === 'pinned'
    )
    expect(pinnedHeader).toBeDefined()
    const tuneRows = rows.filter(
      (row) => row.type === 'item' && (row as { worktree: Worktree }).worktree.id === 'pinned'
    )
    expect(tuneRows).toHaveLength(1)
  })
})

describe('directory header host attribution', () => {
  it('carries a hostWorktreeCounts entry for its host', () => {
    const baseline = wt('baseline', '/home/me/proj/series.tune_lr/baseline')
    const rows = rowsFor([baseline])
    const header = rows.find((row) => row.type === 'header') as {
      hostWorktreeCounts?: ReadonlyMap<string, number>
      hostWorktreeIds?: ReadonlyMap<string, readonly string[]>
    }
    expect(header.hostWorktreeCounts?.get('local')).toBe(1)
    expect(header.hostWorktreeIds?.get('local')).toEqual(['baseline'])
  })

  it('carries host attribution on an intermediate header holding only subdirectories', () => {
    const deep = wt('deep', '/home/me/proj/series.a/series.b/deep')
    const rows = rowsFor([deep])
    const outer = rows.find((row) => row.type === 'header') as {
      label: string
      hostWorktreeCounts?: ReadonlyMap<string, number>
    }
    expect(outer.label).toBe('series.a')
    expect(outer.hostWorktreeCounts?.get('local')).toBe(1)
  })

  it('keeps an intermediate directory header inside its host section, not orphaned above every host', () => {
    const deepLocal = wt('deep-local', '/home/me/proj/series.a/series.b/deep-local')
    const deepRemote = wt('deep-remote', '/home/me/proj/series.a/series.b/deep-remote', {
      hostId: 'ssh:gpu'
    })
    const rows = rowsFor([deepLocal, deepRemote])

    const sectioned = addHostSectionRows({
      rows,
      hostOptions: [
        {
          id: 'local',
          kind: 'local',
          label: 'Local Mac',
          detail: 'This computer',
          health: 'local'
        },
        { id: 'ssh:gpu', kind: 'ssh', label: 'GPU box', detail: 'SSH', health: 'available' }
      ],
      workspaceHostScope: 'all',
      defaultHostId: 'local'
    })

    const firstHostHeaderIndex = sectioned.findIndex((row) => row.type === 'host-header')
    expect(firstHostHeaderIndex).toBeGreaterThanOrEqual(0)
    const orphanedDirectoryHeaders = sectioned
      .slice(0, firstHostHeaderIndex)
      .filter((row) => row.type === 'header' && (row as { label: string }).label === 'series.a')
    expect(orphanedDirectoryHeaders).toHaveLength(0)
  })
})

describe('getGroupKeysForWorktree in directory mode', () => {
  it('returns the dir: key of every ancestor directory, deepest last, and no pr: key', () => {
    const deep = wt('deep', '/home/me/proj/series.a/series.b/deep')
    expect(getGroupKeysForWorktree('directory', deep, repoMap, null, undefined, settings)).toEqual([
      'dir:local:/home/me/proj/series.a',
      'dir:local:/home/me/proj/series.a/series.b'
    ])
  })

  it('returns no group keys for a worktree sitting directly in the grouping root', () => {
    const quick = wt('quick', '/home/me/proj/quick')
    expect(getGroupKeysForWorktree('directory', quick, repoMap, null, undefined, settings)).toEqual(
      []
    )
  })
})

describe('getGroupKeyForWorktree in directory mode', () => {
  it('returns the leaf directory key, not a pr: fallback key', () => {
    const baseline = wt('baseline', '/home/me/proj/series.tune_lr/baseline')
    expect(getGroupKeyForWorktree('directory', baseline, repoMap, null, undefined, settings)).toBe(
      'dir:local:/home/me/proj/series.tune_lr'
    )
  })
})

describe('getRenderedNaturalAnchorRepoIds with non-local host', () => {
  it('uses the correct host-scoped key when defaultHostId is passed', () => {
    // Worktree without explicit hostId, relying on defaultHostId
    const remote = wt('remote-wt', '/home/me/proj/series.tune_lr/remote')
    // Remove any hostId to force using defaultHostId
    delete remote.hostId
    // The directory group key for the remote host
    const remoteGroupKey = 'dir:ssh:gpu:/home/me/proj/series.tune_lr'
    // Simulate the group being collapsed by including it in collapsedGroups
    const collapsed = new Set([remoteGroupKey])
    // Call with the correct defaultHostId
    const rendered = getRenderedNaturalAnchorRepoIds({
      groupBy: 'directory',
      worktrees: [remote],
      repoMap,
      prCache: null,
      collapsedGroups: collapsed,
      workspaceStatuses: cloneDefaultWorkspaceStatuses(),
      settings,
      projectGrouping: undefined,
      defaultHostId: 'ssh:gpu'
    })
    // Since the group is collapsed and the key matches, the worktree should not be rendered
    expect(rendered.has(remote.repoId)).toBe(false)
  })
})
