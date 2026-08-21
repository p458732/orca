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
      selectedCalendarIds: []
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
      selectedCalendarIds: ['primary']
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
        accountEmail: 'me@example.com'
      })),
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
