import type { Automation } from '../../../shared/automations-types'
import type { PersistedState } from '../../../shared/persisted-state-types'
import { accumulateAutomationLifetimeUsage } from '../../../shared/automation-lifetime-usage'

/**
 * Folds one completed run's usage into the automation's lifetime totals. Returns
 * null when the automation is gone or the run reported no usage, so callers can
 * treat "nothing to record" as ordinary.
 */
export function recordAutomationLifetimeUsage(
  state: PersistedState,
  flush: () => void,
  automationId: string,
  runId: string
): Automation | null {
  const current = (state.automations ?? []).find((entry) => entry.id === automationId)
  if (!current) {
    return null
  }
  const lifetimeUsage = accumulateAutomationLifetimeUsage(
    current.lifetimeUsage,
    (state.automationRuns ?? []).filter((run) => run.automationId === automationId),
    runId
  )
  if (!lifetimeUsage) {
    return null
  }
  // Why: bookkeeping, not a definition edit — bumping updatedAt would churn every
  // consumer that treats it as "the user changed this automation".
  const updated = { ...current, lifetimeUsage }
  // Replaced, not patched in place: the list projection caches on array identity.
  state.automations = state.automations.map((entry) =>
    entry.id === automationId ? updated : entry
  )
  flush()
  return updated
}
