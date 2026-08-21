import { describe, expect, it } from 'vitest'
import { buildRows } from './worktree-list/grouping/build-rows'
import { repo, worktree } from './worktree-list-groups-test-fixtures'
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
