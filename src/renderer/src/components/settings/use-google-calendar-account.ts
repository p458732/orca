import { useCallback, useEffect, useState } from 'react'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  fetchGoogleCalendarStatus,
  isGoogleCalendarUnavailable,
  listGoogleCalendars,
  setSelectedGoogleCalendars,
  syncGoogleCalendarNow,
  type GoogleCalendarStatus,
  type GoogleCalendarSummary
} from '../calendar/google-calendar-host-client'
import {
  describeGoogleSyncOutcome,
  type GoogleCalendarNotice
} from './google-calendar-sync-outcome-message'

const GOOGLE_ACCOUNT_CONNECTIONS_URL = 'https://myaccount.google.com/connections'

export type GoogleCalendarAvailability = 'loading' | 'available' | 'unavailable'

export type GoogleCalendarAccount = {
  availability: GoogleCalendarAvailability
  connected: boolean
  accountEmail: string | null
  syncedAt: number | null
  calendars: readonly GoogleCalendarSummary[]
  selectedIds: readonly string[]
  calendarsLoading: boolean
  connecting: boolean
  syncing: boolean
  disconnecting: boolean
  notice: GoogleCalendarNotice | null
  connect: () => void
  disconnect: () => void
  syncNow: () => void
  toggleCalendar: (calendarId: string) => void
}

export function useGoogleCalendarAccount(): GoogleCalendarAccount {
  const mountedRef = useMountedRef()
  const [availability, setAvailability] = useState<GoogleCalendarAvailability>('loading')
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null)
  const [calendars, setCalendars] = useState<readonly GoogleCalendarSummary[]>([])
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  const [calendarsLoading, setCalendarsLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [notice, setNotice] = useState<GoogleCalendarNotice | null>(null)

  // Why: a host without these methods is not a failure the user can act on, so it
  // switches the whole surface to "unavailable" instead of raising a banner.
  const reportFailure = useCallback((error: unknown, text: string): void => {
    if (isGoogleCalendarUnavailable(error)) {
      setAvailability('unavailable')
      setNotice(null)
      return
    }
    // A failed probe still resolves the pane so the user can read the error and retry.
    setAvailability((current) => (current === 'loading' ? 'available' : current))
    setNotice({ tone: 'error', text })
  }, [])

  const loadCalendars = useCallback(async (): Promise<void> => {
    setCalendarsLoading(true)
    try {
      const loaded = await listGoogleCalendars()
      if (mountedRef.current) {
        setCalendars(loaded)
      }
    } catch (error) {
      if (mountedRef.current) {
        setCalendars([])
        reportFailure(
          error,
          translate(
            'auto.components.settings.calendar.calendarsFailed',
            'Could not load your Google calendars.'
          )
        )
      }
    } finally {
      if (mountedRef.current) {
        setCalendarsLoading(false)
      }
    }
  }, [mountedRef, reportFailure])

  const refreshStatus = useCallback(async (): Promise<GoogleCalendarStatus | null> => {
    try {
      const next = await fetchGoogleCalendarStatus()
      if (!mountedRef.current) {
        return null
      }
      setAvailability('available')
      setStatus(next)
      setSelectedIds(next.selectedCalendarIds)
      return next
    } catch (error) {
      if (mountedRef.current) {
        reportFailure(
          error,
          translate(
            'auto.components.settings.calendar.statusFailed',
            'Could not load the Google Calendar connection.'
          )
        )
      }
      return null
    }
  }, [mountedRef, reportFailure])

  useEffect(() => {
    void (async () => {
      const next = await refreshStatus()
      if (next?.connected) {
        await loadCalendars()
      }
    })()
  }, [loadCalendars, refreshStatus])

  const connect = useCallback((): void => {
    setConnecting(true)
    setNotice(null)
    void (async () => {
      try {
        await connectGoogleCalendar()
        const next = await refreshStatus()
        if (next?.connected) {
          await loadCalendars()
        }
      } catch (error) {
        if (mountedRef.current) {
          reportFailure(
            error,
            translate(
              'auto.components.settings.calendar.connectFailed',
              'Could not connect to Google. Try again.'
            )
          )
        }
      } finally {
        if (mountedRef.current) {
          setConnecting(false)
        }
      }
    })()
  }, [loadCalendars, mountedRef, refreshStatus, reportFailure])

  const disconnect = useCallback((): void => {
    setDisconnecting(true)
    setNotice(null)
    void (async () => {
      try {
        const { revoked } = await disconnectGoogleCalendar()
        if (!mountedRef.current) {
          return
        }
        setCalendars([])
        if (!revoked) {
          setNotice({
            tone: 'error',
            text: translate(
              'auto.components.settings.calendar.notRevoked',
              'Orca’s access was removed from this computer, but Google did not confirm the revocation. Remove Orca from your Google Account under Third-party apps & services.'
            ),
            link: GOOGLE_ACCOUNT_CONNECTIONS_URL
          })
        }
        await refreshStatus()
      } catch (error) {
        if (mountedRef.current) {
          reportFailure(
            error,
            translate(
              'auto.components.settings.calendar.disconnectFailed',
              'Could not disconnect the Google account. Try again.'
            )
          )
        }
      } finally {
        if (mountedRef.current) {
          setDisconnecting(false)
        }
      }
    })()
  }, [mountedRef, refreshStatus, reportFailure])

  const syncNow = useCallback((): void => {
    setSyncing(true)
    setNotice(null)
    void (async () => {
      try {
        const outcome = await syncGoogleCalendarNow()
        if (mountedRef.current) {
          setNotice(describeGoogleSyncOutcome(outcome, calendars))
          await refreshStatus()
        }
      } catch (error) {
        if (mountedRef.current) {
          reportFailure(
            error,
            translate(
              'auto.components.settings.calendar.syncFailed',
              'The sync did not finish. Try again.'
            )
          )
        }
      } finally {
        if (mountedRef.current) {
          setSyncing(false)
        }
      }
    })()
  }, [calendars, mountedRef, refreshStatus, reportFailure])

  const toggleCalendar = useCallback(
    (calendarId: string): void => {
      const previous = selectedIds
      const next = previous.includes(calendarId)
        ? previous.filter((id) => id !== calendarId)
        : [...previous, calendarId]
      // Optimistic: the checkbox must not lag a click that may cross an SSH hop.
      setSelectedIds(next)
      setNotice(null)
      void (async () => {
        try {
          await setSelectedGoogleCalendars(next)
        } catch (error) {
          if (mountedRef.current) {
            setSelectedIds(previous)
            reportFailure(
              error,
              translate(
                'auto.components.settings.calendar.selectionFailed',
                'Could not save the calendar selection.'
              )
            )
          }
        }
      })()
    },
    [mountedRef, reportFailure, selectedIds]
  )

  return {
    availability,
    connected: status?.connected === true,
    accountEmail: status?.accountEmail ?? null,
    syncedAt: status?.syncedAt ?? null,
    calendars,
    selectedIds,
    calendarsLoading,
    connecting,
    syncing,
    disconnecting,
    notice,
    connect,
    disconnect,
    syncNow,
    toggleCalendar
  }
}
