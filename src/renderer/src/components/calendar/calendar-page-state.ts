import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import type { AgendaEntry } from '../../../../shared/calendar-agenda'
import {
  calendarRequestErrorMessage,
  deleteCalendarEvent,
  fetchCalendarAgenda
} from './calendar-host-client'
import {
  getWeekBounds,
  groupAgendaByDay,
  shiftWeek,
  startOfLocalDay,
  type CalendarDayColumn,
  type WeekBounds
} from './calendar-week-model'

const DEFAULT_EVENT_HOUR = 9

/** Where a new event starts by default: the next full hour when today is on
 *  screen, otherwise morning on the first visible day. */
export function defaultEventStartAt(bounds: WeekBounds, now: number): number {
  const today = startOfLocalDay(now)
  if (today < bounds.from || today >= bounds.to) {
    return bounds.from + DEFAULT_EVENT_HOUR * 60 * 60 * 1000
  }
  const nextHour = new Date(now)
  nextHour.setMinutes(0, 0, 0)
  nextHour.setHours(nextHour.getHours() + 1)
  return nextHour.getTime()
}

export type CalendarWeekAgenda = {
  bounds: WeekBounds
  columns: CalendarDayColumn[]
  loading: boolean
  error: string | null
  reload: () => void
  removeEvent: (eventId: string) => void
  showPreviousWeek: () => void
  showNextWeek: () => void
  showThisWeek: () => void
}

export function useCalendarWeekAgenda(): CalendarWeekAgenda {
  const [bounds, setBounds] = useState<WeekBounds>(() => getWeekBounds(Date.now()))
  const [entries, setEntries] = useState<AgendaEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useMountedRef()
  // Why: week paging can outrun a slow host, so only the newest load may write.
  const requestRef = useRef(0)

  const load = useCallback(async (): Promise<void> => {
    const request = ++requestRef.current
    const isCurrent = (): boolean => mountedRef.current && request === requestRef.current
    setLoading(true)
    try {
      const loaded = await fetchCalendarAgenda(bounds.from, bounds.to)
      if (isCurrent()) {
        setEntries(loaded)
        setError(null)
      }
    } catch (cause) {
      if (isCurrent()) {
        setEntries([])
        setError(
          calendarRequestErrorMessage(
            cause,
            translate(
              'auto.components.calendar.CalendarPage.loadFailed',
              'Could not load the calendar.'
            )
          )
        )
      }
    } finally {
      if (isCurrent()) {
        setLoading(false)
      }
    }
  }, [bounds.from, bounds.to, mountedRef])

  useEffect(() => {
    void load()
  }, [load])

  const removeEvent = useCallback(
    (eventId: string): void => {
      void (async () => {
        try {
          await deleteCalendarEvent(eventId)
          await load()
        } catch (cause) {
          if (mountedRef.current) {
            setError(
              calendarRequestErrorMessage(
                cause,
                translate(
                  'auto.components.calendar.CalendarPage.deleteFailed',
                  'Could not delete the event.'
                )
              )
            )
          }
        }
      })()
    },
    [load, mountedRef]
  )

  const columns = useMemo(() => groupAgendaByDay(entries, bounds.from), [bounds.from, entries])

  return {
    bounds,
    columns,
    loading,
    error,
    reload: useCallback(() => void load(), [load]),
    removeEvent,
    showPreviousWeek: useCallback(() => setBounds((current) => shiftWeek(current, -1)), []),
    showNextWeek: useCallback(() => setBounds((current) => shiftWeek(current, 1)), []),
    showThisWeek: useCallback(() => setBounds(getWeekBounds(Date.now())), [])
  }
}
