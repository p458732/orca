import { describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../shared/global-settings-types'
import type { GoogleCalendarCache } from '../google-calendar/google-calendar-cache'
import {
  mapCachedGoogleEventsForAgenda,
  RuntimeGoogleCalendarCommands
} from './orca-runtime-google-calendar'

function makeHost(initial: Partial<GlobalSettings> = {}) {
  let settings = initial as GlobalSettings
  return {
    getSettings: vi.fn(() => settings),
    updateSettings: vi.fn((patch: Partial<GlobalSettings>) => {
      settings = { ...settings, ...patch }
    })
  }
}

function makeEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'google:primary:1',
    calendarId: 'primary',
    title: 'Standup',
    startAt: 1000,
    endAt: 2000,
    allDay: false,
    notes: null,
    responseStatus: null,
    etag: null,
    updatedAt: 500,
    ...overrides
  }
}

describe('mapCachedGoogleEventsForAgenda', () => {
  it('maps well-formed cached events to calendar events', () => {
    const cache: GoogleCalendarCache = {
      accountId: 'default',
      syncedAt: 0,
      calendars: { primary: [makeEvent()] }
    }
    expect(mapCachedGoogleEventsForAgenda(cache, ['primary'])).toEqual([
      {
        id: 'google:primary:1',
        title: 'Standup',
        startAt: 1000,
        endAt: 2000,
        allDay: false,
        notes: null,
        source: 'google',
        createdAt: 500,
        updatedAt: 500
      }
    ])
  })

  it('returns an empty list for a null cache', () => {
    expect(mapCachedGoogleEventsForAgenda(null, ['primary'])).toEqual([])
  })

  // Why: the cache validates its envelope but not per-calendar contents — a
  // corrupt-but-envelope-valid file must never throw into agenda building.
  it('drops malformed cached entries instead of throwing', () => {
    const cache = {
      accountId: 'default',
      syncedAt: 0,
      calendars: {
        primary: [
          makeEvent(),
          null,
          'garbage-string',
          42,
          { calendarId: 'primary' }, // missing required fields
          { ...makeEvent({ id: 2, startAt: 'not-a-number' }) }
        ]
      }
    } as unknown as GoogleCalendarCache
    expect(() => mapCachedGoogleEventsForAgenda(cache, ['primary'])).not.toThrow()
    const result = mapCachedGoogleEventsForAgenda(cache, ['primary'])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('google:primary:1')
  })
})

describe('RuntimeGoogleCalendarCommands', () => {
  it('reads an empty selection when settings never set one', () => {
    const commands = new RuntimeGoogleCalendarCommands(makeHost())
    expect(commands.getGoogleSelectedCalendarIds()).toEqual([])
  })

  it('persists a selection to settings', async () => {
    const host = makeHost()
    const commands = new RuntimeGoogleCalendarCommands(host)
    await commands.setGoogleSelectedCalendars(['a', 'b'])
    expect(host.updateSettings).toHaveBeenCalledWith({ googleCalendarSelectedIds: ['a', 'b'] })
    expect(commands.getGoogleSelectedCalendarIds()).toEqual(['a', 'b'])
  })

  it('reports disconnected status with no account email when never connected', () => {
    const commands = new RuntimeGoogleCalendarCommands(makeHost(), {
      loadTokens: () => null,
      readCache: () => null
    })
    expect(commands.getGoogleCalendarStatus()).toEqual({
      connected: false,
      accountEmail: null,
      syncedAt: null,
      selectedCalendarIds: [],
      lastSyncFailure: null
    })
  })

  it('reports connected status from stored tokens and cache', () => {
    const commands = new RuntimeGoogleCalendarCommands(
      makeHost({ googleCalendarSelectedIds: ['primary'] }),
      {
        loadTokens: () => ({
          refreshToken: 'r',
          accessToken: 'a',
          accessTokenExpiresAt: 9999,
          accountEmail: 'me@example.com'
        }),
        readCache: () => ({ accountId: 'default', syncedAt: 42, calendars: {} })
      }
    )
    expect(commands.getGoogleCalendarStatus()).toEqual({
      connected: true,
      accountEmail: 'me@example.com',
      syncedAt: 42,
      selectedCalendarIds: ['primary'],
      lastSyncFailure: null
    })
  })

  it('connect runs the PKCE flow, exchanges the code, and saves the returned tokens', async () => {
    const saveTokens = vi.fn()
    const commands = new RuntimeGoogleCalendarCommands(makeHost(), {
      getConfig: () => ({
        clientId: 'id',
        authorizeEndpoint: 'a',
        tokenEndpoint: 't',
        revokeEndpoint: 'r',
        scope: 's'
      }),
      beginOAuthFlow: async () => ({
        code: 'code-1',
        codeVerifier: 'verifier-1',
        redirectUri: 'http://127.0.0.1:1/auth/callback'
      }),
      exchangeCode: vi.fn(async () => ({
        refreshToken: 'refresh-1',
        accessToken: 'access-1',
        accessTokenExpiresAt: 9999,
        accountEmail: null
      })),
      listCalendars: vi.fn(async () => [{ id: 'me@example.com', summary: 'Me', primary: true }]),
      saveTokens
    })
    const result = await commands.connectGoogleCalendar()
    expect(result).toEqual({ accountEmail: 'me@example.com' })
    expect(saveTokens).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ refreshToken: 'refresh-1' })
    )
  })

  it('disconnect revokes the refresh token, then clears local state regardless of the result', async () => {
    const clearTokens = vi.fn()
    const clearCache = vi.fn()
    const revokeToken = vi.fn(async () => false)
    const commands = new RuntimeGoogleCalendarCommands(makeHost(), {
      loadTokens: () => ({
        refreshToken: 'refresh-1',
        accessToken: 'access-1',
        accessTokenExpiresAt: 9999,
        accountEmail: 'me@example.com'
      }),
      revokeToken,
      clearTokens,
      clearCache,
      getConfig: () => ({
        clientId: 'id',
        authorizeEndpoint: 'a',
        tokenEndpoint: 't',
        revokeEndpoint: 'r',
        scope: 's'
      })
    })
    const result = await commands.disconnectGoogleCalendar()
    expect(revokeToken).toHaveBeenCalledWith(expect.objectContaining({ token: 'refresh-1' }))
    // Why: a Google-side revoke failure must never trap the user in a connected state.
    expect(clearTokens).toHaveBeenCalledWith('default')
    expect(clearCache).toHaveBeenCalledWith('default')
    expect(result).toEqual({ revoked: false })
  })

  it('disconnect is a no-op revoke when there were no local tokens to begin with', async () => {
    const revokeToken = vi.fn(async () => false)
    const clearTokens = vi.fn()
    const clearCache = vi.fn()
    const commands = new RuntimeGoogleCalendarCommands(makeHost(), {
      loadTokens: () => null,
      revokeToken,
      clearTokens,
      clearCache
    })
    const result = await commands.disconnectGoogleCalendar()
    expect(revokeToken).not.toHaveBeenCalled()
    expect(clearTokens).toHaveBeenCalledWith('default')
    expect(clearCache).toHaveBeenCalledWith('default')
    expect(result).toEqual({ revoked: true })
  })

  it('listCalendars refreshes an expired access token before calling Google', async () => {
    const saveTokens = vi.fn()
    const listCalendars = vi.fn(async () => [{ id: 'primary', summary: 'Primary', primary: true }])
    const commands = new RuntimeGoogleCalendarCommands(makeHost(), {
      loadTokens: () => ({
        refreshToken: 'refresh-1',
        accessToken: 'expired',
        accessTokenExpiresAt: 0,
        accountEmail: 'me@example.com'
      }),
      refreshAccessToken: vi.fn(async () => ({
        accessToken: 'fresh',
        accessTokenExpiresAt: Date.now() + 60_000
      })),
      saveTokens,
      listCalendars,
      getConfig: () => ({
        clientId: 'id',
        authorizeEndpoint: 'a',
        tokenEndpoint: 't',
        revokeEndpoint: 'r',
        scope: 's'
      })
    })
    const result = await commands.listGoogleCalendarsForAccount()
    expect(result).toEqual([{ id: 'primary', summary: 'Primary', primary: true }])
    expect(listCalendars).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'fresh' }))
    expect(saveTokens).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ accessToken: 'fresh' })
    )
  })

  it('listCalendars rejects when there is no connected account', async () => {
    const commands = new RuntimeGoogleCalendarCommands(makeHost(), { loadTokens: () => null })
    await expect(commands.listGoogleCalendarsForAccount()).rejects.toThrow()
  })

  it('syncNow forces a sync using the selected calendars', async () => {
    const runSync = vi.fn(async () => ({ status: 'synced' as const, syncedAt: 1, reason: null }))
    const commands = new RuntimeGoogleCalendarCommands(
      makeHost({ googleCalendarSelectedIds: ['primary', 'work'] }),
      { runSync }
    )
    const outcome = await commands.syncGoogleCalendarNow()
    expect(outcome).toEqual({ status: 'synced', syncedAt: 1, reason: null })
    expect(runSync).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'default',
        selectedCalendarIds: ['primary', 'work'],
        force: true
      })
    )
  })
})

// ─── Finding 1: an agenda request is what refreshes the cache ────────

const GOOGLE_EVENT = {
  id: 'google:cal-1:e1',
  calendarId: 'cal-1',
  title: 'Standup',
  startAt: 1000,
  endAt: 2000,
  allDay: false,
  notes: null,
  responseStatus: null,
  etag: null,
  updatedAt: 500
}

const AGENDA_NOW = new Date(2026, 7, 20, 3, 0, 0).getTime()

function cacheOf(syncedAt: number, events: unknown[] = []): GoogleCalendarCache {
  return { accountId: 'default', syncedAt, calendars: { 'cal-1': events } } as GoogleCalendarCache
}

describe('RuntimeGoogleCalendarCommands — agenda access refreshes a stale cache', () => {
  it('syncs on access and returns the freshly fetched events, with no Sync now press', async () => {
    const commands = new RuntimeGoogleCalendarCommands(
      makeHost({ googleCalendarSelectedIds: ['cal-1'] })
    )
    const readCache = vi
      .fn()
      .mockReturnValueOnce(cacheOf(AGENDA_NOW - 10 * 60 * 1000))
      .mockReturnValueOnce(cacheOf(AGENDA_NOW, [GOOGLE_EVENT]))
    const runSync = vi.fn(async () => ({
      status: 'synced' as const,
      syncedAt: AGENDA_NOW,
      reason: null
    }))
    const events = await commands.listGoogleAgendaEvents({
      readCache,
      runSync,
      now: () => AGENDA_NOW,
      timeoutMs: 1000
    })
    expect(runSync).toHaveBeenCalledTimes(1)
    expect(events.map((event) => event.id)).toEqual(['google:cal-1:e1'])
  })

  it('serves the cache untouched when it is still fresh', async () => {
    const commands = new RuntimeGoogleCalendarCommands(
      makeHost({ googleCalendarSelectedIds: ['cal-1'] })
    )
    const runSync = vi.fn()
    const events = await commands.listGoogleAgendaEvents({
      readCache: () => cacheOf(AGENDA_NOW - 1000, [GOOGLE_EVENT]),
      runSync,
      now: () => AGENDA_NOW,
      timeoutMs: 1000
    })
    expect(runSync).not.toHaveBeenCalled()
    expect(events).toHaveLength(1)
  })

  it('still serves the existing cache when the refresh fails', async () => {
    const commands = new RuntimeGoogleCalendarCommands(
      makeHost({ googleCalendarSelectedIds: ['cal-1'] })
    )
    const events = await commands.listGoogleAgendaEvents({
      readCache: () => cacheOf(AGENDA_NOW - 10 * 60 * 1000, [GOOGLE_EVENT]),
      runSync: async () => ({ status: 'failed', syncedAt: null, reason: 'network_error' }),
      now: () => AGENDA_NOW,
      timeoutMs: 1000
    })
    expect(events).toHaveLength(1)
  })
})

// ─── Finding 3: a disconnect must not leave the selection behind ─────

describe('RuntimeGoogleCalendarCommands — disconnect clears everything the grid reads', () => {
  it('clears the ticked calendar selection so a late cache write cannot repopulate the agenda', async () => {
    const host = makeHost({ googleCalendarSelectedIds: ['cal-1', 'cal-2'] })
    const commands = new RuntimeGoogleCalendarCommands(host, {
      loadTokens: () => null,
      clearTokens: vi.fn(),
      clearCache: vi.fn()
    })
    await commands.disconnectGoogleCalendar()
    expect(commands.getGoogleSelectedCalendarIds()).toEqual([])
    const events = await commands.listGoogleAgendaEvents({
      readCache: () => cacheOf(AGENDA_NOW, [GOOGLE_EVENT]),
      runSync: vi.fn(),
      now: () => AGENDA_NOW,
      timeoutMs: 1000
    })
    expect(events).toEqual([])
  })
})

// ─── Finding 4: a dead grant must survive a relaunch ─────────────────

describe('RuntimeGoogleCalendarCommands — the last sync failure is persisted', () => {
  it('reports a failure recorded by an earlier process, before any sync runs', () => {
    const commands = new RuntimeGoogleCalendarCommands(
      makeHost({ googleCalendarLastSyncFailure: 'auth_revoked' }),
      { loadTokens: () => null, readCache: () => null }
    )
    expect(commands.getGoogleCalendarStatus().lastSyncFailure).toBe('auth_revoked')
  })

  it('records the reason a manual sync failed', async () => {
    const host = makeHost({ googleCalendarSelectedIds: ['cal-1'] })
    const commands = new RuntimeGoogleCalendarCommands(host, {
      loadTokens: () => null,
      readCache: () => null,
      runSync: async () => ({ status: 'failed', syncedAt: null, reason: 'auth_revoked' })
    })
    await commands.syncGoogleCalendarNow()
    expect(commands.getGoogleCalendarStatus().lastSyncFailure).toBe('auth_revoked')
  })

  it('records a failure hit on the unattended agenda path too', async () => {
    const host = makeHost({ googleCalendarSelectedIds: ['cal-1'] })
    const commands = new RuntimeGoogleCalendarCommands(host, {
      loadTokens: () => null,
      readCache: () => null
    })
    await commands.listGoogleAgendaEvents({
      readCache: () => cacheOf(AGENDA_NOW - 10 * 60 * 1000),
      runSync: async () => ({ status: 'failed', syncedAt: null, reason: 'auth_revoked' }),
      now: () => AGENDA_NOW,
      timeoutMs: 1000
    })
    expect(commands.getGoogleCalendarStatus().lastSyncFailure).toBe('auth_revoked')
  })

  it('clears the recorded failure once a sync succeeds', async () => {
    const host = makeHost({
      googleCalendarSelectedIds: ['cal-1'],
      googleCalendarLastSyncFailure: 'auth_revoked'
    })
    const commands = new RuntimeGoogleCalendarCommands(host, {
      loadTokens: () => null,
      readCache: () => null,
      runSync: async () => ({ status: 'synced', syncedAt: 1, reason: null })
    })
    await commands.syncGoogleCalendarNow()
    expect(commands.getGoogleCalendarStatus().lastSyncFailure).toBeNull()
  })
})

// ─── Finding 6: the connected account row must not be blank ──────────

describe('RuntimeGoogleCalendarCommands — connect labels the account', () => {
  const CONNECT_DEPS = {
    getConfig: () => ({
      clientId: 'id',
      authorizeEndpoint: 'a',
      tokenEndpoint: 't',
      revokeEndpoint: 'r',
      scope: 's'
    }),
    beginOAuthFlow: async () => ({
      code: 'code-1',
      codeVerifier: 'verifier-1',
      redirectUri: 'http://127.0.0.1:1/auth/callback'
    }),
    exchangeCode: vi.fn(async () => ({
      refreshToken: 'refresh-1',
      accessToken: 'access-1',
      accessTokenExpiresAt: 9999,
      accountEmail: null
    }))
  }

  it('takes the account address from the primary calendar and stores it', async () => {
    const saveTokens = vi.fn()
    const commands = new RuntimeGoogleCalendarCommands(makeHost(), {
      ...CONNECT_DEPS,
      saveTokens,
      listCalendars: async () => [
        { id: 'work', summary: 'Work', primary: false },
        { id: 'someone@example.com', summary: 'Me', primary: true }
      ]
    })
    expect(await commands.connectGoogleCalendar()).toEqual({
      accountEmail: 'someone@example.com'
    })
    expect(saveTokens).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ accountEmail: 'someone@example.com' })
    )
  })

  it('still connects when the calendar list cannot be read', async () => {
    const saveTokens = vi.fn()
    const commands = new RuntimeGoogleCalendarCommands(makeHost(), {
      ...CONNECT_DEPS,
      saveTokens,
      listCalendars: async () => {
        throw new Error('offline')
      }
    })
    expect(await commands.connectGoogleCalendar()).toEqual({ accountEmail: null })
    expect(saveTokens).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ refreshToken: 'refresh-1' })
    )
  })
})
