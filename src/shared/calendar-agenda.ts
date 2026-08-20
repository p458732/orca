import type { Automation } from './automations-types'
import { nextAutomationOccurrenceAfter } from './automation-schedules'
import type { CalendarEvent } from './calendar-types'

/** Hard ceiling so a wide window over an hourly rule cannot expand unbounded.
 *  Mirrors the CRON_SCAN cap in automation-schedules.ts. */
export const AGENDA_MAX_ENTRIES = 500

export type AgendaEntry =
  | { kind: 'event'; startAt: number; endAt: number; event: CalendarEvent }
  | { kind: 'automation-run'; startAt: number; automationId: string; name: string }

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
}

/** One malformed automation must not blank the rest of the agenda: a throw here
 *  (e.g. an unparseable rrule) is caught so it only stops this automation's own
 *  while loop, never the accumulation across the other automations. */
function expandAutomationInto(
  entries: AgendaEntry[],
  automation: Automation,
  from: number,
  to: number
): void {
  try {
    let cursor = from - 1
    while (entries.length < AGENDA_MAX_ENTRIES) {
      const next = nextAutomationOccurrenceAfter(automation.rrule, automation.dtstart, cursor)
      if (!Number.isFinite(next) || next > to) {
        break
      }
      entries.push({
        kind: 'automation-run',
        startAt: next,
        automationId: automation.id,
        name: automation.name
      })
      // Why: guard against a rule that returns the same instant forever.
      if (next <= cursor) {
        break
      }
      cursor = next
    }
  } catch {
    // Unresolvable schedule: skip this automation, keep the rest of the agenda.
  }
}

function collectAutomationEntries(
  automations: readonly Automation[],
  from: number,
  to: number
): AgendaEntry[] {
  const entries: AgendaEntry[] = []
  for (const automation of automations) {
    if (!automation.enabled) {
      continue
    }
    expandAutomationInto(entries, automation, from, to)
  }
  return entries
}

export function buildCalendarAgenda(args: {
  events: readonly CalendarEvent[]
  automations: readonly Automation[]
  from: number
  to: number
}): AgendaEntry[] {
  if (args.to <= args.from) {
    return []
  }
  const merged = [
    ...collectEventEntries(args.events, args.from, args.to),
    ...collectAutomationEntries(args.automations, args.from, args.to)
  ]
  merged.sort((left, right) => left.startAt - right.startAt)
  return merged.slice(0, AGENDA_MAX_ENTRIES)
}
