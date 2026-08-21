import type { GoogleCalendarEvent } from '../../shared/google-calendar-event'
import {
  GoogleAccessRevokedError,
  GooglePageLimitExceededError,
  GoogleRateLimitedError,
  listGoogleEvents
} from './google-calendar-client'
import {
  type GoogleCalendarCache,
  readGoogleCalendarCache,
  writeGoogleCalendarCache
} from './google-calendar-cache'
import { getGoogleOAuthConfig, type GoogleOAuthConfig } from './google-oauth-config'
import { GoogleAuthRevokedError, refreshGoogleAccessToken } from './google-token-exchange'
import { loadGoogleTokens, saveGoogleTokens, type GoogleStoredTokens } from './google-token-store'

export const GOOGLE_SYNC_STALE_AFTER_MS = 5 * 60 * 1000
export const GOOGLE_SYNC_WINDOW_BACK_DAYS = 30
export const GOOGLE_SYNC_WINDOW_FORWARD_DAYS = 90
// Why: single-account prototype — one fixed cache/token key until multi-account lands.
export const GOOGLE_ACCOUNT_ID = 'default'
// Why: refresh slightly ahead of the real expiry so a token that dies mid-fetch
// never gets used — without this a token expiring in a few seconds is used as-is,
// 401s mid-sync, and gets misreported as auth_revoked when nothing was revoked.
export const GOOGLE_TOKEN_EXPIRY_BUFFER_MS = 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000

export type GoogleSyncOutcome = {
  status: 'synced' | 'skipped_fresh' | 'failed'
  syncedAt: number | null
  reason: string | null
  // Why: page_limit_exceeded (and any other in-loop failure) is scoped to one
  // calendar — name it so the settings pane can tell the user which to deselect.
  failedCalendarId?: string
}

// Why: a future syncedAt (clock skew) must read as fresh, not stale — a negative
// age already fails the `>` check below, so no special-case branch is needed.
export function isGoogleCacheStale(
  cache: GoogleCalendarCache | null,
  now: number,
  selectedCalendarIds: readonly string[] = []
): boolean {
  if (!cache) {
    return true
  }
  // Why: a just-ticked calendar has no entry at all, so age alone would call the
  // cache fresh and the user would see nothing for the next five minutes.
  if (selectedCalendarIds.some((calendarId) => !(calendarId in cache.calendars))) {
    return true
  }
  return now - cache.syncedAt > GOOGLE_SYNC_STALE_AFTER_MS
}

export function computeSyncWindow(now: number): { timeMin: number; timeMax: number } {
  return {
    timeMin: now - GOOGLE_SYNC_WINDOW_BACK_DAYS * DAY_MS,
    timeMax: now + GOOGLE_SYNC_WINDOW_FORWARD_DAYS * DAY_MS
  }
}

export type GoogleCalendarSyncArgs = {
  accountId?: string
  selectedCalendarIds: readonly string[]
  force?: boolean
  now?: number
  config?: GoogleOAuthConfig
  // Why: injectable so failure-path tests can make each collaborator throw
  // without reaching the real filesystem or Google's API.
  readCache?: (accountId: string) => GoogleCalendarCache | null
  writeCache?: (cache: GoogleCalendarCache) => void
  // Why: never invoked by this module (only disconnect clears the cache) — present
  // so failure-path tests can prove that invariant against an injected spy.
  clearCache?: (accountId: string) => void
  loadTokens?: (accountId: string) => GoogleStoredTokens | null
  saveTokens?: (accountId: string, tokens: GoogleStoredTokens) => void
  refreshAccessToken?: typeof refreshGoogleAccessToken
  listEvents?: typeof listGoogleEvents
}

// Why: 401/403 mid-sync (GoogleAccessRevokedError) and a dead refresh token
// (GoogleAuthRevokedError) both mean the user must reconnect — same reason,
// different pipeline stage.
function classifyGoogleSyncFailure(err: unknown): string {
  if (err instanceof GoogleAuthRevokedError || err instanceof GoogleAccessRevokedError) {
    return 'auth_revoked'
  }
  if (err instanceof GoogleRateLimitedError) {
    return 'rate_limited'
  }
  if (err instanceof GooglePageLimitExceededError) {
    return 'page_limit_exceeded'
  }
  return 'network_error'
}

// Why: order-independent — checkbox-driven selections aren't guaranteed stable order.
function calendarSelectionsMatch(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((id, index) => id === sortedB[index])
}

// Why: a force call must never inherit a non-force call's possible skip_fresh
// result, and a caller for one calendar selection must never receive a cache
// outcome built from a different selection — both would silently mislead the
// caller rather than fail loudly.
function canCoalesceOnto(
  current: GoogleCalendarSyncArgs,
  running: GoogleCalendarSyncArgs
): boolean {
  if (current.force && !running.force) {
    return false
  }
  return calendarSelectionsMatch(current.selectedCalendarIds, running.selectedCalendarIds)
}

// Why: only one COMPATIBLE sync may be in flight at a time (matches collector.ts's
// inflight pattern) so a UI click and a concurrent CLI agenda call share one fetch —
// but an incompatible call (see canCoalesceOnto) always gets its own run.
let inflight: { args: GoogleCalendarSyncArgs; promise: Promise<GoogleSyncOutcome> } | null = null

export function syncGoogleCalendars(args: GoogleCalendarSyncArgs): Promise<GoogleSyncOutcome> {
  if (inflight && canCoalesceOnto(args, inflight.args)) {
    return inflight.promise
  }
  const promise: Promise<GoogleSyncOutcome> = performSync(args).finally(() => {
    if (inflight?.promise === promise) {
      inflight = null
    }
  })
  inflight = { args, promise }
  return promise
}

async function performSync(args: GoogleCalendarSyncArgs): Promise<GoogleSyncOutcome> {
  const accountId = args.accountId ?? GOOGLE_ACCOUNT_ID
  const now = args.now ?? Date.now()
  const readCache = args.readCache ?? readGoogleCalendarCache
  const cache = readCache(accountId)
  const existingSyncedAt = cache?.syncedAt ?? null

  if (!args.force && !isGoogleCacheStale(cache, now, args.selectedCalendarIds)) {
    return { status: 'skipped_fresh', syncedAt: existingSyncedAt, reason: null }
  }

  const loadTokens = args.loadTokens ?? loadGoogleTokens
  const saveTokens = args.saveTokens ?? saveGoogleTokens
  const refreshAccessToken = args.refreshAccessToken ?? refreshGoogleAccessToken
  const listEvents = args.listEvents ?? listGoogleEvents
  const writeCache = args.writeCache ?? writeGoogleCalendarCache

  // Why: tracked outside the loop so the catch below can name which calendar
  // was being fetched when a failure hit.
  let currentCalendarId: string | null = null

  try {
    const tokens = loadTokens(accountId)
    if (!tokens) {
      return { status: 'failed', syncedAt: existingSyncedAt, reason: 'not_connected' }
    }

    let accessToken = tokens.accessToken
    const expired =
      !accessToken ||
      tokens.accessTokenExpiresAt == null ||
      tokens.accessTokenExpiresAt <= now + GOOGLE_TOKEN_EXPIRY_BUFFER_MS
    if (expired) {
      const config = args.config ?? getGoogleOAuthConfig()
      const refreshed = await refreshAccessToken({ config, refreshToken: tokens.refreshToken })
      accessToken = refreshed.accessToken
      saveTokens(accountId, {
        ...tokens,
        accessToken: refreshed.accessToken,
        accessTokenExpiresAt: refreshed.accessTokenExpiresAt
      })
    }

    const window = computeSyncWindow(now)
    const calendars: Record<string, GoogleCalendarEvent[]> = {}
    for (const calendarId of args.selectedCalendarIds) {
      currentCalendarId = calendarId
      calendars[calendarId] = await listEvents({
        accessToken: accessToken as string,
        calendarId,
        timeMin: window.timeMin,
        timeMax: window.timeMax
      })
    }

    // Why: a disconnect can land while the fetch is in flight — writing here would
    // resurrect the account's events in the grid and the agent's agenda after the
    // user removed it, with the pane still saying "not connected".
    if (!loadTokens(accountId)) {
      return { status: 'failed', syncedAt: existingSyncedAt, reason: 'not_connected' }
    }
    writeCache({ accountId, syncedAt: now, calendars })
    return { status: 'synced', syncedAt: now, reason: null }
  } catch (err) {
    return {
      status: 'failed',
      syncedAt: existingSyncedAt,
      reason: classifyGoogleSyncFailure(err),
      failedCalendarId: currentCalendarId ?? undefined
    }
  }
}
