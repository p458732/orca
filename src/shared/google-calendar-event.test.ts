import { describe, expect, it } from 'vitest'
import { buildGoogleEventId, mapGoogleEvent, toCalendarEvent } from './google-calendar-event'

const CAL = 'primary@example.com'

describe('mapGoogleEvent — timed events', () => {
  it('parses an RFC3339 dateTime with an explicit offset to the exact instant', () => {
    const event = mapGoogleEvent(
      {
        id: 'evt1',
        status: 'confirmed',
        summary: 'Standup',
        start: { dateTime: '2026-08-20T09:00:00+08:00' },
        end: { dateTime: '2026-08-20T09:30:00+08:00' },
        updated: '2026-08-19T00:00:00.000Z'
      },
      CAL
    )
    expect(event).not.toBeNull()
    expect(event?.allDay).toBe(false)
    expect(event?.startAt).toBe(Date.parse('2026-08-20T09:00:00+08:00'))
    expect(event?.endAt).toBe(Date.parse('2026-08-20T09:30:00+08:00'))
  })
})

describe('mapGoogleEvent — all-day events', () => {
  it('treats a floating date as LOCAL midnight, not UTC midnight', () => {
    const event = mapGoogleEvent(
      {
        id: 'evt2',
        status: 'confirmed',
        summary: 'Holiday',
        start: { date: '2026-08-20' },
        end: { date: '2026-08-21' },
        updated: '2026-08-19T00:00:00.000Z'
      },
      CAL
    )
    expect(event?.allDay).toBe(true)
    expect(event?.startAt).toBe(new Date(2026, 7, 20).getTime())
  })

  it('converts Google exclusive end into our inclusive end', () => {
    const event = mapGoogleEvent(
      {
        id: 'evt3',
        status: 'confirmed',
        summary: 'One day off',
        start: { date: '2026-08-20' },
        end: { date: '2026-08-21' },
        updated: '2026-08-19T00:00:00.000Z'
      },
      CAL
    )
    expect(event?.endAt).toBe(new Date(2026, 7, 20, 23, 59, 59, 999).getTime())
  })

  it('spans a genuine multi-day all-day event', () => {
    const event = mapGoogleEvent(
      {
        id: 'evt4',
        status: 'confirmed',
        summary: 'Trip',
        start: { date: '2026-08-21' },
        end: { date: '2026-08-24' },
        updated: '2026-08-19T00:00:00.000Z'
      },
      CAL
    )
    expect(event?.startAt).toBe(new Date(2026, 7, 21).getTime())
    expect(event?.endAt).toBe(new Date(2026, 7, 23, 23, 59, 59, 999).getTime())
  })

  it('returns null rather than inventing a span when end.date is missing', () => {
    const event = mapGoogleEvent(
      {
        id: 'evt5',
        status: 'confirmed',
        summary: 'No end date',
        start: { date: '2026-08-20' },
        end: {},
        updated: '2026-08-19T00:00:00.000Z'
      },
      CAL
    )
    expect(event).toBeNull()
  })
})

describe('mapGoogleEvent — filtering and defaults', () => {
  const base = {
    id: 'evtX',
    status: 'confirmed',
    summary: 'X',
    start: { dateTime: '2026-08-20T09:00:00+08:00' },
    end: { dateTime: '2026-08-20T10:00:00+08:00' },
    updated: '2026-08-19T00:00:00.000Z'
  }

  it('skips a cancelled event', () => {
    expect(mapGoogleEvent({ ...base, status: 'cancelled' }, CAL)).toBeNull()
  })

  it('keeps a declined invitation and records its responseStatus', () => {
    const event = mapGoogleEvent(
      { ...base, attendees: [{ self: true, responseStatus: 'declined' }] },
      CAL
    )
    expect(event).not.toBeNull()
    expect(event?.responseStatus).toBe('declined')
  })

  it('falls back to a placeholder title when summary is missing', () => {
    const event = mapGoogleEvent({ ...base, summary: undefined }, CAL)
    expect(event?.title.length).toBeGreaterThan(0)
  })

  it('prefixes the id so it cannot collide with a local UUID', () => {
    expect(mapGoogleEvent(base, CAL)?.id).toBe(buildGoogleEventId(CAL, 'evtX'))
    expect(buildGoogleEventId(CAL, 'evtX').startsWith('google:')).toBe(true)
  })

  it('returns null for malformed input rather than throwing', () => {
    expect(mapGoogleEvent(null, CAL)).toBeNull()
    expect(mapGoogleEvent({ id: 'no-times', status: 'confirmed' }, CAL)).toBeNull()
    expect(mapGoogleEvent({ status: 'confirmed', start: {}, end: {} }, CAL)).toBeNull()
  })
})

describe('mapGoogleEvent — deeper malformed-input paths', () => {
  it('returns null when start.date fails the YYYY-MM-DD shape check', () => {
    const event = mapGoogleEvent(
      {
        id: 'evt-bad-date-shape',
        status: 'confirmed',
        summary: 'Bad shape',
        start: { date: '20-08-2026' },
        end: { date: '2026-08-21' },
        updated: '2026-08-19T00:00:00.000Z'
      },
      CAL
    )
    expect(event).toBeNull()
  })

  // Surfacing actual behavior, not endorsing it: parseFloatingDate's regex only
  // checks digit shape, not calendar range, so an out-of-range month/day rolls
  // forward via JS Date arithmetic instead of being rejected.
  it('rolls a shape-valid but calendar-nonsense date forward rather than rejecting it', () => {
    const event = mapGoogleEvent(
      {
        id: 'evt-nonsense-date',
        status: 'confirmed',
        summary: 'Nonsense date',
        start: { date: '2026-13-45' },
        end: { date: '2026-13-46' },
        updated: '2026-08-19T00:00:00.000Z'
      },
      CAL
    )
    expect(event).not.toBeNull()
    expect(event?.startAt).toBe(new Date(2026, 12, 45).getTime())
    expect(event?.endAt).toBe(new Date(2026, 12, 45, 23, 59, 59, 999).getTime())
  })

  it('returns null when start.dateTime is not a parsable timestamp', () => {
    const event = mapGoogleEvent(
      {
        id: 'evt-bad-start-datetime',
        status: 'confirmed',
        summary: 'Bad start',
        start: { dateTime: 'not-a-timestamp' },
        end: { dateTime: '2026-08-20T10:00:00+08:00' },
        updated: '2026-08-19T00:00:00.000Z'
      },
      CAL
    )
    expect(event).toBeNull()
  })

  it('returns null when end.dateTime is not a parsable timestamp', () => {
    const event = mapGoogleEvent(
      {
        id: 'evt-bad-end-datetime',
        status: 'confirmed',
        summary: 'Bad end',
        start: { dateTime: '2026-08-20T09:00:00+08:00' },
        end: { dateTime: 'not-a-timestamp' },
        updated: '2026-08-19T00:00:00.000Z'
      },
      CAL
    )
    expect(event).toBeNull()
  })
})

describe('toCalendarEvent', () => {
  it('produces a CalendarEvent tagged as google', () => {
    const google = mapGoogleEvent(
      {
        id: 'evtC',
        status: 'confirmed',
        summary: 'Review',
        start: { dateTime: '2026-08-20T09:00:00+08:00' },
        end: { dateTime: '2026-08-20T10:00:00+08:00' },
        updated: '2026-08-19T00:00:00.000Z'
      },
      CAL
    )
    const event = toCalendarEvent(google!)
    expect(event.source).toBe('google')
    expect(event.id).toBe(google!.id)
    expect(event.title).toBe('Review')
    expect(event.startAt).toBe(google!.startAt)
    expect(event.endAt).toBe(google!.endAt)
  })
})

// Why: Google's exclusive end.date must step back one CALENDAR day — a 23-hour
// spring-forward day made `- DAY_MS` drop the final day of the trip entirely.
describe('mapGoogleEvent — all-day events across a DST boundary', () => {
  function allDay(startDate: string, endDate: string) {
    return mapGoogleEvent(
      {
        id: 'evt-dst',
        status: 'confirmed',
        summary: 'Trip',
        start: { date: startDate },
        end: { date: endDate },
        updated: '2026-03-01T00:00:00.000Z'
      },
      CAL
    )
  }

  it('keeps the last day of a Fri–Sun trip that crosses spring forward', () => {
    const event = allDay('2026-03-06', '2026-03-09')
    expect(event?.startAt).toBe(new Date(2026, 2, 6).getTime())
    expect(event?.endAt).toBe(new Date(2026, 2, 8, 23, 59, 59, 999).getTime())
  })

  it('maps a single all-day event on the spring-forward day to that day alone', () => {
    const event = allDay('2026-03-08', '2026-03-09')
    expect(event?.startAt).toBe(new Date(2026, 2, 8).getTime())
    expect(event?.endAt).toBe(new Date(2026, 2, 8, 23, 59, 59, 999).getTime())
  })

  it('keeps the last day of a span that crosses fall back', () => {
    const event = allDay('2026-10-30', '2026-11-02')
    expect(event?.startAt).toBe(new Date(2026, 9, 30).getTime())
    expect(event?.endAt).toBe(new Date(2026, 10, 1, 23, 59, 59, 999).getTime())
  })
})
