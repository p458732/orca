/**
 * A provider session's cumulative counters at the moment a run was attributed.
 *
 * An automation with `reuseSession` writes every run into one long-lived provider
 * session, so a run's own usage is the growth since the previous run — not the session
 * total. Counter names are provider-specific; only the arithmetic over them is shared.
 */
export type AutomationProviderSessionTotals = {
  providerSessionId: string
  totals: Record<string, number>
}
