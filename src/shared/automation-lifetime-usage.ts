import type { AutomationRun, AutomationRunUsage } from './automations-types'
import {
  EMPTY_AUTOMATION_USAGE_TOTALS,
  foldAutomationRunUsage,
  type AutomationUsageTotals
} from './automation-usage-summary'

/** Why: run history is pruned per automation, so a frequent schedule's spend leaves the
 *  run table within a day and the retained-run summary silently resets. These totals are
 *  folded once per completed run and are never pruned. */
export type AutomationLifetimeUsage = AutomationUsageTotals & {
  costedRuns: number
  /** Earliest run counted — totals reach back no further than the runs retained when seeded. */
  since: number | null
  /** Why: a total that double-counts can never be repaired, and one completion can be
   *  reported twice. Folding the same run id twice is refused. */
  lastRunId: string | null
}

function build(
  totals: AutomationUsageTotals,
  since: number | null,
  lastRunId: string
): AutomationLifetimeUsage {
  return { ...totals, costedRuns: totals.costedRuns ?? 0, since, lastRunId }
}

function earlier(since: number | null, run: AutomationRun): number {
  const at = run.startedAt ?? run.createdAt
  return since === null ? at : Math.min(since, at)
}

/**
 * New lifetime totals for the automation `completedRun` belongs to, or null when there is
 * nothing to record. The first fold seeds from every run still retained for that
 * automation, so records predating the counter do not restart from zero; afterwards only
 * `completedRun` is added and `retainedRuns` goes unread.
 */
export function accumulateAutomationLifetimeUsage(
  current: AutomationLifetimeUsage | undefined,
  completedRun: AutomationRun,
  retainedRuns: readonly AutomationRun[]
): AutomationLifetimeUsage | null {
  const usage: AutomationRunUsage | null = completedRun.usage
  if (!usage || usage.status !== 'known' || current?.lastRunId === completedRun.id) {
    return null
  }
  if (current) {
    return build(
      foldAutomationRunUsage(current, usage),
      earlier(current.since, completedRun),
      completedRun.id
    )
  }
  let totals: AutomationUsageTotals = EMPTY_AUTOMATION_USAGE_TOTALS
  let since: number | null = null
  for (const run of retainedRuns) {
    if (run.automationId !== completedRun.automationId || run.usage?.status !== 'known') {
      continue
    }
    totals = foldAutomationRunUsage(totals, run.usage)
    since = earlier(since, run)
  }
  return build(totals, since, completedRun.id)
}
