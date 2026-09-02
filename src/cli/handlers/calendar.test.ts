import { describe, expect, it } from 'vitest'
import {
  formatAgenda,
  formatLocalAgendaTime,
  parseIsoToEpochMs,
  resolveAgendaWindow
} from './calendar'
import type { AgendaEntry } from '../../shared/calendar-agenda'

const NOW = Date.UTC(2026, 0, 5, 9, 0, 0)
const DAY = 24 * 60 * 60 * 1000

function eventEntry(startAt: number, title: string, allDay = false): AgendaEntry {
  return {
    kind: 'event',
    startAt,
    endAt: startAt + 60 * 60 * 1000,
    event: {
      id: title,
      title,
      startAt,
      endAt: startAt + 60 * 60 * 1000,
      allDay,
      notes: null,
      source: 'local',
      createdAt: startAt,
      updatedAt: startAt
    }
  }
}

describe('parseIsoToEpochMs', () => {
  it('parses a full ISO timestamp with an explicit zone to the exact UTC instant', () => {
    expect(parseIsoToEpochMs('2026-01-05T09:00:00Z', 'start')).toBe(NOW)
  })

  // Why: a bare date must mean *local* midnight (matching how events/week-grid
  // render), not UTC midnight — Date.parse alone gets this wrong.
  it('resolves a date-only string to local midnight', () => {
    expect(parseIsoToEpochMs('2026-01-05', 'start')).toBe(new Date(2026, 0, 5).getTime())
  })

  it('resolves a zoneless date-time to local time', () => {
    expect(parseIsoToEpochMs('2026-01-05T09:00:00', 'start')).toBe(
      new Date(2026, 0, 5, 9, 0, 0).getTime()
    )
  })

  it('throws a flag-named error on unparseable input', () => {
    expect(() => parseIsoToEpochMs('not-a-date', 'start')).toThrow(
      'Invalid --start: expected an ISO 8601 date-time'
    )
  })

  // Why: `new Date(y, m-1, d)` silently rolls an invalid calendar date forward
  // (e.g. Feb 30 -> Mar 2) instead of throwing — these must be rejected, not
  // land on the wrong day.
  it('rejects a February 30th', () => {
    expect(() => parseIsoToEpochMs('2026-02-30', 'start')).toThrow(
      'Invalid --start: expected an ISO 8601 date-time'
    )
  })

  it('rejects an April 31st', () => {
    expect(() => parseIsoToEpochMs('2026-04-31', 'start')).toThrow(
      'Invalid --start: expected an ISO 8601 date-time'
    )
  })

  it('rejects February 29th in a non-leap year', () => {
    expect(() => parseIsoToEpochMs('2026-02-29', 'start')).toThrow(
      'Invalid --start: expected an ISO 8601 date-time'
    )
  })

  it('accepts a real leap day and resolves it to local midnight', () => {
    expect(parseIsoToEpochMs('2028-02-29', 'start')).toBe(new Date(2028, 1, 29).getTime())
  })
})

describe('resolveAgendaWindow', () => {
  it('defaults to the next seven days', () => {
    expect(resolveAgendaWindow(new Map(), NOW)).toEqual({ from: NOW, to: NOW + 7 * DAY })
  })

  it('honours explicit bounds', () => {
    const flags = new Map<string, string | boolean>([
      ['from', '2026-01-05T00:00:00Z'],
      ['to', '2026-01-06T00:00:00Z']
    ])
    expect(resolveAgendaWindow(flags, NOW)).toEqual({
      from: Date.UTC(2026, 0, 5),
      to: Date.UTC(2026, 0, 6)
    })
  })

  it('rejects an inverted window', () => {
    const flags = new Map<string, string | boolean>([
      ['from', '2026-01-06T00:00:00Z'],
      ['to', '2026-01-05T00:00:00Z']
    ])
    expect(() => resolveAgendaWindow(flags, NOW)).toThrow('--to must be after --from')
  })
})

describe('formatAgenda', () => {
  // Why: `toISOString()` rendered UTC, so an all-day Jan 5 event printed as
  // Jan 4 in Asia/Taipei — the wrong day in the one output a human reads.
  it('prints the local wall-clock time, not UTC', () => {
    const nineAmLocal = new Date(2026, 0, 5, 9, 0).getTime()
    expect(formatAgenda({ entries: [eventEntry(nineAmLocal, 'Dentist')], truncated: false })).toBe(
      '2026-01-05 09:00  [event]       Dentist'
    )
  })

  it('prints an all-day event on its own local date', () => {
    const localMidnight = new Date(2026, 0, 5).getTime()
    expect(
      formatAgenda({ entries: [eventEntry(localMidnight, 'Holiday', true)], truncated: false })
    ).toBe('2026-01-05 00:00  [event]       Holiday')
  })

  it('formats a local timestamp without a UTC marker', () => {
    expect(formatLocalAgendaTime(new Date(2026, 11, 31, 23, 5).getTime())).toBe('2026-12-31 23:05')
  })

  it('reports an empty window', () => {
    expect(formatAgenda({ entries: [], truncated: false })).toBe(
      'No events or scheduled automation runs in this window.'
    )
  })

  it('says so when the agenda was capped', () => {
    const output = formatAgenda({
      entries: [eventEntry(new Date(2026, 0, 5, 9, 0).getTime(), 'Dentist')],
      truncated: true
    })
    expect(output).toContain(
      'Truncated: this window holds more entries than the agenda can return.'
    )
  })

  it('stays silent when nothing was capped', () => {
    const output = formatAgenda({
      entries: [eventEntry(new Date(2026, 0, 5, 9, 0).getTime(), 'Dentist')],
      truncated: false
    })
    expect(output).not.toContain('Truncated')
  })
})
