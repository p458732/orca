import { describe, expect, it, vi } from 'vitest'
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents
} from './calendar-event-operations'
import type { StoreOwnedPersistedState } from '../loading-store/store-owned-state'

const BASE = Date.UTC(2026, 0, 5, 9, 0, 0)
const HOUR = 60 * 60 * 1000

function makeOperations(calendarEvents: unknown[] = []) {
  const state = { calendarEvents } as unknown as StoreOwnedPersistedState
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
