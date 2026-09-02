import { normalizeAllDaySpan, shiftLocalDay } from './calendar-day-span'
import type { CalendarEvent } from './calendar-types'

export const GOOGLE_EVENT_ID_PREFIX = 'google'

export type GoogleCalendarEvent = {
  id: string
  calendarId: string
  title: string
  startAt: number
  endAt: number
  allDay: boolean
  notes: string | null
  /** Kept unmapped for now so distinguishing declined invitations later needs no refetch. */
  responseStatus: string | null
  etag: string | null
  updatedAt: number
}

export function buildGoogleEventId(calendarId: string, eventId: string): string {
  return `${GOOGLE_EVENT_ID_PREFIX}:${calendarId}:${eventId}`
}

const UNTITLED = '(No title)'

/** Floating `YYYY-MM-DD` means "that day on this calendar" — Date.parse would
 *  read it as UTC midnight, landing a day early east of Greenwich. */
function parseFloatingDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return null
  }
  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

function readSelfResponseStatus(raw: Record<string, unknown>): string | null {
  const attendees = raw.attendees
  if (!Array.isArray(attendees)) {
    return null
  }
  const self = attendees.find(
    (entry) =>
      entry && typeof entry === 'object' && (entry as Record<string, unknown>).self === true
  ) as Record<string, unknown> | undefined
  return typeof self?.responseStatus === 'string' ? self.responseStatus : null
}

export function mapGoogleEvent(raw: unknown, calendarId: string): GoogleCalendarEvent | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const event = raw as Record<string, unknown>
  if (event.status === 'cancelled') {
    return null
  }
  const id = typeof event.id === 'string' ? event.id : null
  const start = event.start as Record<string, unknown> | undefined
  const end = event.end as Record<string, unknown> | undefined
  if (!id || !start || !end) {
    return null
  }

  const allDay = typeof start.date === 'string'
  let startAt: number | null
  let endAt: number | null
  if (allDay) {
    const rawStart = parseFloatingDate(start.date as string)
    const rawEnd = typeof end.date === 'string' ? parseFloatingDate(end.date as string) : null
    if (rawStart === null || rawEnd === null) {
      return null
    }
    // Why: Google's all-day `end.date` is exclusive — step back one CALENDAR day
    // (a DST day isn't 24h) before widening to this project's inclusive end.
    const span = normalizeAllDaySpan(rawStart, shiftLocalDay(rawEnd, -1))
    startAt = span.startAt
    endAt = span.endAt
  } else {
    startAt = typeof start.dateTime === 'string' ? Date.parse(start.dateTime) : null
    endAt = typeof end.dateTime === 'string' ? Date.parse(end.dateTime) : null
    if (startAt === null || endAt === null || Number.isNaN(startAt) || Number.isNaN(endAt)) {
      return null
    }
  }

  const updated = typeof event.updated === 'string' ? Date.parse(event.updated) : Number.NaN
  return {
    id: buildGoogleEventId(calendarId, id),
    calendarId,
    title: typeof event.summary === 'string' && event.summary.trim() ? event.summary : UNTITLED,
    startAt,
    endAt,
    allDay,
    notes: typeof event.description === 'string' ? event.description : null,
    responseStatus: readSelfResponseStatus(event),
    etag: typeof event.etag === 'string' ? event.etag : null,
    updatedAt: Number.isNaN(updated) ? 0 : updated
  }
}

/** Drops provider-only fields; the cache keeps the richer shape so adding UI for
 *  responseStatus later needs no refetch. */
export function toCalendarEvent(event: GoogleCalendarEvent): CalendarEvent {
  return {
    id: event.id,
    title: event.title,
    startAt: event.startAt,
    endAt: event.endAt,
    allDay: event.allDay,
    notes: event.notes,
    source: 'google',
    createdAt: event.updatedAt,
    updatedAt: event.updatedAt
  }
}
