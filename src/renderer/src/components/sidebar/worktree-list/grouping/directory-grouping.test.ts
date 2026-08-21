import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../../../shared/repo-types'
import type { AppState } from '../../../../store/types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import {
  buildDirectoryGrouping,
  getDirectoryGroupKey,
  resolveWorktreeGroupingRoot
} from './directory-grouping'

const repo: Repo = {
  id: 'repo-1',
  path: '/home/me/proj/.em/repo',
  displayName: 'proj',
  badgeColor: '#000000',
  addedAt: 0
}

function makeSettings(overrides: Record<string, unknown> = {}): AppState['settings'] {
  return {
    workspaceDir: '/home/me/orca/workspaces',
    nestWorkspaces: true,
    workspaceDirHistory: [],
    ...overrides
  } as unknown as AppState['settings']
}

describe('resolveWorktreeGroupingRoot', () => {
  it('resolves a relative worktreeBasePath against the repo path', () => {
    expect(
      resolveWorktreeGroupingRoot({ ...repo, worktreeBasePath: '../..' }, makeSettings())
    ).toBe('/home/me/proj')
  })

  it('uses an absolute worktreeBasePath as-is', () => {
    expect(
      resolveWorktreeGroupingRoot(
        { ...repo, worktreeBasePath: '/data/experiments' },
        makeSettings()
      )
    ).toBe('/data/experiments')
  })

  it('falls back to the Orca workspace layout when no base path is set', () => {
    expect(resolveWorktreeGroupingRoot(repo, makeSettings())).toBe('/home/me/orca/workspaces')
  })

  it('falls back to the repo parent directory when there is no layout at all', () => {
    expect(resolveWorktreeGroupingRoot(repo, makeSettings({ workspaceDir: '' }))).toBe(
      '/home/me/proj/.em'
    )
  })

  it('keeps the drive root when the repo sits directly under a Windows drive', () => {
    const windowsRepo: Repo = { ...repo, path: 'C:\\proj' }
    expect(resolveWorktreeGroupingRoot(windowsRepo, makeSettings({ workspaceDir: '' }))).toBe('C:/')
  })

  it('keeps the posix root when the repo sits directly under /', () => {
    const rootRepo: Repo = { ...repo, path: '/proj' }
    expect(resolveWorktreeGroupingRoot(rootRepo, makeSettings({ workspaceDir: '' }))).toBe('/')
  })

  it('keeps the full UNC share root when the repo sits directly under it', () => {
    const uncRepo: Repo = { ...repo, path: '//server/share' }
    expect(resolveWorktreeGroupingRoot(uncRepo, makeSettings({ workspaceDir: '' }))).toBe(
      '//server/share'
    )
  })

  it('resolves the parent of a nested UNC path without truncating the share name', () => {
    const uncRepo: Repo = { ...repo, path: '//server/share/proj/.em/repo' }
    expect(resolveWorktreeGroupingRoot(uncRepo, makeSettings({ workspaceDir: '' }))).toBe(
      '//server/share/proj/.em'
    )
  })
})

describe('getDirectoryGroupKey', () => {
  it('scopes the key by execution host so the same path on two hosts is two groups', () => {
    expect(getDirectoryGroupKey('local', '/home/me/proj/series.a')).not.toBe(
      getDirectoryGroupKey('ssh:gpu', '/home/me/proj/series.a')
    )
  })

  it('normalizes the directory so separator style does not split a group', () => {
    expect(getDirectoryGroupKey('local', 'C:\\proj\\series.a')).toBe(
      getDirectoryGroupKey('local', 'C:/proj/series.a')
    )
  })
})

const emRepo: Repo = { ...repo, worktreeBasePath: '../..' }
const emRepoMap = new Map([[emRepo.id, emRepo]])

function makeWorktree(id: string, path: string, overrides: Partial<Worktree> = {}): Worktree {
  return {
    id,
    repoId: emRepo.id,
    path,
    branch: `refs/heads/${id}`,
    head: 'abc123',
    isBare: false,
    isMainWorktree: false,
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    comment: '',
    isUnread: false,
    isPinned: false,
    displayName: id,
    sortOrder: 0,
    lastActivityAt: 0,
    ...overrides
  }
}

describe('buildDirectoryGrouping', () => {
  const settings = makeSettings()

  it('puts a worktree sitting directly in the root into rootWorktrees', () => {
    const quick = makeWorktree('quick', '/home/me/proj/quick')
    const grouping = buildDirectoryGrouping({
      worktrees: [quick],
      repoMap: emRepoMap,
      settings
    })
    expect(grouping.rootWorktrees).toEqual([quick])
    expect(grouping.nodes).toEqual([])
  })

  it('creates one node for a worktree one directory deep', () => {
    const baseline = makeWorktree('baseline', '/home/me/proj/series.tune_lr/baseline')
    const grouping = buildDirectoryGrouping({
      worktrees: [baseline],
      repoMap: emRepoMap,
      settings
    })
    expect(grouping.rootWorktrees).toEqual([])
    expect(grouping.nodes).toHaveLength(1)
    expect(grouping.nodes[0]).toMatchObject({
      label: 'series.tune_lr',
      depth: 0,
      worktrees: [baseline],
      children: []
    })
  })

  it('nests every intermediate directory even when it holds no worktree itself', () => {
    const probe = makeWorktree('probe', '/home/me/proj/series.a/series.b/probe')
    const grouping = buildDirectoryGrouping({
      worktrees: [probe],
      repoMap: emRepoMap,
      settings
    })
    expect(grouping.nodes).toHaveLength(1)
    const outer = grouping.nodes[0]!
    expect(outer).toMatchObject({ label: 'series.a', depth: 0, worktrees: [] })
    expect(outer.children).toHaveLength(1)
    expect(outer.children[0]).toMatchObject({
      label: 'series.b',
      depth: 1,
      worktrees: [probe],
      children: []
    })
  })

  it('groups siblings under one node and orders top-level nodes by label', () => {
    const gaze = makeWorktree('gaze-probe', '/home/me/proj/series.gaze/probe')
    const lr1 = makeWorktree('lr1', '/home/me/proj/series.tune_lr/lr1')
    const lr2 = makeWorktree('lr2', '/home/me/proj/series.tune_lr/lr2')
    const grouping = buildDirectoryGrouping({
      worktrees: [lr1, gaze, lr2],
      repoMap: emRepoMap,
      settings
    })
    expect(grouping.nodes.map((node) => node.label)).toEqual(['series.gaze', 'series.tune_lr'])
    expect(grouping.nodes[1]!.worktrees).toEqual([lr1, lr2])
  })

  it('keeps full depth beyond the header indent cap', () => {
    const deep = makeWorktree('deep', '/home/me/proj/a/b/c/d/e/f/g/h/deep')
    const grouping = buildDirectoryGrouping({
      worktrees: [deep],
      repoMap: emRepoMap,
      settings
    })
    let depth = 0
    let node = grouping.nodes[0]
    while (node?.children.length) {
      node = node.children[0]
      depth += 1
    }
    expect(depth).toBe(7)
    expect(node?.worktrees).toEqual([deep])
  })

  it('sends a worktree outside the grouping root to rootWorktrees', () => {
    const stray = makeWorktree('stray', '/tmp/elsewhere/stray')
    const grouping = buildDirectoryGrouping({
      worktrees: [stray],
      repoMap: emRepoMap,
      settings
    })
    expect(grouping.rootWorktrees).toEqual([stray])
    expect(grouping.nodes).toEqual([])
  })

  it('sends a worktree whose repo is unknown to rootWorktrees', () => {
    const orphan = makeWorktree('orphan', '/home/me/proj/series.a/orphan', { repoId: 'missing' })
    const grouping = buildDirectoryGrouping({
      worktrees: [orphan],
      repoMap: emRepoMap,
      settings
    })
    expect(grouping.rootWorktrees).toEqual([orphan])
    expect(grouping.nodes).toEqual([])
  })

  it('keeps the same relative folder in two repos as two separate groups', () => {
    const repoB: Repo = {
      ...emRepo,
      id: 'repo-2',
      path: '/home/me/other/.em/repo'
    }
    const a = makeWorktree('a', '/home/me/proj/series.tune_lr/a')
    const b = makeWorktree('b', '/home/me/other/series.tune_lr/b', { repoId: repoB.id })
    const grouping = buildDirectoryGrouping({
      worktrees: [a, b],
      repoMap: new Map([
        [emRepo.id, emRepo],
        [repoB.id, repoB]
      ]),
      settings
    })
    expect(grouping.nodes).toHaveLength(2)
    expect(new Set(grouping.nodes.map((node) => node.key)).size).toBe(2)
  })

  it('keeps the same absolute directory on two hosts as two separate groups', () => {
    const local = makeWorktree('local', '/home/me/proj/series.a/local')
    const remote = makeWorktree('remote', '/home/me/proj/series.a/remote', {
      hostId: 'ssh:gpu'
    })
    const grouping = buildDirectoryGrouping({
      worktrees: [local, remote],
      repoMap: emRepoMap,
      settings
    })
    expect(grouping.nodes).toHaveLength(2)
    expect(new Set(grouping.nodes.map((node) => node.key)).size).toBe(2)
  })

  it('groups Windows paths the same way as posix ones', () => {
    const windowsRepo: Repo = {
      ...emRepo,
      id: 'repo-win',
      path: 'C:\\proj\\.em\\repo',
      worktreeBasePath: '../..'
    }
    const wt = makeWorktree('win', 'C:\\proj\\series.a\\win', { repoId: windowsRepo.id })
    const grouping = buildDirectoryGrouping({
      worktrees: [wt],
      repoMap: new Map([[windowsRepo.id, windowsRepo]]),
      settings
    })
    expect(grouping.nodes).toHaveLength(1)
    expect(grouping.nodes[0]).toMatchObject({ label: 'series.a', depth: 0, worktrees: [wt] })
  })

  // Pins the default Orca layout end-to-end: nestWorkspaces: true (the default,
  // shared/constants.ts:175) with no worktreeBasePath — what most users see, not
  // just the em worktreeBasePath: '../..' setup the other cases exercise.
  it('groups a plain project (no worktreeBasePath) under one top-level group named after its repo folder', () => {
    const plainRepo: Repo = {
      id: 'repo-plain',
      path: '/home/me/orca/workspaces/plain-proj/main',
      displayName: 'plain-proj',
      badgeColor: '#000000',
      addedAt: 0
    }
    const featureX = makeWorktree('feature-x', '/home/me/orca/workspaces/plain-proj/feature-x', {
      repoId: plainRepo.id
    })
    const grouping = buildDirectoryGrouping({
      worktrees: [featureX],
      repoMap: new Map([[plainRepo.id, plainRepo]]),
      settings
    })
    expect(grouping.rootWorktrees).toEqual([])
    expect(grouping.nodes).toHaveLength(1)
    expect(grouping.nodes[0]).toMatchObject({
      label: 'plain-proj',
      depth: 0,
      worktrees: [featureX]
    })
  })
})
