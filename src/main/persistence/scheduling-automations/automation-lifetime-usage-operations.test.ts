import { describe, expect, it, vi } from 'vitest'
import type {
  Automation,
  AutomationRun,
  AutomationRunUsage
} from '../../../shared/automations-types'
import type { PersistedState } from '../../../shared/persisted-state-types'
import { recordAutomationLifetimeUsage } from './automation-lifetime-usage-operations'

function knownUsage(totalTokens: number, cost: number | null): AutomationRunUsage {
  return {
    status: 'known',
    provider: 'claude',
    model: 'claude-opus-4',
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens,
    estimatedCostUsd: cost,
    estimatedCostSource: cost === null ? null : 'api_equivalent',
    providerSessionId: null,
    attribution: null,
    collectedAt: 0,
    unavailableReason: null,
    unavailableMessage: null
  }
}

function run(id: string, automationId: string, usage: AutomationRunUsage | null): AutomationRun {
  return {
    id,
    automationId,
    title: id,
    scheduledFor: 1000,
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
    startedAt: 1000,
    dispatchedAt: 1000,
    createdAt: 1000
  }
}

function automation(id: string, overrides: Partial<Automation> = {}): Automation {
  return {
    id,
    name: id,
    prompt: 'p',
    precheck: null,
    agentId: 'claude',
    projectId: 'r1',
    executionTargetType: 'local',
    executionTargetId: 'local',
    schedulerOwner: 'local_host_service',
    workspaceMode: 'existing',
    workspaceId: 'w1',
    baseBranch: null,
    reuseSession: false,
    timezone: 'UTC',
    rrule: 'FREQ=DAILY',
    dtstart: 0,
    enabled: true,
    nextRunAt: 0,
    missedRunPolicy: 'run_once_within_grace',
    missedRunGraceMinutes: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  }
}

function stateWith(automations: Automation[], runs: AutomationRun[]): PersistedState {
  return { automations, automationRuns: runs } as unknown as PersistedState
}

describe('recordAutomationLifetimeUsage', () => {
  it('seeds from the automation own runs and flushes', () => {
    const flush = vi.fn()
    const state = stateWith(
      [automation('a1'), automation('a2')],
      [
        run('r1', 'a1', knownUsage(100, 0.1)),
        run('r2', 'a1', knownUsage(200, 0.2)),
        run('r3', 'a2', knownUsage(999, 9))
      ]
    )
    const updated = recordAutomationLifetimeUsage(state, flush, 'a1', 'r2')
    expect(updated?.lifetimeUsage).toMatchObject({ knownRuns: 2, totalTokens: 300 })
    expect(flush).toHaveBeenCalledOnce()
    // The other automation's run must not leak in.
    expect(updated?.lifetimeUsage?.estimatedCostUsd).toBeCloseTo(0.3)
  })

  it('replaces the automations array so the list projection cache invalidates', () => {
    const before = stateWith([automation('a1')], [run('r1', 'a1', knownUsage(100, 0.1))])
    const original = before.automations
    recordAutomationLifetimeUsage(before, () => {}, 'a1', 'r1')
    expect(before.automations).not.toBe(original)
  })

  it('leaves updatedAt alone — usage bookkeeping is not a definition edit', () => {
    const state = stateWith(
      [automation('a1', { updatedAt: 42 })],
      [run('r1', 'a1', knownUsage(100, 0.1))]
    )
    expect(recordAutomationLifetimeUsage(state, () => {}, 'a1', 'r1')?.updatedAt).toBe(42)
  })

  it('returns null and does not flush when there is nothing to record', () => {
    const flush = vi.fn()
    const state = stateWith([automation('a1')], [run('r1', 'a1', null)])
    expect(recordAutomationLifetimeUsage(state, flush, 'a1', 'r1')).toBeNull()
    expect(recordAutomationLifetimeUsage(state, flush, 'missing', 'r1')).toBeNull()
    expect(flush).not.toHaveBeenCalled()
  })

  it('adds a later run on top of the seeded total', () => {
    const state = stateWith([automation('a1')], [run('r1', 'a1', knownUsage(100, 0.1))])
    const seeded = recordAutomationLifetimeUsage(state, () => {}, 'a1', 'r1')
    expect(seeded?.lifetimeUsage?.knownRuns).toBe(1)
    state.automationRuns = [run('r2', 'a1', knownUsage(50, 0.05))]
    const next = recordAutomationLifetimeUsage(state, () => {}, 'a1', 'r2')
    expect(next?.lifetimeUsage).toMatchObject({ knownRuns: 2, totalTokens: 150 })
  })
})
