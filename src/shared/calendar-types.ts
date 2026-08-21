/** Calendar event sources. 'google' events are provider-fetched, never persisted
 *  the way 'local' events are — see toCalendarEvent in google-calendar-event.ts. */
export const CALENDAR_EVENT_SOURCES = ['local', 'google'] as const

export type CalendarEventSource = (typeof CALENDAR_EVENT_SOURCES)[number]

// Why: imported ids are `${prefix}:...` (see GOOGLE_EVENT_ID_PREFIX in
// google-calendar-event.ts); local ids are bare UUIDs and never contain a
// colon. A list (not a single hardcoded check) so a future provider only
// needs to add its prefix here, not a new one-off check at each call site.
const IMPORTED_CALENDAR_EVENT_ID_PREFIXES = ['google'] as const

/** True for any provider-imported event id. Imports are read-only by design —
 *  callers must reject deletion/mutation of these ids rather than silently
 *  no-op against a store that never contains them. */
export function isImportedCalendarEventId(id: string): boolean {
  return IMPORTED_CALENDAR_EVENT_ID_PREFIXES.some((prefix) => id.startsWith(`${prefix}:`))
}

export type CalendarEvent = {
  id: string
  title: string
  /** epoch ms — same unit as Automation.dtstart so both feed one agenda. */
  startAt: number
  endAt: number
  allDay: boolean
  notes: string | null
  source: CalendarEventSource
  createdAt: number
  updatedAt: number
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isCalendarEvent(value: unknown): value is CalendarEvent {
  if (!value || typeof value !== 'object') {
    return false
  }
  const event = value as Record<string, unknown>
  return (
    typeof event.id === 'string' &&
    event.id.length > 0 &&
    typeof event.title === 'string' &&
    isFiniteTimestamp(event.startAt) &&
    isFiniteTimestamp(event.endAt) &&
    event.endAt >= event.startAt &&
    typeof event.allDay === 'boolean' &&
    (event.notes === null || typeof event.notes === 'string') &&
    CALENDAR_EVENT_SOURCES.includes(event.source as CalendarEventSource) &&
    isFiniteTimestamp(event.createdAt) &&
    isFiniteTimestamp(event.updatedAt)
  )
}
