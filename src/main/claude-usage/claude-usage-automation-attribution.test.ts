import { describe, expect, it } from 'vitest'
import { resolveAutomationRunUsage } from './claude-usage-automation-attribution'
import type { ClaudeUsagePersistedState, ClaudeUsageSession } from './types'

const WORKTREE = 'wt-1'
const RUN_ONE_START = new Date('2026-09-03T15:15:00Z').getTime()
const RUN_TWO_START = new Date('2026-09-04T15:15:00Z').getTime()

function session(lastTimestamp: string, turns: number, inputTokens: number): ClaudeUsageSession {
  return {
    sessionId: 'claude-session-1',
    // Reused across days: the first turn predates every run after the first.
    firstTimestamp: '2026-09-02T15:53:00Z',
    lastTimestamp,
    model: 'claude-opus-4',
    lastCwd: '/repo',
    lastGitBranch: 'main',
    primaryWorktreeId: WORKTREE,
    primaryRepoId: 'repo-1',
    turnCount: turns,
    totalInputTokens: inputTokens,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheWriteTokens: 0,
    locationBreakdown: [
      {
        locationKey: WORKTREE,
        projectLabel: 'repo',
        repoId: 'repo-1',
        worktreeId: WORKTREE,
        turnCount: turns,
        inputTokens,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0
      }
    ]
  } as unknown as ClaudeUsageSession
}

function access(current: ClaudeUsageSession) {
  const state = {
    sessions: [current],
    scanState: {
      enabled: true,
      lastScanStartedAt: 0,
      lastScanCompletedAt: Number.MAX_SAFE_INTEGER,
      lastScanError: null
    }
  } as unknown as ClaudeUsagePersistedState
  return { getState: () => state, refresh: async () => ({ lastScanError: null }) }
}

describe('resolveAutomationRunUsage with a reused provider session', () => {
  it('attributes the first run the whole session, then bills each later run its growth', async () => {
    const first = await resolveAutomationRunUsage(
      {
        worktreeId: WORKTREE,
        terminalSessionId: 'orca-tab-1',
        startedAt: RUN_ONE_START,
        completedAt: RUN_ONE_START + 60_000,
        previousSessionTotals: null
      },
      access(session('2026-09-03T15:16:00Z', 30, 900))
    )
    expect(first).toMatchObject({
      status: 'known',
      inputTokens: 900,
      attribution: 'provider_session_time_window',
      providerSessionId: 'claude-session-1'
    })
    expect(first.sessionTotals?.totals.inputTokens).toBe(900)

    const second = await resolveAutomationRunUsage(
      {
        worktreeId: WORKTREE,
        terminalSessionId: 'orca-tab-1',
        startedAt: RUN_TWO_START,
        completedAt: RUN_TWO_START + 60_000,
        previousSessionTotals: first.sessionTotals
      },
      access(session('2026-09-04T15:16:00Z', 57, 1500))
    )
    // Only the 600 tokens added since the previous run, not the session's 1500.
    expect(second).toMatchObject({
      status: 'known',
      inputTokens: 600,
      attribution: 'provider_session_delta'
    })
    expect(second.sessionTotals?.totals.inputTokens).toBe(1500)
  })

  it('reports no match when the session was not written during the run window', async () => {
    const stale = await resolveAutomationRunUsage(
      {
        worktreeId: WORKTREE,
        terminalSessionId: 'orca-tab-1',
        startedAt: RUN_TWO_START,
        completedAt: RUN_TWO_START + 60_000,
        previousSessionTotals: null
      },
      access(session('2026-09-03T00:04:00Z', 30, 900))
    )
    expect(stale).toMatchObject({ status: 'unavailable', unavailableReason: 'no_matching_session' })
  })
})
