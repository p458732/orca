import { describe, expect, it } from 'vitest'
import { getWeekBounds, groupAgendaByDay, shiftWeek } from './calendar-week-model'
import type { AgendaEntry } from '../../../../shared/calendar-agenda'

const DAY = 24 * 60 * 60 * 1000

function eventEntry(startAt: number, title: string): AgendaEntry {
  return {
    kind: 'event',
    startAt,
    endAt: startAt + 60 * 60 * 1000,
    event: {
      id: title,
      title,
      startAt,
      endAt: startAt + 60 * 60 * 1000,
      allDay: false,
      notes: null,
      source: 'local',
      createdAt: startAt,
      updatedAt: startAt
    }
  }
}

function spanEntry(startAt: number, endAt: number, title: string, allDay = false): AgendaEntry {
  return {
    kind: 'event',
    startAt,
    endAt,
    event: {
      id: title,
      title,
      startAt,
      endAt,
      allDay,
      notes: null,
      source: 'local',
      createdAt: startAt,
      updatedAt: startAt
    }
  }
}

/** A local-midnight week so every assertion holds in any timezone. */
function fixedWeek(): ReturnType<typeof getWeekBounds> {
  return getWeekBounds(new Date(2026, 7, 17, 10, 30).getTime())
}

function filledColumnIndexes(columns: ReturnType<typeof groupAgendaByDay>): number[] {
  return columns.flatMap((column, index) => (column.entries.length > 0 ? [index] : []))
}

describe('calendar week model', () => {
  it('spans exactly seven days', () => {
    const bounds = getWeekBounds(Date.now())
    expect(bounds.to - bounds.from).toBe(7 * DAY)
  })

  it('starts at a local midnight', () => {
    const bounds = getWeekBounds(Date.now())
    const start = new Date(bounds.from)
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    expect(start.getSeconds()).toBe(0)
    expect(start.getMilliseconds()).toBe(0)
  })

  it('shifts forward and back by one week', () => {
    const bounds = getWeekBounds(Date.now())
    expect(shiftWeek(bounds, 1).from).toBe(bounds.from + 7 * DAY)
    expect(shiftWeek(bounds, -1).from).toBe(bounds.from - 7 * DAY)
  })

  it('always produces seven columns even with no entries', () => {
    const bounds = getWeekBounds(Date.now())
    const columns = groupAgendaByDay([], bounds.from)
    expect(columns).toHaveLength(7)
    expect(columns.every((column) => column.entries.length === 0)).toBe(true)
  })

  it('places an entry in the column for its day', () => {
    const bounds = getWeekBounds(Date.now())
    const columns = groupAgendaByDay(
      [eventEntry(bounds.from + 2 * DAY + 9 * 60 * 60 * 1000, 'Dentist')],
      bounds.from
    )
    expect(columns[2].entries).toHaveLength(1)
    expect(columns.filter((column) => column.entries.length > 0)).toHaveLength(1)
  })

  it('ignores entries outside the week', () => {
    const bounds = getWeekBounds(Date.now())
    const columns = groupAgendaByDay([eventEntry(bounds.from - DAY, 'Last week')], bounds.from)
    expect(columns.every((column) => column.entries.length === 0)).toBe(true)
  })

  it('spreads a multi-day event across every column it covers', () => {
    const bounds = fixedWeek()
    const columns = groupAgendaByDay(
      [
        spanEntry(
          new Date(2026, 7, 18, 9, 0).getTime(),
          new Date(2026, 7, 20, 17, 0).getTime(),
          'Conference'
        )
      ],
      bounds.from
    )
    expect(filledColumnIndexes(columns)).toEqual([1, 2, 3])
    expect(columns[2].entries[0]).toMatchObject({ kind: 'event' })
  })

  it('draws an event that started before the window from the first column', () => {
    const bounds = fixedWeek()
    const columns = groupAgendaByDay(
      [
        spanEntry(
          new Date(2026, 7, 15, 9, 0).getTime(),
          new Date(2026, 7, 17, 14, 0).getTime(),
          'Long weekend'
        )
      ],
      bounds.from
    )
    expect(filledColumnIndexes(columns)).toEqual([0])
  })

  it('draws a two-day all-day event in both of its columns', () => {
    const bounds = fixedWeek()
    // The shape buildCalendarEventDraft produces: local midnight to end of day.
    const columns = groupAgendaByDay(
      [
        spanEntry(
          new Date(2026, 7, 18).getTime(),
          new Date(2026, 7, 19).getTime() + DAY - 1,
          'Offsite',
          true
        )
      ],
      bounds.from
    )
    expect(filledColumnIndexes(columns)).toEqual([1, 2])
  })

  it('keeps an event that ends exactly at midnight out of the next column', () => {
    const bounds = fixedWeek()
    const columns = groupAgendaByDay(
      [
        spanEntry(
          new Date(2026, 7, 18, 23, 0).getTime(),
          new Date(2026, 7, 19).getTime(),
          'Late call'
        )
      ],
      bounds.from
    )
    expect(filledColumnIndexes(columns)).toEqual([1])
  })

  it('ignores a multi-day event that ends before the window', () => {
    const bounds = fixedWeek()
    const columns = groupAgendaByDay(
      [
        spanEntry(
          new Date(2026, 7, 14, 9, 0).getTime(),
          new Date(2026, 7, 16, 17, 0).getTime(),
          'Last week'
        )
      ],
      bounds.from
    )
    expect(filledColumnIndexes(columns)).toEqual([])
  })

  it('keeps an automation run in exactly one column', () => {
    const bounds = fixedWeek()
    const columns = groupAgendaByDay(
      [
        {
          kind: 'automation-run',
          startAt: new Date(2026, 7, 19, 3, 0).getTime(),
          automationId: 'a1',
          name: 'Nightly'
        }
      ],
      bounds.from
    )
    expect(filledColumnIndexes(columns)).toEqual([2])
    expect(columns[2].entries).toHaveLength(1)
  })

  it('drops an automation run landing exactly on the window end bound', () => {
    const bounds = getWeekBounds(Date.now())
    const columns = groupAgendaByDay(
      [{ kind: 'automation-run', startAt: bounds.to, automationId: 'a1', name: 'Nightly' }],
      bounds.from
    )
    expect(columns).toHaveLength(7)
    expect(columns.every((column) => column.entries.length === 0)).toBe(true)
  })
})
