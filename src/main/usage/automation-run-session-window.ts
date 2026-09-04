import type { AutomationProviderSessionTotals } from '../../shared/automation-provider-session-totals'

export const AUTOMATION_ATTRIBUTION_WINDOW_MS = 5 * 60_000

type SessionWindowInput = {
  sessionId: string
  firstTimestamp: string
  lastTimestamp: string
  terminalSessionId: string | null
  startedAt: number
  completedAt: number
}

/**
 * Whether a provider session was written during a run's window.
 *
 * Why the session's *last* turn decides it, not its first: an automation with
 * `reuseSession` writes every run into one long-lived session whose first turn predates
 * every run after the first, so a "session starts inside the window" rule can never match
 * one again. What identifies the run is that the session was still being written while it
 * ran; the caller then bills only the growth since the previous run.
 */
export function isProviderSessionActiveInRunWindow(input: SessionWindowInput): boolean {
  const first = new Date(input.firstTimestamp).getTime()
  const last = new Date(input.lastTimestamp).getTime()
  if (!Number.isFinite(first) || !Number.isFinite(last)) {
    return false
  }
  if (input.sessionId === input.terminalSessionId) {
    return true
  }
  return (
    last >= input.startedAt - AUTOMATION_ATTRIBUTION_WINDOW_MS &&
    last <= input.completedAt + AUTOMATION_ATTRIBUTION_WINDOW_MS
  )
}

/**
 * This run's share of a session's counters: the growth since `cursor`, or the whole
 * total when the cursor names a different session (or none). Counter names are
 * provider-specific, so only the subtraction is shared.
 */
export function subtractProviderSessionTotals<T extends Record<string, number>>(
  absolute: T,
  sessionId: string,
  cursor: AutomationProviderSessionTotals | null | undefined
): T {
  if (!cursor || cursor.providerSessionId !== sessionId) {
    return absolute
  }
  const delta = {} as Record<string, number>
  for (const [key, value] of Object.entries(absolute)) {
    // Why clamped: a rescan can rebuild a session smaller than it was recorded, and a
    // negative token count would corrupt every total downstream of it.
    delta[key] = Math.max(0, value - (cursor.totals[key] ?? 0))
  }
  return delta as T
}
