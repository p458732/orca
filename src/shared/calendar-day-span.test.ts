import { describe, expect, it } from 'vitest'
import { normalizeAllDaySpan, startOfLocalDay } from './calendar-day-span'

describe('startOfLocalDay', () => {
  it('floors to local midnight', () => {
    const noon = new Date(2026, 7, 20, 12, 34, 56, 789).getTime()
    expect(startOfLocalDay(noon)).toBe(new Date(2026, 7, 20).getTime())
  })

  it('is idempotent on a value already at local midnight', () => {
    const midnight = new Date(2026, 7, 20).getTime()
    expect(startOfLocalDay(midnight)).toBe(midnight)
  })
})

describe('normalizeAllDaySpan', () => {
  it('widens a single day to an inclusive end', () => {
    const day = new Date(2026, 7, 20, 9, 0, 0).getTime()
    const span = normalizeAllDaySpan(day, day)
    expect(span.startAt).toBe(new Date(2026, 7, 20).getTime())
    expect(span.endAt).toBe(new Date(2026, 7, 20, 23, 59, 59, 999).getTime())
  })

  it('spans multiple days with an inclusive end', () => {
    const span = normalizeAllDaySpan(
      new Date(2026, 7, 21, 8, 0, 0).getTime(),
      new Date(2026, 7, 23, 15, 0, 0).getTime()
    )
    expect(span.startAt).toBe(new Date(2026, 7, 21).getTime())
    expect(span.endAt).toBe(new Date(2026, 7, 23, 23, 59, 59, 999).getTime())
  })

  it('clamps an inverted range to the start day', () => {
    const span = normalizeAllDaySpan(
      new Date(2026, 7, 23).getTime(),
      new Date(2026, 7, 21).getTime()
    )
    expect(span.startAt).toBe(new Date(2026, 7, 23).getTime())
    expect(span.endAt).toBe(new Date(2026, 7, 23, 23, 59, 59, 999).getTime())
  })
})
