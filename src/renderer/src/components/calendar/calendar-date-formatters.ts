import { getIntlLocale } from '@/i18n/i18n'
import type { WeekBounds } from './calendar-week-model'

/** Why cached: constructing an Intl.DateTimeFormat is the expensive part, and a
 *  week grid formats ~50 labels per render — now on a per-minute tick. Keyed on
 *  the locale so switching language still re-resolves. */
function createCachedDateFormatter(options: Intl.DateTimeFormatOptions): () => Intl.DateTimeFormat {
  let cachedLocale: string | undefined
  let cached: Intl.DateTimeFormat | undefined
  return () => {
    const locale = getIntlLocale()
    if (!cached || cachedLocale !== locale) {
      cachedLocale = locale
      cached = new Intl.DateTimeFormat(locale, options)
    }
    return cached
  }
}

const clockTimeFormatter = createCachedDateFormatter({ hour: 'numeric', minute: '2-digit' })
const weekdayFormatter = createCachedDateFormatter({ weekday: 'short' })
const dayNumberFormatter = createCachedDateFormatter({ day: 'numeric' })
const weekRangeFormatter = createCachedDateFormatter({
  month: 'short',
  day: 'numeric',
  year: 'numeric'
})

export function formatClockTime(timestamp: number): string {
  return clockTimeFormatter().format(timestamp)
}

export function formatWeekday(dayStart: number): string {
  return weekdayFormatter().format(dayStart)
}

export function formatDayNumber(dayStart: number): string {
  return dayNumberFormatter().format(dayStart)
}

export function formatWeekRange(bounds: WeekBounds): string {
  // The window is half-open, so the last visible day ends one ms before `to`.
  return weekRangeFormatter().formatRange(bounds.from, bounds.to - 1)
}
