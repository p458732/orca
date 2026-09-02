export const DAY_MS = 24 * 60 * 60 * 1000

export function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** Calendar-day arithmetic, never ±DAY_MS: a DST transition day is 23 or 25
 *  hours long, so fixed-millisecond stepping lands on the wrong day. */
export function shiftLocalDay(timestamp: number, days: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return date.getTime()
}

/** All-day spans use an INCLUSIVE end (…23:59:59.999). A source with an
 *  exclusive end date must step back a day before converting. */
export function normalizeAllDaySpan(
  startAt: number,
  endAt: number
): { startAt: number; endAt: number } {
  const start = startOfLocalDay(startAt)
  const end = Math.max(startOfLocalDay(endAt), start)
  return { startAt: start, endAt: shiftLocalDay(end, 1) - 1 }
}
