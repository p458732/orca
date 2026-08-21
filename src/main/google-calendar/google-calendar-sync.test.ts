import { describe, expect, it, vi } from 'vitest'
import {
  GOOGLE_SYNC_STALE_AFTER_MS,
  computeSyncWindow,
  isGoogleCacheStale,
  syncGoogleCalendars
} from './google-calendar-sync'
import { GoogleAuthRevokedError } from './google-token-exchange'
import { GoogleRateLimitedError } from './google-calendar-client'
import type { GoogleCalendarCache } from './google-calendar-cache'
import type { GoogleStoredTokens } from './google-token-store'
import type { GoogleCalendarEvent } from '../../shared/google-calendar-event'

const NOW = new Date(2026, 7, 20, 12, 0, 0).getTime()
const DAY = 24 * 60 * 60 * 1000

describe('isGoogleCacheStale', () => {
  it('treats a missing cache as stale', () => {
    expect(isGoogleCacheStale(null, NOW)).toBe(true)
  })

  it('is fresh just inside the threshold', () => {
    const cache = {
      accountId: 'default',
      syncedAt: NOW - GOOGLE_SYNC_STALE_AFTER_MS + 1000,
      calendars: {}
    }
    expect(isGoogleCacheStale(cache, NOW)).toBe(false)
  })

  it('is stale just outside the threshold', () => {
    const cache = {
      accountId: 'default',
      syncedAt: NOW - GOOGLE_SYNC_STALE_AFTER_MS - 1000,
      calendars: {}
    }
    expect(isGoogleCacheStale(cache, NOW)).toBe(true)
  })

  it('treats a future syncedAt as fresh rather than looping', () => {
    const cache = { accountId: 'default', syncedAt: NOW + DAY, calendars: {} }
    expect(isGoogleCacheStale(cache, NOW)).toBe(false)
  })
})

describe('computeSyncWindow', () => {
  it('spans 30 days back and 90 days forward', () => {
    const window = computeSyncWindow(NOW)
    expect(Math.round((NOW - window.timeMin) / DAY)).toBe(30)
    expect(Math.round((window.timeMax - NOW) / DAY)).toBe(90)
  })

  it('always produces a forward-ordered window', () => {
    const window = computeSyncWindow(NOW)
    expect(window.timeMax).toBeGreaterThan(window.timeMin)
  })
})

// ─── syncGoogleCalendars test helpers ───────────────────────────────

const VALID_TOKENS: GoogleStoredTokens = {
  refreshToken: 'refresh-1',
  accessToken: 'access-1',
  accessTokenExpiresAt: NOW + 60 * 60 * 1000,
  accountEmail: 'me@example.com'
}

const EXPIRED_TOKENS: GoogleStoredTokens = {
  refreshToken: 'refresh-1',
  accessToken: null,
  accessTokenExpiresAt: null,
  accountEmail: 'me@example.com'
}

const STALE_CACHE: GoogleCalendarCache = {
  accountId: 'default',
  syncedAt: NOW - GOOGLE_SYNC_STALE_AFTER_MS - 1000,
  calendars: { 'cal-1': [] }
}

const FRESH_CACHE: GoogleCalendarCache = {
  accountId: 'default',
  syncedAt: NOW - 1000,
  calendars: { 'cal-1': [] }
}

function sampleEvent(calendarId: string): GoogleCalendarEvent {
  return {
    id: `google:${calendarId}:e1`,
    calendarId,
    title: 'Standup',
    startAt: NOW,
    endAt: NOW + 60 * 60 * 1000,
    allDay: false,
    notes: null,
    responseStatus: null,
    etag: null,
    updatedAt: NOW
  }
}

type SyncDeps = Parameters<typeof syncGoogleCalendars>[0]

function baseDeps(overrides: Partial<SyncDeps> = {}): SyncDeps {
  return {
    selectedCalendarIds: ['cal-1'],
    now: NOW,
    readCache: vi.fn(() => STALE_CACHE),
    writeCache: vi.fn(),
    loadTokens: vi.fn(() => VALID_TOKENS),
    saveTokens: vi.fn(),
    refreshAccessToken: vi.fn(async () => ({
      accessToken: 'access-2',
      accessTokenExpiresAt: NOW + 60 * 60 * 1000
    })),
    listEvents: vi.fn(async ({ calendarId }: { calendarId: string }) => [sampleEvent(calendarId)]),
    config: {
      clientId: 'test-client',
      authorizeEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      revokeEndpoint: 'https://oauth2.googleapis.com/revoke',
      scope: 'https://www.googleapis.com/auth/calendar.readonly'
    },
    ...overrides
  }
}

describe('syncGoogleCalendars — failure paths preserve the cache', () => {
  it('keeps the existing cache when the refresh token has been revoked', async () => {
    const clearCache = vi.fn()
    const deps = baseDeps({
      loadTokens: vi.fn(() => EXPIRED_TOKENS),
      refreshAccessToken: vi.fn(async () => {
        throw new GoogleAuthRevokedError()
      }),
      clearCache
    })
    const outcome = await syncGoogleCalendars(deps)
    expect(outcome.reason).toBe('auth_revoked')
    expect(outcome.status).toBe('failed')
    expect(deps.writeCache).not.toHaveBeenCalled()
    expect(clearCache).not.toHaveBeenCalled()
  })

  it('keeps the existing cache when Google rate-limits the request', async () => {
    const deps = baseDeps({
      listEvents: vi.fn(async () => {
        throw new GoogleRateLimitedError()
      })
    })
    const outcome = await syncGoogleCalendars(deps)
    expect(outcome.reason).toBe('rate_limited')
    expect(outcome.status).toBe('failed')
    expect(deps.writeCache).not.toHaveBeenCalled()
  })

  it('does not write a half-populated cache when one calendar of several fails', async () => {
    const listEvents = vi.fn(async ({ calendarId }: { calendarId: string }) => {
      if (calendarId === 'cal-2') {
        throw new Error('boom')
      }
      return [sampleEvent(calendarId)]
    })
    const deps = baseDeps({
      selectedCalendarIds: ['cal-1', 'cal-2'],
      listEvents
    })
    const outcome = await syncGoogleCalendars(deps)
    expect(outcome.status).toBe('failed')
    expect(deps.writeCache).not.toHaveBeenCalled()
  })

  it('skips the network entirely when the cache is fresh', async () => {
    const deps = baseDeps({
      readCache: vi.fn(() => FRESH_CACHE)
    })
    const outcome = await syncGoogleCalendars(deps)
    expect(outcome.status).toBe('skipped_fresh')
    expect(deps.listEvents).not.toHaveBeenCalled()
  })

  it('syncs anyway when force is requested even if the cache is fresh', async () => {
    const deps = baseDeps({
      readCache: vi.fn(() => FRESH_CACHE),
      force: true
    })
    await syncGoogleCalendars(deps)
    expect(deps.listEvents).toHaveBeenCalled()
  })

  it('coalesces concurrent calls into a single in-flight sync', async () => {
    let resolveFirst: (events: GoogleCalendarEvent[]) => void = () => {}
    const gate = new Promise<GoogleCalendarEvent[]>((resolve) => {
      resolveFirst = resolve
    })
    const listEvents = vi.fn(async ({ calendarId }: { calendarId: string }) => {
      if (listEvents.mock.calls.length === 1) {
        return gate
      }
      return [sampleEvent(calendarId)]
    })
    const deps = baseDeps({ listEvents })
    const first = syncGoogleCalendars(deps)
    const second = syncGoogleCalendars(deps)
    resolveFirst([sampleEvent('cal-1')])
    const [firstOutcome, secondOutcome] = await Promise.all([first, second])
    expect(listEvents).toHaveBeenCalledTimes(1)
    expect(firstOutcome).toEqual(secondOutcome)
  })
})

describe('syncGoogleCalendars — coalescing respects call-specific args (fix round 1)', () => {
  it('does not hand a force call a non-force call’s outcome, so it actually syncs', async () => {
    const listEvents = vi.fn(async ({ calendarId }: { calendarId: string }) => [
      sampleEvent(calendarId)
    ])
    const deps = baseDeps({ readCache: vi.fn(() => FRESH_CACHE), listEvents })
    const nonForce = syncGoogleCalendars(deps)
    const forced = syncGoogleCalendars({ ...deps, force: true })
    const [nonForceOutcome, forcedOutcome] = await Promise.all([nonForce, forced])
    expect(nonForceOutcome.status).toBe('skipped_fresh')
    expect(forcedOutcome.status).toBe('synced')
    expect(listEvents).toHaveBeenCalled()
  })

  it('does not coalesce onto an in-flight call for a different calendar selection', async () => {
    let resolveFirst: (events: GoogleCalendarEvent[]) => void = () => {}
    const gate = new Promise<GoogleCalendarEvent[]>((resolve) => {
      resolveFirst = resolve
    })
    const listEvents = vi.fn(async ({ calendarId }: { calendarId: string }) => {
      if (calendarId === 'cal-1' && listEvents.mock.calls.length === 1) {
        return gate
      }
      return [sampleEvent(calendarId)]
    })
    const first = syncGoogleCalendars(baseDeps({ selectedCalendarIds: ['cal-1'], listEvents }))
    const second = syncGoogleCalendars(baseDeps({ selectedCalendarIds: ['cal-2'], listEvents }))
    resolveFirst([sampleEvent('cal-1')])
    await Promise.all([first, second])
    expect(listEvents).toHaveBeenCalledWith(expect.objectContaining({ calendarId: 'cal-1' }))
    expect(listEvents).toHaveBeenCalledWith(expect.objectContaining({ calendarId: 'cal-2' }))
  })
})

describe('syncGoogleCalendars — names the failed calendar (fix round 1)', () => {
  it('carries the calendar id of a page-limit failure so the settings pane can name the offender', async () => {
    const { GooglePageLimitExceededError } = await import('./google-calendar-client')
    const listEvents = vi.fn(async ({ calendarId }: { calendarId: string }) => {
      if (calendarId === 'cal-2') {
        throw new GooglePageLimitExceededError()
      }
      return [sampleEvent(calendarId)]
    })
    const deps = baseDeps({ selectedCalendarIds: ['cal-1', 'cal-2'], listEvents })
    const outcome = await syncGoogleCalendars(deps)
    expect(outcome.reason).toBe('page_limit_exceeded')
    expect(outcome.failedCalendarId).toBe('cal-2')
  })
})

describe('syncGoogleCalendars — refreshes ahead of expiry (fix round 1)', () => {
  it('proactively refreshes a token expiring inside the buffer, not just an already-expired one', async () => {
    const aboutToExpireTokens: GoogleStoredTokens = {
      refreshToken: 'refresh-1',
      accessToken: 'access-1',
      accessTokenExpiresAt: NOW + 30 * 1000,
      accountEmail: 'me@example.com'
    }
    const refreshAccessToken = vi.fn(async () => ({
      accessToken: 'access-2',
      accessTokenExpiresAt: NOW + 60 * 60 * 1000
    }))
    const deps = baseDeps({
      loadTokens: vi.fn(() => aboutToExpireTokens),
      refreshAccessToken
    })
    await syncGoogleCalendars(deps)
    expect(refreshAccessToken).toHaveBeenCalled()
  })
})
