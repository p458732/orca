/** Calendar event sources. 'google' events are provider-fetched, never persisted
 *  the way 'local' events are — see toCalendarEvent in google-calendar-event.ts. */
export const CALENDAR_EVENT_SOURCES = ['local', 'google'] as const

export type CalendarEventSource = (typeof CALENDAR_EVENT_SOURCES)[number]

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
