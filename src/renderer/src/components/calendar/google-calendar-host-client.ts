import { callRuntimeRpc, hasRuntimeRpcErrorCode } from '@/runtime/runtime-rpc-client'

// Google tokens and the event cache sit beside the local calendar store, so this
// never follows the active remote runtime.
const GOOGLE_CALENDAR_TARGET = { kind: 'local' } as const

export type GoogleCalendarSummary = {
  id: string
  summary: string
  primary: boolean
}

export type GoogleCalendarStatus = {
  connected: boolean
  accountEmail: string | null
  syncedAt: number | null
  selectedCalendarIds: string[]
  /** Reason the host's last sync failed. Survives a relaunch, so a grant that
   *  died overnight is visible without the user pressing Sync now first. */
  lastSyncFailure: string | null
}

export type GoogleSyncOutcome = {
  status: 'synced' | 'skipped_fresh' | 'failed'
  syncedAt: number | null
  reason: string | null
  /** Set when one calendar caused the failure, so the UI can name it. */
  failedCalendarId?: string
}

export async function fetchGoogleCalendarStatus(): Promise<GoogleCalendarStatus> {
  const result = await callRuntimeRpc<Partial<GoogleCalendarStatus>>(
    GOOGLE_CALENDAR_TARGET,
    'googleCalendar.status'
  )
  return {
    connected: result.connected === true,
    accountEmail: result.accountEmail ?? null,
    syncedAt: typeof result.syncedAt === 'number' ? result.syncedAt : null,
    selectedCalendarIds: result.selectedCalendarIds ?? [],
    // A host predating the persisted failure answers without this field.
    lastSyncFailure: result.lastSyncFailure ?? null
  }
}

/** Opens the system browser and resolves only once the user finishes signing in,
 *  which can take minutes. Only the account email crosses this boundary. */
export async function connectGoogleCalendar(): Promise<{ accountEmail: string | null }> {
  const result = await callRuntimeRpc<{ accountEmail?: string | null }>(
    GOOGLE_CALENDAR_TARGET,
    'googleCalendar.connect'
  )
  return { accountEmail: result.accountEmail ?? null }
}

/** `revoked: false` means the grant still exists in the user's Google account
 *  even though the local tokens and cache are gone — callers must surface it. */
export async function disconnectGoogleCalendar(): Promise<{ revoked: boolean }> {
  const result = await callRuntimeRpc<{ revoked?: boolean }>(
    GOOGLE_CALENDAR_TARGET,
    'googleCalendar.disconnect'
  )
  return { revoked: result.revoked !== false }
}

export async function listGoogleCalendars(): Promise<GoogleCalendarSummary[]> {
  const result = await callRuntimeRpc<{ calendars?: GoogleCalendarSummary[] }>(
    GOOGLE_CALENDAR_TARGET,
    'googleCalendar.listCalendars'
  )
  return result.calendars ?? []
}

export async function setSelectedGoogleCalendars(calendarIds: readonly string[]): Promise<void> {
  await callRuntimeRpc<{ ok: boolean }>(
    GOOGLE_CALENDAR_TARGET,
    'googleCalendar.setSelectedCalendars',
    { calendarIds: [...calendarIds] }
  )
}

export async function syncGoogleCalendarNow(): Promise<GoogleSyncOutcome> {
  const result = await callRuntimeRpc<{ outcome: GoogleSyncOutcome }>(
    GOOGLE_CALENDAR_TARGET,
    'googleCalendar.syncNow'
  )
  return result.outcome
}

/** Hosts predating this feature answer `method_not_found`; callers degrade to an
 *  "unavailable" notice instead of an error the user cannot act on. */
export function isGoogleCalendarUnavailable(error: unknown): boolean {
  return hasRuntimeRpcErrorCode(error, 'method_not_found')
}
