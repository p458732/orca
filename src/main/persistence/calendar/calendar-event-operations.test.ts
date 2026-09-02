import { describe, expect, it, vi } from 'vitest'
import { buildCalendarAgenda } from '../../../shared/calendar-agenda'
import type { PersistedState } from '../../../shared/persisted-state-types'
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents
} from './calendar-event-operations'

const BASE = new Date(2026, 0, 5, 9, 0, 0).getTime()
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const LOCAL_MIDNIGHT = new Date(2026, 0, 5).getTime()

function makeOperations(calendarEvents: unknown[] = []) {
  const state = { calendarEvents } as unknown as PersistedState
  const flush = vi.fn()
  return { operations: { state, flush }, state, flush }
}

describe('calendar event operations', () => {
  it('creates an event, persists it, and flushes', () => {
    const { operations, state, flush } = makeOperations()
    const created = createCalendarEvent(operations, {
      title: 'Dentist',
      startAt: BASE,
      endAt: BASE + HOUR
    })
    expect(created.title).toBe('Dentist')
    expect(created.source).toBe('local')
    expect(created.allDay).toBe(false)
    expect(created.notes).toBeNull()
    expect(created.id).toBeTruthy()
    expect(state.calendarEvents).toHaveLength(1)
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it('rejects an event whose end precedes its start', () => {
    const { operations } = makeOperations()
    expect(() =>
      createCalendarEvent(operations, { title: 'Bad', startAt: BASE, endAt: BASE - HOUR })
    ).toThrow('Calendar event end must not precede its start.')
  })

  it('rejects a blank title', () => {
    const { operations } = makeOperations()
    expect(() =>
      createCalendarEvent(operations, { title: '   ', startAt: BASE, endAt: BASE + HOUR })
    ).toThrow('Calendar event title is required.')
  })

  it('trims the title', () => {
    const { operations } = makeOperations()
    expect(
      createCalendarEvent(operations, { title: '  Standup  ', startAt: BASE, endAt: BASE + HOUR })
        .title
    ).toBe('Standup')
  })

  it('lists events sorted by start time', () => {
    const { operations, state } = makeOperations()
    createCalendarEvent(operations, {
      title: 'Later',
      startAt: BASE + HOUR,
      endAt: BASE + 2 * HOUR
    })
    createCalendarEvent(operations, { title: 'Earlier', startAt: BASE, endAt: BASE + HOUR })
    expect(listCalendarEvents(state).map((entry) => entry.title)).toEqual(['Earlier', 'Later'])
  })

  it('drops malformed persisted entries instead of surfacing them', () => {
    const { state } = makeOperations([{ id: 'broken' }])
    expect(listCalendarEvents(state)).toEqual([])
  })

  it('deletes an event and flushes', () => {
    const { operations, state, flush } = makeOperations()
    const created = createCalendarEvent(operations, {
      title: 'Dentist',
      startAt: BASE,
      endAt: BASE + HOUR
    })
    flush.mockClear()
    deleteCalendarEvent(operations, created.id)
    expect(state.calendarEvents).toEqual([])
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it('deleting an unknown id is a no-op that still flushes', () => {
    const { operations, state } = makeOperations()
    deleteCalendarEvent(operations, 'missing')
    expect(state.calendarEvents).toEqual([])
  })
})

describe('all-day normalization', () => {
  it('widens a zero-length all-day event to the whole local day', () => {
    const { operations } = makeOperations()
    const created = createCalendarEvent(operations, {
      title: 'Holiday',
      startAt: LOCAL_MIDNIGHT,
      endAt: LOCAL_MIDNIGHT,
      allDay: true
    })
    expect(created.startAt).toBe(LOCAL_MIDNIGHT)
    expect(created.endAt).toBe(LOCAL_MIDNIGHT + DAY - 1)
  })

  it('gives --start D --end D+1 --all-day a genuinely two-day inclusive span', () => {
    const { operations } = makeOperations()
    const created = createCalendarEvent(operations, {
      title: 'Team offsite',
      startAt: LOCAL_MIDNIGHT,
      endAt: new Date(2026, 0, 6).getTime(),
      allDay: true
    })
    expect(created.startAt).toBe(LOCAL_MIDNIGHT)
    expect(created.endAt).toBe(new Date(2026, 0, 6).getTime() + DAY - 1)
  })

  it('snaps mid-day all-day bounds down/up to whole local days', () => {
    const { operations } = makeOperations()
    const created = createCalendarEvent(operations, {
      title: 'Conference',
      startAt: new Date(2026, 0, 5, 9, 30).getTime(),
      endAt: new Date(2026, 0, 6, 14, 15).getTime(),
      allDay: true
    })
    expect(created.startAt).toBe(LOCAL_MIDNIGHT)
    expect(created.endAt).toBe(new Date(2026, 0, 6).getTime() + DAY - 1)
  })

  // Why: the renderer may still post already-widened values during the transition.
  it('is idempotent on an already-normalized span', () => {
    const { operations } = makeOperations()
    const normalized = { startAt: LOCAL_MIDNIGHT, endAt: LOCAL_MIDNIGHT + DAY - 1 }
    const created = createCalendarEvent(operations, {
      title: 'Holiday',
      ...normalized,
      allDay: true
    })
    expect({ startAt: created.startAt, endAt: created.endAt }).toEqual(normalized)
  })

  it('leaves a timed event untouched', () => {
    const { operations } = makeOperations()
    const created = createCalendarEvent(operations, {
      title: 'Dentist',
      startAt: BASE,
      endAt: BASE + HOUR,
      allDay: false
    })
    expect({ startAt: created.startAt, endAt: created.endAt }).toEqual({
      startAt: BASE,
      endAt: BASE + HOUR
    })
  })

  // The reported failure: `orca calendar add --start D --all-day` writes an
  // event that `orca calendar agenda` (window starts at *now*) cannot read back.
  it('stays readable from an agenda window opened later the same day', () => {
    const { operations, state } = makeOperations()
    createCalendarEvent(operations, {
      title: 'Holiday',
      startAt: LOCAL_MIDNIGHT,
      endAt: LOCAL_MIDNIGHT,
      allDay: true
    })
    const now = new Date(2026, 0, 5, 10, 0).getTime()
    const agenda = buildCalendarAgenda({
      events: listCalendarEvents(state),
      automations: [],
      from: now,
      to: now + 7 * DAY
    })
    expect(agenda.entries.map((entry) => entry.kind)).toEqual(['event'])
  })
})
