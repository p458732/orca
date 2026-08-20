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
  const now = Date.now()
  const event: CalendarEvent = {
    id: randomUUID(),
    title,
    startAt: input.startAt,
    endAt: input.endAt,
    allDay: input.allDay ?? false,
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
