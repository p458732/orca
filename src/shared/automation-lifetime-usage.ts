import type { AutomationRun, AutomationRunUsage } from './automations-types'

/** Why: run history is pruned per automation, so a frequent schedule's spend leaves the
 *  run table within a day and the retained-run totals silently reset. These accumulate
 *  once per completed run and are never pruned. */
export type AutomationLifetimeUsage = {
  knownRuns: number
  /** Runs that contributed a cost estimate; the rest ran on models with no pricing. */
  costedRuns: number
  inputTokens: number
  outputTokens: number
  cacheTokens: number
  reasoningOutputTokens: number
  totalTokens: number
  estimatedCostUsd: number | null
  /** Earliest run counted — totals reach back no further than the runs retained when seeded. */
  since: number | null
  /** Why: a total that double-counts can never be repaired, and completion can be
   *  reported twice for one run. Folding the same run id twice is refused. */
  lastRunId: string | null
}

const EMPTY_LIFETIME_USAGE: AutomationLifetimeUsage = {
  knownRuns: 0,
  costedRuns: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
  estimatedCostUsd: null,
  since: null,
  lastRunId: null
}

function addRunUsage(
  total: AutomationLifetimeUsage,
  usage: AutomationRunUsage,
  runAt: number,
  runId: string
): AutomationLifetimeUsage {
  const cost = usage.estimatedCostUsd
  return {
    knownRuns: total.knownRuns + 1,
    costedRuns: cost === null ? total.costedRuns : total.costedRuns + 1,
    inputTokens: total.inputTokens + (usage.inputTokens ?? 0),
    outputTokens: total.outputTokens + (usage.outputTokens ?? 0),
    cacheTokens: total.cacheTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0),
    reasoningOutputTokens: total.reasoningOutputTokens + (usage.reasoningOutputTokens ?? 0),
    totalTokens: total.totalTokens + (usage.totalTokens ?? 0),
    estimatedCostUsd: cost === null ? total.estimatedCostUsd : (total.estimatedCostUsd ?? 0) + cost,
    since: total.since === null ? runAt : Math.min(total.since, runAt),
    lastRunId: runId
  }
}

/**
 * New lifetime totals for an automation, or null when there is nothing to record.
 * Seeds from every retained run the first time so automations that predate the
 * counter do not restart from zero; afterwards only `runId` is added.
 *
 * Assumes the caller folds each run exactly once, as `runId` completes — the run
 * writer commits the usage write and this fold in one synchronous step, so a run
 * can never be folded before an earlier one. `lastRunId` covers the one repeat
 * that survives that: the same completion reported twice.
 */
export function accumulateAutomationLifetimeUsage(
  current: AutomationLifetimeUsage | undefined,
  runs: readonly AutomationRun[],
  runId: string
): AutomationLifetimeUsage | null {
  if (!current) {
    let seeded = EMPTY_LIFETIME_USAGE
    for (const run of runs) {
      if (run.usage?.status === 'known') {
        seeded = addRunUsage(seeded, run.usage, run.startedAt ?? run.createdAt, run.id)
      }
    }
    // Why: the seed already counted `runId`, so the guard below must name it — the
    // iteration order otherwise leaves some other run as the last folded one.
    return seeded.knownRuns > 0 ? { ...seeded, lastRunId: runId } : null
  }
  if (current.lastRunId === runId) {
    return null
  }
  const run = runs.find((entry) => entry.id === runId)
  const usage = run?.usage
  if (!run || !usage || usage.status !== 'known') {
    return null
  }
  return addRunUsage(current, usage, run.startedAt ?? run.createdAt, run.id)
}

export type AutomationUsagePerRun = {
  totalTokens: number
  estimatedCostUsd: number | null
}

/**
 * Per-run averages. Accepts the retained-run summary too, whose every known run
 * carries a cost when any does, so `costedRuns` defaults to `knownRuns`.
 */
export function getAutomationUsagePerRun(
  usage:
    | {
        knownRuns: number
        costedRuns?: number
        totalTokens: number
        estimatedCostUsd: number | null
      }
    | null
    | undefined
): AutomationUsagePerRun | null {
  if (!usage || usage.knownRuns <= 0) {
    return null
  }
  const costedRuns = usage.costedRuns ?? usage.knownRuns
  return {
    totalTokens: usage.totalTokens / usage.knownRuns,
    estimatedCostUsd:
      usage.estimatedCostUsd === null || costedRuns <= 0
        ? null
        : usage.estimatedCostUsd / costedRuns
  }
}
