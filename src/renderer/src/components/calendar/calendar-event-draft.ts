import type { CalendarEventDraft } from './calendar-host-client'

const DATE_TIME_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/

export type CalendarEventDraftFields = {
  title: string
  start: string
  end: string
}

export type CalendarEventDraftError = 'title-required' | 'time-required' | 'end-before-start'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function toDateTimeLocalValue(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** `datetime-local` carries wall-clock text; build the Date from local parts so
 *  the value never round-trips through a UTC-flavoured parse. */
export function parseDateTimeLocalValue(value: string): number | null {
  const match = DATE_TIME_LOCAL_RE.exec(value.trim())
  if (!match) {
    return null
  }
  const [, year, month, day, hour, minute] = match
  const timestamp = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute)
  ).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

export function validateCalendarEventDraftFields(
  fields: CalendarEventDraftFields
): CalendarEventDraftError | null {
  if (!fields.title.trim()) {
    return 'title-required'
  }
  const startAt = parseDateTimeLocalValue(fields.start)
  const endAt = parseDateTimeLocalValue(fields.end)
  if (startAt === null || endAt === null) {
    return 'time-required'
  }
  return endAt < startAt ? 'end-before-start' : null
}

export function buildCalendarEventDraft(
  fields: CalendarEventDraftFields & { allDay: boolean; notes: string }
): CalendarEventDraft | null {
  if (validateCalendarEventDraftFields(fields) !== null) {
    return null
  }
  const startAt = parseDateTimeLocalValue(fields.start)
  const endAt = parseDateTimeLocalValue(fields.end)
  if (startAt === null || endAt === null) {
    return null
  }
  const notes = fields.notes.trim()
  // All-day widening belongs to the host (createCalendarEvent), so CLI- and
  // UI-created events land on identical instants; send the picked values as-is.
  return {
    title: fields.title.trim(),
    startAt,
    endAt,
    allDay: fields.allDay,
    notes: notes.length > 0 ? notes : null
  }
}
