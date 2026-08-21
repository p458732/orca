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

const DAY_MS = 24 * 60 * 60 * 1000

export type GoogleSyncOutcome = {
  status: 'synced' | 'skipped_fresh' | 'failed'
  syncedAt: number | null
  reason: string | null
}

// Why: a future syncedAt (clock skew) must read as fresh, not stale — a negative
// age already fails the `>` check below, so no special-case branch is needed.
export function isGoogleCacheStale(cache: GoogleCalendarCache | null, now: number): boolean {
  if (!cache) {
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

// Why: only one sync may be in flight at a time (matches collector.ts's inflight
// pattern) so a UI click and a concurrent CLI agenda call share one fetch.
let inflight: Promise<GoogleSyncOutcome> | null = null

export function syncGoogleCalendars(args: GoogleCalendarSyncArgs): Promise<GoogleSyncOutcome> {
  if (inflight) {
    return inflight
  }
  inflight = performSync(args).finally(() => {
    inflight = null
  })
  return inflight
}

async function performSync(args: GoogleCalendarSyncArgs): Promise<GoogleSyncOutcome> {
  const accountId = args.accountId ?? GOOGLE_ACCOUNT_ID
  const now = args.now ?? Date.now()
  const readCache = args.readCache ?? readGoogleCalendarCache
  const cache = readCache(accountId)
  const existingSyncedAt = cache?.syncedAt ?? null

  if (!args.force && !isGoogleCacheStale(cache, now)) {
    return { status: 'skipped_fresh', syncedAt: existingSyncedAt, reason: null }
  }

  const loadTokens = args.loadTokens ?? loadGoogleTokens
  const saveTokens = args.saveTokens ?? saveGoogleTokens
  const refreshAccessToken = args.refreshAccessToken ?? refreshGoogleAccessToken
  const listEvents = args.listEvents ?? listGoogleEvents
  const writeCache = args.writeCache ?? writeGoogleCalendarCache

  try {
    const tokens = loadTokens(accountId)
    if (!tokens) {
      return { status: 'failed', syncedAt: existingSyncedAt, reason: 'not_connected' }
    }

    let accessToken = tokens.accessToken
    const expired =
      !accessToken || tokens.accessTokenExpiresAt == null || tokens.accessTokenExpiresAt <= now
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
      calendars[calendarId] = await listEvents({
        accessToken: accessToken as string,
        calendarId,
        timeMin: window.timeMin,
        timeMax: window.timeMax
      })
    }

    writeCache({ accountId, syncedAt: now, calendars })
    return { status: 'synced', syncedAt: now, reason: null }
  } catch (err) {
    return { status: 'failed', syncedAt: existingSyncedAt, reason: classifyGoogleSyncFailure(err) }
  }
}
