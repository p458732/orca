import { describe, expect, it } from 'vitest'
import {
  accumulateAutomationLifetimeUsage,
  type AutomationLifetimeUsage
} from './automation-lifetime-usage'
import { getAutomationUsagePerRun } from './automation-usage-summary'
import type { AutomationRun, AutomationRunUsage } from './automations-types'

function knownUsage(overrides: Partial<AutomationRunUsage> = {}): AutomationRunUsage {
  return {
    status: 'known',
    provider: 'claude',
    model: 'claude-opus-4',
    inputTokens: 100,
    outputTokens: 200,
    cacheReadTokens: 300,
    cacheWriteTokens: 400,
    reasoningOutputTokens: 0,
    totalTokens: 1000,
    estimatedCostUsd: 0.5,
    estimatedCostSource: 'api_equivalent',
    providerSessionId: 'session-1',
    attribution: null,
    collectedAt: 0,
    unavailableReason: null,
    unavailableMessage: null,
    ...overrides
  }
}

function run(
  id: string,
  usage: AutomationRunUsage | null,
  startedAt = 1000,
  automationId = 'a1'
): AutomationRun {
  return {
    id,
    automationId,
    title: id,
    scheduledFor: startedAt,
    status: 'completed',
    trigger: 'scheduled',
    workspaceId: 'w1',
    sessionKind: 'terminal',
    chatSessionId: null,
    terminalSessionId: null,
    terminalPaneKey: null,
    terminalPtyId: null,
    outputSnapshot: null,
    precheckResult: null,
    usage,
    error: null,
    startedAt,
    dispatchedAt: startedAt,
    createdAt: startedAt
  }
}

describe('accumulateAutomationLifetimeUsage', () => {
  it('seeds from every retained run so pre-existing automations do not restart at zero', () => {
    const first = run('r1', knownUsage(), 1000)
    const latest = run('r2', knownUsage(), 2000)
    expect(accumulateAutomationLifetimeUsage(undefined, latest, [first, latest])).toMatchObject({
      knownRuns: 2,
      costedRuns: 2,
      totalTokens: 2000,
      cacheTokens: 1400,
      estimatedCostUsd: 1,
      since: 1000,
      lastRunId: 'r2'
    })
  })

  it('ignores runs belonging to another automation while seeding', () => {
    const mine = run('r1', knownUsage(), 1000)
    const theirs = run('r9', knownUsage(), 500, 'other')
    expect(accumulateAutomationLifetimeUsage(undefined, mine, [mine, theirs])).toMatchObject({
      knownRuns: 1,
      totalTokens: 1000,
      since: 1000
    })
  })

  it('adds only the completed run once seeded', () => {
    const seeded: AutomationLifetimeUsage = {
      knownRuns: 5,
      costedRuns: 5,
      inputTokens: 0,
      outputTokens: 0,
      cacheTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 5000,
      estimatedCostUsd: 2.5,
      since: 500,
      lastRunId: 'r0'
    }
    const latest = run('r2', knownUsage(), 2000)
    expect(accumulateAutomationLifetimeUsage(seeded, latest, [])).toMatchObject({
      knownRuns: 6,
      totalTokens: 6000,
      estimatedCostUsd: 3,
      since: 500
    })
  })

  it('survives retention pruning the runs the total was seeded from', () => {
    const first = run('r1', knownUsage())
    const seeded = accumulateAutomationLifetimeUsage(undefined, first, [first])
    expect(seeded?.totalTokens).toBe(1000)
    // The seeding run is gone; only the new one is retained.
    const next = run('r2', knownUsage(), 9000)
    expect(accumulateAutomationLifetimeUsage(seeded ?? undefined, next, [next])).toMatchObject({
      knownRuns: 2,
      totalTokens: 2000
    })
  })

  it('counts runs without a cost estimate in knownRuns but not costedRuns', () => {
    const priced = run('r1', knownUsage())
    const unpriced = run('r2', knownUsage({ estimatedCostUsd: null }))
    expect(
      accumulateAutomationLifetimeUsage(undefined, unpriced, [priced, unpriced])
    ).toMatchObject({ knownRuns: 2, costedRuns: 1, estimatedCostUsd: 0.5 })
  })

  it('refuses a repeated completion report for the run just folded', () => {
    const only = run('r1', knownUsage())
    const seeded = accumulateAutomationLifetimeUsage(undefined, only, [only])
    expect(seeded).toMatchObject({ lastRunId: 'r1' })
    expect(accumulateAutomationLifetimeUsage(seeded ?? undefined, only, [only])).toBeNull()
  })

  it('returns null when the run reports no usable usage', () => {
    const none = run('r1', null)
    expect(accumulateAutomationLifetimeUsage(undefined, none, [none])).toBeNull()
    const unavailable = run('r2', { ...knownUsage(), status: 'unavailable' })
    expect(accumulateAutomationLifetimeUsage(undefined, unavailable, [unavailable])).toBeNull()
  })
})

describe('getAutomationUsagePerRun', () => {
  it('averages cost over costed runs, not every known run', () => {
    expect(
      getAutomationUsagePerRun({
        knownRuns: 4,
        costedRuns: 2,
        inputTokens: 0,
        outputTokens: 0,
        cacheTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 4000,
        estimatedCostUsd: 1
      })
    ).toEqual({ totalTokens: 1000, estimatedCostUsd: 0.5 })
  })

  it('falls back to knownRuns when a host predating costedRuns sent the summary', () => {
    expect(
      getAutomationUsagePerRun({
        knownRuns: 2,
        inputTokens: 0,
        outputTokens: 0,
        cacheTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 500,
        estimatedCostUsd: 1
      })
    ).toEqual({ totalTokens: 250, estimatedCostUsd: 0.5 })
  })

  it('returns null without known runs and keeps an unknown cost unknown', () => {
    const empty = {
      knownRuns: 0,
      costedRuns: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: null
    }
    expect(getAutomationUsagePerRun(empty)).toBeNull()
    expect(
      getAutomationUsagePerRun({ ...empty, knownRuns: 2, costedRuns: 0, totalTokens: 100 })
    ).toEqual({ totalTokens: 50, estimatedCostUsd: null })
  })
})
