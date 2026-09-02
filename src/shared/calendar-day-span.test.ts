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

// Why: every other fixture here is an August date, which is exactly why the
// 23-hour spring-forward day went unnoticed. These hold in Asia/Taipei (no DST) too.
describe('normalizeAllDaySpan — across a spring-forward day', () => {
  it('ends a single all-day event on its own day, not 00:59 the next', () => {
    const springForward = new Date(2026, 2, 8).getTime()
    const span = normalizeAllDaySpan(springForward, springForward)
    expect(span.startAt).toBe(springForward)
    expect(span.endAt).toBe(new Date(2026, 2, 8, 23, 59, 59, 999).getTime())
  })

  it('ends a multi-day span that crosses the transition on the last day', () => {
    const span = normalizeAllDaySpan(new Date(2026, 2, 6).getTime(), new Date(2026, 2, 9).getTime())
    expect(span.startAt).toBe(new Date(2026, 2, 6).getTime())
    expect(span.endAt).toBe(new Date(2026, 2, 9, 23, 59, 59, 999).getTime())
  })

  it('ends a single all-day event on its own day across a fall-back day', () => {
    const fallBack = new Date(2026, 10, 1).getTime()
    const span = normalizeAllDaySpan(fallBack, fallBack)
    expect(span.endAt).toBe(new Date(2026, 10, 1, 23, 59, 59, 999).getTime())
  })
})
