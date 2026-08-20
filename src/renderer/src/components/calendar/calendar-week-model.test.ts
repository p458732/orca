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
