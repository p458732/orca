import { describe, expect, it } from 'vitest'
import { buildGoogleEventId, mapGoogleEvent } from './google-calendar-event'

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
