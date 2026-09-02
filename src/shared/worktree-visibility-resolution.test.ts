import { describe, expect, it } from 'vitest'
import type { Repo } from './repo-types'
import { shouldShowWorktree } from './worktree-visibility-resolution'

const PROJECT = '/home/me/fp/20260805.series'

const repo: Repo = {
  id: 'r',
  path: PROJECT,
  displayName: 'series',
  badgeColor: '#000000',
  // Why after the rollout: a legacy repo takes an earlier branch and would not
  // exercise the scope rule at all.
  addedAt: Date.UTC(2026, 7, 1)
}

function show(args: {
  worktreePath: string
  projectFolderScopeActive?: boolean
  ownership?: 'external' | 'unknown-legacy' | 'orca-managed' | 'agent-scratch'
  repoOverrides?: Partial<Repo>
  importedExternalWorktreePaths?: string[]
}): boolean {
  return shouldShowWorktree({
    worktree: { path: args.worktreePath },
    ownership: args.ownership ?? 'unknown-legacy',
    repo: { ...repo, ...args.repoOverrides },
    isLegacyRepoForVisibility: false,
    isSelectedCheckout: args.worktreePath === PROJECT,
    projectFolderScopeActive: args.projectFolderScopeActive ?? false,
    importedExternalWorktreePaths: args.importedExternalWorktreePaths
  })
}

describe('shouldShowWorktree with the project-folder scope', () => {
  it('shows a worktree inside the project folder even when external visibility is hide', () => {
    expect(
      show({
        worktreePath: `${PROJECT}/exp-a`,
        projectFolderScopeActive: true,
        repoOverrides: { externalWorktreeVisibility: 'hide' }
      })
    ).toBe(true)
  })

  it('hides a sibling project’s worktree even when external visibility is show', () => {
    expect(
      show({
        worktreePath: '/home/me/fp/20260715.other/exp-b',
        projectFolderScopeActive: true,
        repoOverrides: { externalWorktreeVisibility: 'show' }
      })
    ).toBe(false)
  })

  it('leaves visibility unchanged when the scope is inactive', () => {
    expect(
      show({
        worktreePath: '/home/me/fp/20260715.other/exp-b',
        projectFolderScopeActive: false,
        repoOverrides: { externalWorktreeVisibility: 'show' }
      })
    ).toBe(true)
  })

  it('always shows the project checkout itself', () => {
    expect(show({ worktreePath: PROJECT, projectFolderScopeActive: true })).toBe(true)
  })

  it('never hides an Orca-managed worktree, even one outside the folder', () => {
    expect(
      show({
        worktreePath: '/somewhere/else/wt',
        ownership: 'orca-managed',
        projectFolderScopeActive: true
      })
    ).toBe(true)
  })

  it('never hides a worktree the user explicitly imported', () => {
    const imported = '/home/me/fp/20260715.other/exp-b'
    expect(
      show({
        worktreePath: imported,
        projectFolderScopeActive: true,
        importedExternalWorktreePaths: [imported]
      })
    ).toBe(true)
  })

  // Why these two: the scope must not become a blanket "show everything nested".
  // Agent scratch trees and configured sources carry their own hide policies, and
  // both typically live INSIDE the project folder, so an over-eager scope would
  // silently un-hide them.
  it('leaves an agent-scratch worktree hidden even when it sits inside the folder', () => {
    expect(
      show({
        worktreePath: `${PROJECT}/.claude/worktrees/scratch`,
        ownership: 'agent-scratch',
        projectFolderScopeActive: true
      })
    ).toBe(false)
  })

  it('lets a configured visibility source decide for a worktree inside the folder', () => {
    expect(
      shouldShowWorktree({
        worktree: { path: `${PROJECT}/.claude/worktrees/scratch` },
        ownership: 'external',
        repo: { ...repo, agentWorktreeVisibility: 'hide' },
        isLegacyRepoForVisibility: false,
        isSelectedCheckout: false,
        projectFolderScopeActive: true,
        visibilitySource: { kind: 'built-in', id: 'claude' }
      })
    ).toBe(false)
  })
})
