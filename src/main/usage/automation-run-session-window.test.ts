import { describe, expect, it } from 'vitest'
import {
  AUTOMATION_ATTRIBUTION_WINDOW_MS,
  isProviderSessionActiveInRunWindow,
  subtractProviderSessionTotals
} from './automation-run-session-window'

const RUN_START = new Date('2026-09-04T15:15:00Z').getTime()
const RUN_END = new Date('2026-09-04T15:17:00Z').getTime()

function activeIn(firstTimestamp: string, lastTimestamp: string, sessionId = 'claude-1'): boolean {
  return isProviderSessionActiveInRunWindow({
    sessionId,
    firstTimestamp,
    lastTimestamp,
    terminalSessionId: 'orca-tab-1',
    startedAt: RUN_START,
    completedAt: RUN_END
  })
}

describe('isProviderSessionActiveInRunWindow', () => {
  it('matches a session reused across runs, whose first turn predates this one', () => {
    // The regression this exists for: `reuseSession` automations write every run into one
    // long-lived session, so a "starts inside the window" rule never matched again.
    expect(activeIn('2026-09-02T15:53:00Z', '2026-09-04T15:19:00Z')).toBe(true)
  })

  it('still matches a session created and finished inside the window', () => {
    expect(activeIn('2026-09-04T15:15:30Z', '2026-09-04T15:16:30Z')).toBe(true)
  })

  it('rejects a session whose last turn is outside the window either way', () => {
    expect(activeIn('2026-09-03T00:00:00Z', '2026-09-03T00:04:00Z')).toBe(false)
    expect(
      activeIn(
        '2026-09-04T15:15:00Z',
        new Date(RUN_END + AUTOMATION_ATTRIBUTION_WINDOW_MS + 1000).toISOString()
      )
    ).toBe(false)
  })

  it('always matches when the provider session id is the run terminal session', () => {
    expect(activeIn('2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z', 'orca-tab-1')).toBe(true)
  })

  it('rejects unparseable timestamps', () => {
    expect(activeIn('not-a-date', '2026-09-04T15:16:00Z')).toBe(false)
  })
})

describe('subtractProviderSessionTotals', () => {
  const absolute = { turns: 57, inputTokens: 1000, outputTokens: 200 }

  it('bills only the growth since the cursor for the same session', () => {
    expect(
      subtractProviderSessionTotals(absolute, 'claude-1', {
        providerSessionId: 'claude-1',
        totals: { turns: 50, inputTokens: 900, outputTokens: 150 }
      })
    ).toEqual({ turns: 7, inputTokens: 100, outputTokens: 50 })
  })

  it('bills the whole session when the cursor names a different one, or none', () => {
    expect(
      subtractProviderSessionTotals(absolute, 'claude-2', {
        providerSessionId: 'claude-1',
        totals: { turns: 50, inputTokens: 900, outputTokens: 150 }
      })
    ).toBe(absolute)
    expect(subtractProviderSessionTotals(absolute, 'claude-1', null)).toBe(absolute)
  })

  it('clamps at zero so a shrinking rescan cannot corrupt downstream totals', () => {
    expect(
      subtractProviderSessionTotals(absolute, 'claude-1', {
        providerSessionId: 'claude-1',
        totals: { turns: 99, inputTokens: 9999, outputTokens: 9999 }
      })
    ).toEqual({ turns: 0, inputTokens: 0, outputTokens: 0 })
  })

  it('treats a counter the cursor never saw as all-new', () => {
    expect(
      subtractProviderSessionTotals(absolute, 'claude-1', {
        providerSessionId: 'claude-1',
        totals: { turns: 50 }
      })
    ).toEqual({ turns: 7, inputTokens: 1000, outputTokens: 200 })
  })
})
