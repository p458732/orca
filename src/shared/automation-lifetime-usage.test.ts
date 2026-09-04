import { describe, expect, it } from 'vitest'
import {
  accumulateAutomationLifetimeUsage,
  getAutomationUsagePerRun,
  type AutomationLifetimeUsage
} from './automation-lifetime-usage'
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

function run(id: string, usage: AutomationRunUsage | null, startedAt = 1000): AutomationRun {
  return {
    id,
    automationId: 'a1',
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
    const result = accumulateAutomationLifetimeUsage(
      undefined,
      [run('r1', knownUsage(), 1000), run('r2', knownUsage(), 2000)],
      'r2'
    )
    expect(result).toMatchObject({
      knownRuns: 2,
      costedRuns: 2,
      totalTokens: 2000,
      cacheTokens: 1400,
      estimatedCostUsd: 1,
      since: 1000
    })
  })

  it('adds only the named run once seeded', () => {
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
    const result = accumulateAutomationLifetimeUsage(
      seeded,
      [run('r1', knownUsage(), 1000), run('r2', knownUsage(), 2000)],
      'r2'
    )
    expect(result).toMatchObject({ knownRuns: 6, totalTokens: 6000, estimatedCostUsd: 3 })
  })

  it('survives retention pruning the runs the total was seeded from', () => {
    const seeded = accumulateAutomationLifetimeUsage(undefined, [run('r1', knownUsage())], 'r1')
    expect(seeded?.totalTokens).toBe(1000)
    // The seeding run is gone; only the new one is retained.
    const next = accumulateAutomationLifetimeUsage(
      seeded ?? undefined,
      [run('r2', knownUsage(), 9000)],
      'r2'
    )
    expect(next).toMatchObject({ knownRuns: 2, totalTokens: 2000 })
  })

  it('counts runs without a cost estimate in knownRuns but not costedRuns', () => {
    const result = accumulateAutomationLifetimeUsage(
      undefined,
      [run('r1', knownUsage()), run('r2', knownUsage({ estimatedCostUsd: null }))],
      'r2'
    )
    expect(result).toMatchObject({ knownRuns: 2, costedRuns: 1, estimatedCostUsd: 0.5 })
  })

  it('returns null when nothing is recordable', () => {
    expect(accumulateAutomationLifetimeUsage(undefined, [run('r1', null)], 'r1')).toBeNull()
    const seeded = accumulateAutomationLifetimeUsage(undefined, [run('r1', knownUsage())], 'r1')
    expect(
      accumulateAutomationLifetimeUsage(seeded ?? undefined, [run('r1', knownUsage())], 'missing')
    ).toBeNull()
  })
})

describe('accumulateAutomationLifetimeUsage double-count guard', () => {
  it('refuses a repeated completion report for the run just folded', () => {
    const runs = [run('r1', knownUsage(), 1000), run('r2', knownUsage(), 2000)]
    const seeded = accumulateAutomationLifetimeUsage(undefined, runs, 'r2')
    expect(seeded).toMatchObject({ knownRuns: 2, lastRunId: 'r2' })
    expect(accumulateAutomationLifetimeUsage(seeded ?? undefined, runs, 'r2')).toBeNull()
  })

  it('keeps refusing across a later fold', () => {
    const runs = [run('r1', knownUsage(), 1000), run('r2', knownUsage(), 2000)]
    const seeded = accumulateAutomationLifetimeUsage(undefined, [runs[0]], 'r1')
    const next = accumulateAutomationLifetimeUsage(seeded ?? undefined, runs, 'r2')
    expect(next).toMatchObject({ knownRuns: 2, lastRunId: 'r2' })
    expect(accumulateAutomationLifetimeUsage(next ?? undefined, runs, 'r2')).toBeNull()
  })
})

describe('getAutomationUsagePerRun', () => {
  it('averages cost over costed runs, not every known run', () => {
    expect(
      getAutomationUsagePerRun({
        knownRuns: 4,
        costedRuns: 2,
        totalTokens: 4000,
        estimatedCostUsd: 1
      })
    ).toEqual({ totalTokens: 1000, estimatedCostUsd: 0.5 })
  })

  it('defaults costedRuns to knownRuns for the retained-run summary', () => {
    expect(
      getAutomationUsagePerRun({ knownRuns: 2, totalTokens: 500, estimatedCostUsd: 1 })
    ).toEqual({ totalTokens: 250, estimatedCostUsd: 0.5 })
  })

  it('returns null without known runs and keeps an unknown cost unknown', () => {
    expect(
      getAutomationUsagePerRun({ knownRuns: 0, totalTokens: 0, estimatedCostUsd: null })
    ).toBeNull()
    expect(
      getAutomationUsagePerRun({ knownRuns: 2, totalTokens: 100, estimatedCostUsd: null })
    ).toEqual({ totalTokens: 50, estimatedCostUsd: null })
  })
})
