import { randomUUID } from 'node:crypto'
import { isCalendarEvent, type CalendarEvent } from '../../../shared/calendar-types'
import type { PersistedState } from '../../../shared/persisted-state-types'
import type { StoreOwnedPersistedState } from '../loading-store/store-owned-state'

export type CalendarEventOperations = {
  state: StoreOwnedPersistedState
  flush: () => void
}

export type CalendarEventCreateInput = {
  title: string
  startAt: number
  endAt: number
  allDay?: boolean
  notes?: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** The one all-day convention: whole local days with an INCLUSIVE end, so the
 *  CLI and the renderer store identical instants for the same days. Idempotent,
 *  because a normalized end is still inside its own last local day. */
function normalizeAllDaySpan(startAt: number, endAt: number): { startAt: number; endAt: number } {
  const start = startOfLocalDay(startAt)
  return { startAt: start, endAt: Math.max(startOfLocalDay(endAt), start) + DAY_MS - 1 }
}

export function listCalendarEvents(state: PersistedState): CalendarEvent[] {
  // Why: a hand-edited or downgraded sidecar can hold junk; drop it rather than
  // letting a malformed row reach the agenda builder.
  return (state.calendarEvents ?? [])
    .filter((entry): entry is CalendarEvent => isCalendarEvent(entry))
    .sort((left, right) => left.startAt - right.startAt)
}

export function createCalendarEvent(
  operations: CalendarEventOperations,
  input: CalendarEventCreateInput
): CalendarEvent {
  const title = input.title.trim()
  if (!title) {
    throw new Error('Calendar event title is required.')
  }
  if (input.endAt < input.startAt) {
    throw new Error('Calendar event end must not precede its start.')
  }
  const allDay = input.allDay ?? false
  // Normalize after validating, so a genuinely inverted range still errors.
  const span = allDay
    ? normalizeAllDaySpan(input.startAt, input.endAt)
    : { startAt: input.startAt, endAt: input.endAt }
  const now = Date.now()
  const event: CalendarEvent = {
    id: randomUUID(),
    title,
    startAt: span.startAt,
    endAt: span.endAt,
    allDay,
    notes: input.notes ?? null,
    source: 'local',
    createdAt: now,
    updatedAt: now
  }
  operations.state.calendarEvents = [...(operations.state.calendarEvents ?? []), event]
  operations.flush()
  return event
}

export function deleteCalendarEvent(operations: CalendarEventOperations, id: string): void {
  operations.state.calendarEvents = (operations.state.calendarEvents ?? []).filter(
    (entry) => entry.id !== id
  )
  operations.flush()
}
