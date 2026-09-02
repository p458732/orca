import { describe, expect, it } from 'vitest'
import { hasNestedProjectWorktrees } from './project-folder-scope'

describe('hasNestedProjectWorktrees', () => {
  const repoPath = '/home/me/fp/20260805.series'

  it('is true when a worktree lives inside the project folder', () => {
    expect(
      hasNestedProjectWorktrees(repoPath, [
        '/home/me/fp/20260805.series',
        '/home/me/fp/20260805.series/exp-a'
      ])
    ).toBe(true)
  })

  it('is false when every worktree is a sibling of the project folder', () => {
    expect(
      hasNestedProjectWorktrees('/Users/me/code/orca', [
        '/Users/me/code/orca',
        '/Users/me/orca/workspaces/orca/feature'
      ])
    ).toBe(false)
  })

  it('does not count the project folder itself as nested', () => {
    expect(hasNestedProjectWorktrees(repoPath, [repoPath])).toBe(false)
  })

  it('does not count a sibling whose name merely shares the prefix', () => {
    expect(hasNestedProjectWorktrees(repoPath, [`${repoPath}-extra/exp`])).toBe(false)
  })

  it('matches across separator styles on Windows paths', () => {
    expect(hasNestedProjectWorktrees('C:/proj/series', ['C:\\proj\\series\\exp'])).toBe(true)
  })
})
