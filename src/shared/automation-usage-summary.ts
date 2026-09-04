import type { AutomationRun, AutomationRunStatus, AutomationRunUsage } from './automations-types'

/** The fields every per-automation usage total carries, however it was accumulated. */
export type AutomationUsageTotals = {
  knownRuns: number
  /** Runs that reported a cost; the rest ran on models with no pricing. Absent on
   *  summaries received from a host that predates the field. */
  costedRuns?: number
  inputTokens: number
  outputTokens: number
  cacheTokens: number
  reasoningOutputTokens: number
  totalTokens: number
  estimatedCostUsd: number | null
}

export const EMPTY_AUTOMATION_USAGE_TOTALS: AutomationUsageTotals = {
  knownRuns: 0,
  costedRuns: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
  estimatedCostUsd: null
}

/** One run's usage folded into a running total. Shared so the retained-run summary and
 *  the lifetime record cannot drift apart on what "total tokens" means. */
export function foldAutomationRunUsage(
  totals: AutomationUsageTotals,
  usage: AutomationRunUsage
): AutomationUsageTotals {
  const cost = usage.estimatedCostUsd
  return {
    knownRuns: totals.knownRuns + 1,
    costedRuns: (totals.costedRuns ?? 0) + (cost === null ? 0 : 1),
    inputTokens: totals.inputTokens + (usage.inputTokens ?? 0),
    outputTokens: totals.outputTokens + (usage.outputTokens ?? 0),
    cacheTokens: totals.cacheTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0),
    reasoningOutputTokens: totals.reasoningOutputTokens + (usage.reasoningOutputTokens ?? 0),
    totalTokens: totals.totalTokens + (usage.totalTokens ?? 0),
    estimatedCostUsd:
      cost === null ? totals.estimatedCostUsd : (totals.estimatedCostUsd ?? 0) + cost
  }
}

/** Per-run averages. Cost divides by the runs that priced, tokens by every known run. */
export function getAutomationUsagePerRun(
  totals: AutomationUsageTotals | null | undefined
): { totalTokens: number; estimatedCostUsd: number | null } | null {
  if (!totals || totals.knownRuns <= 0) {
    return null
  }
  const costedRuns = totals.costedRuns ?? totals.knownRuns
  return {
    totalTokens: totals.totalTokens / totals.knownRuns,
    estimatedCostUsd:
      totals.estimatedCostUsd === null || costedRuns <= 0
        ? null
        : totals.estimatedCostUsd / costedRuns
  }
}

export type AutomationUsageSummary = AutomationUsageTotals & {
  unavailableRuns: number
  /** Newest retained run's status, so list filters never fetch run history. Optional: older projections omit it. */
  lastRunStatus?: AutomationRunStatus | null
  lastRunAt?: number | null
}

/** Bounded aggregate over an authority's retained runs; never fetches history. */
export function summarizeAutomationRunUsage(
  runs: readonly AutomationRun[]
): AutomationUsageSummary {
  let totals = EMPTY_AUTOMATION_USAGE_TOTALS
  let unavailableRuns = 0
  let latest: AutomationRun | null = null

  for (const run of runs) {
    if (!latest || run.createdAt > latest.createdAt) {
      latest = run
    }
    if (run.usage?.status !== 'known') {
      unavailableRuns++
      continue
    }
    totals = foldAutomationRunUsage(totals, run.usage)
  }

  return {
    ...totals,
    unavailableRuns,
    lastRunStatus: latest?.status ?? null,
    lastRunAt: latest ? (latest.dispatchedAt ?? latest.startedAt ?? latest.createdAt ?? null) : null
  }
}
