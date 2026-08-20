import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../../../shared/repo-types'
import type { AppState } from '../../../../store/types'
import { getDirectoryGroupKey, resolveWorktreeGroupingRoot } from './directory-grouping'

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
