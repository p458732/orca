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
    // can land an entry one column over. The range guard also drops the
    // agenda's inclusive `to` bound, which would index a non-existent column.
    const index = Math.floor((entry.startAt - from) / DAY_MS)
    if (index >= 0 && index < DAYS_PER_WEEK) {
      columns[index].entries.push(entry)
    }
  }
  return columns
}
