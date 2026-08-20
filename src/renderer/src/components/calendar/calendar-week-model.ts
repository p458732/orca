import type { AgendaEntry } from '../../../../shared/calendar-agenda'

const DAY_MS = 24 * 60 * 60 * 1000
export const DAYS_PER_WEEK = 7

export type WeekBounds = { from: number; to: number }

export type CalendarDayColumn = {
  dayStart: number
  entries: AgendaEntry[]
}

export function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function getWeekBounds(now: number): WeekBounds {
  const from = startOfLocalDay(now)
  return { from, to: from + DAYS_PER_WEEK * DAY_MS }
}

export function shiftWeek(bounds: WeekBounds, direction: -1 | 1): WeekBounds {
  const offset = direction * DAYS_PER_WEEK * DAY_MS
  return { from: bounds.from + offset, to: bounds.to + offset }
}

export function groupAgendaByDay(
  entries: readonly AgendaEntry[],
  from: number
): CalendarDayColumn[] {
  const columns: CalendarDayColumn[] = Array.from({ length: DAYS_PER_WEEK }, (_unused, index) => ({
    dayStart: from + index * DAY_MS,
    entries: []
  }))
  for (const entry of entries) {
    // Columns are fixed 24h spans; the prototype defers DST, so a shifted day
    // can land an entry one column over. The range guards also drop the
    // agenda's inclusive `to` bound, which would index a non-existent column.
    const startIndex = Math.floor((entry.startAt - from) / DAY_MS)
    if (entry.kind !== 'event') {
      // An automation run is an instant, not a span.
      if (startIndex >= 0 && startIndex < DAYS_PER_WEEK) {
        columns[startIndex].entries.push(entry)
      }
      continue
    }
    // Why: the agenda returns any event overlapping the window, so an event can
    // start before `from` or run past a column; draw it on every day it covers.
    // `endAt` is the instant it stops, so a span ending at midnight owns no part
    // of the next day.
    const lastInstant = Math.max(entry.endAt - 1, entry.startAt)
    const endIndex = Math.floor((lastInstant - from) / DAY_MS)
    for (
      let index = Math.max(startIndex, 0);
      index <= Math.min(endIndex, DAYS_PER_WEEK - 1);
      index += 1
    ) {
      columns[index].entries.push(entry)
    }
  }
  return columns
}
