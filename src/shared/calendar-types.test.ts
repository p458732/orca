import { describe, expect, it } from 'vitest'
import { isCalendarEvent } from './calendar-types'

function makeEvent(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: 'evt-1',
    title: 'Standup',
    startAt: 1_700_000_000_000,
    endAt: 1_700_000_900_000,
    allDay: false,
    notes: null,
    source: 'local',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides
  }
}

describe('isCalendarEvent', () => {
  it('accepts a well-formed local event', () => {
    expect(isCalendarEvent(makeEvent())).toBe(true)
  })

  it('rejects an event whose end precedes its start', () => {
    expect(isCalendarEvent(makeEvent({ endAt: 1_600_000_000_000 }))).toBe(false)
  })

  it('rejects an unknown source so a newer build cannot silently downgrade', () => {
    expect(isCalendarEvent(makeEvent({ source: 'outlook' }))).toBe(false)
  })

  it('rejects non-object values', () => {
    expect(isCalendarEvent(null)).toBe(false)
    expect(isCalendarEvent('evt')).toBe(false)
  })

  it('accepts notes as null but rejects a non-string note', () => {
    expect(isCalendarEvent(makeEvent({ notes: 'bring laptop' }))).toBe(true)
    expect(isCalendarEvent(makeEvent({ notes: 42 }))).toBe(false)
  })
})
