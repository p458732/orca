export const DAY_MS = 24 * 60 * 60 * 1000

export function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** All-day spans use an INCLUSIVE end (…23:59:59.999); Google's `end.date` is
 *  exclusive, so callers converting from Google must step back a day first. */
export function normalizeAllDaySpan(
  startAt: number,
  endAt: number
): { startAt: number; endAt: number } {
  const start = startOfLocalDay(startAt)
  return { startAt: start, endAt: Math.max(startOfLocalDay(endAt), start) + DAY_MS - 1 }
}
