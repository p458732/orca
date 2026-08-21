import type { Automation } from './automations-types'
import { nextAutomationOccurrenceAfter } from './automation-schedules'
import type { CalendarEvent } from './calendar-types'

/** Hard ceiling so a wide window over an hourly rule cannot expand unbounded.
 *  Mirrors the CRON_SCAN cap in automation-schedules.ts. */
export const AGENDA_MAX_ENTRIES = 500

export type AgendaEntry =
  | { kind: 'event'; startAt: number; endAt: number; event: CalendarEvent }
  | { kind: 'automation-run'; startAt: number; automationId: string; name: string }

/** `truncated` means the ceiling dropped something the window really contained,
 *  so a caller can say so instead of silently showing a short agenda. */
export type CalendarAgenda = { entries: AgendaEntry[]; truncated: boolean }

function collectEventEntries(
  events: readonly CalendarEvent[],
  from: number,
  to: number
): AgendaEntry[] {
  // Overlap, not containment: a meeting straddling midnight belongs to both days.
  return events
    .filter((event) => event.startAt < to && event.endAt >= from)
    .map((event) => ({
      kind: 'event' as const,
      startAt: event.startAt,
      endAt: event.endAt,
      event
    }))
    .sort((left, right) => left.startAt - right.startAt)
}

/** Returns true if `budget` cut the expansion short (there was another run to add).
 *
 *  One malformed automation must not blank the rest of the agenda: a throw here
 *  (e.g. an unparseable rrule) is caught so it only stops this automation's own
 *  while loop, never the accumulation across the other automations. */
function expandAutomationInto(
  entries: AgendaEntry[],
  automation: Automation,
  from: number,
  to: number,
  budget: number
): boolean {
  try {
    let cursor = from - 1
    for (;;) {
      const next = nextAutomationOccurrenceAfter(automation.rrule, automation.dtstart, cursor)
      if (!Number.isFinite(next) || next > to) {
        return false
      }
      if (entries.length >= budget) {
        return true
      }
      entries.push({
        kind: 'automation-run',
        startAt: next,
        automationId: automation.id,
        name: automation.name
      })
      // Why: guard against a rule that returns the same instant forever.
      if (next <= cursor) {
        return false
      }
      cursor = next
    }
  } catch {
    // Unresolvable schedule: skip this automation, keep the rest of the agenda.
    return false
  }
}

function collectAutomationEntries(
  automations: readonly Automation[],
  from: number,
  to: number,
  budget: number
): CalendarAgenda {
  const entries: AgendaEntry[] = []
  let truncated = false
  for (const automation of automations) {
    if (!automation.enabled) {
      continue
    }
    if (expandAutomationInto(entries, automation, from, to, budget)) {
      truncated = true
    }
  }
  return { entries, truncated }
}

/** Events are taken first, then external events, and automation expansion only
 *  gets what is left, so a busy provider or automation can never push a user's
 *  own event out of the agenda. */
export function buildCalendarAgenda(args: {
  events: readonly CalendarEvent[]
  /** Provider-sourced events (already mapped). Budgeted AFTER the user's own so a
   *  busy external calendar can never evict something the user wrote. */
  externalEvents?: readonly CalendarEvent[]
  automations: readonly Automation[]
  from: number
  to: number
}): CalendarAgenda {
  if (args.to <= args.from) {
    return { entries: [], truncated: false }
  }
  const matchedEvents = collectEventEntries(args.events, args.from, args.to)
  const eventEntries = matchedEvents.slice(0, AGENDA_MAX_ENTRIES)
  const matchedExternal = collectEventEntries(args.externalEvents ?? [], args.from, args.to)
  const externalEntries = matchedExternal.slice(0, AGENDA_MAX_ENTRIES - eventEntries.length)
  const automations = collectAutomationEntries(
    args.automations,
    args.from,
    args.to,
    AGENDA_MAX_ENTRIES - eventEntries.length - externalEntries.length
  )
  const entries = [...eventEntries, ...externalEntries, ...automations.entries]
  entries.sort((left, right) => left.startAt - right.startAt)
  return {
    entries,
    truncated:
      matchedEvents.length > eventEntries.length ||
      matchedExternal.length > externalEntries.length ||
      automations.truncated
  }
}
