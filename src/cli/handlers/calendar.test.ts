import { describe, expect, it } from 'vitest'
import { parseIsoToEpochMs, resolveAgendaWindow } from './calendar'

const NOW = Date.UTC(2026, 0, 5, 9, 0, 0)
const DAY = 24 * 60 * 60 * 1000

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
