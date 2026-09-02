import { translate } from '@/i18n/i18n'
import type {
  GoogleCalendarSummary,
  GoogleSyncOutcome
} from '../calendar/google-calendar-host-client'

export type GoogleCalendarNotice = {
  tone: 'info' | 'error'
  text: string
  /** External page the user must visit to finish recovering from this notice. */
  link?: string
}

function calendarLabel(
  calendarId: string | undefined,
  calendars: readonly GoogleCalendarSummary[]
): string | null {
  if (!calendarId) {
    return null
  }
  const match = calendars.find((calendar) => calendar.id === calendarId)
  return match?.summary.trim() || calendarId
}

function describeFailure(
  outcome: GoogleSyncOutcome,
  calendars: readonly GoogleCalendarSummary[]
): string {
  // `?? ''` keeps the switch off the nullable union so the default stays reachable.
  switch (outcome.reason ?? '') {
    case 'not_connected':
      return translate(
        'auto.components.settings.calendar.syncNotConnected',
        'Google account is not connected. Connect it above, then sync again.'
      )
    case 'auth_revoked':
      return translate(
        'auto.components.settings.calendar.syncAuthRevoked',
        'Google access is no longer valid. Reconnect your Google account to sync again.'
      )
    case 'rate_limited':
      return translate(
        'auto.components.settings.calendar.syncRateLimited',
        'Google is limiting requests right now. This is temporary — sync again in a few minutes.'
      )
    case 'page_limit_exceeded': {
      const label = calendarLabel(outcome.failedCalendarId, calendars)
      return label
        ? translate(
            'auto.components.settings.calendar.syncPageLimit',
            '“{{value0}}” has more events than one sync can fetch. Deselect it above, then sync again.',
            { value0: label }
          )
        : translate(
            'auto.components.settings.calendar.syncPageLimitUnnamed',
            'One selected calendar has more events than one sync can fetch. Deselect the calendars you do not need, then sync again.'
          )
    }
    case 'network_error':
      return translate(
        'auto.components.settings.calendar.syncNetworkError',
        'Could not reach Google. Check your internet connection, then sync again.'
      )
    default:
      // Why: a reason this build does not know must never reach the user raw.
      return translate(
        'auto.components.settings.calendar.syncFailed',
        'The sync did not finish. Try again.'
      )
  }
}

export function describeGoogleSyncOutcome(
  outcome: GoogleSyncOutcome,
  calendars: readonly GoogleCalendarSummary[]
): GoogleCalendarNotice {
  if (outcome.status === 'synced') {
    return {
      tone: 'info',
      text: translate('auto.components.settings.calendar.syncSynced', 'Calendars synced.')
    }
  }
  if (outcome.status === 'skipped_fresh') {
    return {
      tone: 'info',
      text: translate(
        'auto.components.settings.calendar.syncFresh',
        'Calendars are already up to date.'
      )
    }
  }
  return { tone: 'error', text: describeFailure(outcome, calendars) }
}
