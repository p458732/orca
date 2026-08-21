import { describe, expect, it, vi } from 'vitest'
import {
  GoogleAccessRevokedError,
  GooglePageLimitExceededError,
  GoogleRateLimitedError,
  listGoogleCalendars,
  listGoogleEvents
} from './google-calendar-client'

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response
}

const TIME_MIN = new Date(2026, 6, 21).getTime()
const TIME_MAX = new Date(2026, 10, 18).getTime()

describe('listGoogleCalendars', () => {
  it('maps the calendar list and flags the primary calendar', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        items: [
          { id: 'me@example.com', summary: 'Me', primary: true },
          { id: 'work@group.calendar.google.com', summary: 'Work' }
        ]
      })
    )
    const calendars = await listGoogleCalendars({ accessToken: 'token', fetchImpl })
    expect(calendars).toHaveLength(2)
    expect(calendars[0].primary).toBe(true)
    expect(calendars[1].primary).toBe(false)
  })

  it('sends the access token as a bearer header', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ items: [] })
    )
    await listGoogleCalendars({ accessToken: 'token-abc', fetchImpl })
    const [, init] = fetchImpl.mock.calls[0]
    const headers = init?.headers as Record<string, string> | undefined
    expect(headers?.Authorization).toBe('Bearer token-abc')
  })

  it('never puts the access token in the URL', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ items: [] })
    )
    await listGoogleCalendars({ accessToken: 'super-secret-token', fetchImpl })
    const [url] = fetchImpl.mock.calls[0]
    expect(String(url)).not.toContain('super-secret-token')
  })
})

describe('listGoogleEvents', () => {
  it('asks Google to expand recurring events', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ items: [] })
    )
    await listGoogleEvents({
      accessToken: 'token',
      calendarId: 'primary',
      timeMin: TIME_MIN,
      timeMax: TIME_MAX,
      fetchImpl
    })
    const [url] = fetchImpl.mock.calls[0]
    expect(new URL(String(url)).searchParams.get('singleEvents')).toBe('true')
  })

  it('sets an explicit maxResults so Google does not silently apply its own default', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ items: [] })
    )
    await listGoogleEvents({
      accessToken: 'token',
      calendarId: 'primary',
      timeMin: TIME_MIN,
      timeMax: TIME_MAX,
      fetchImpl
    })
    const [url] = fetchImpl.mock.calls[0]
    expect(new URL(String(url)).searchParams.get('maxResults')).toBe('2500')
  })

  it('sends timeMin/timeMax as RFC3339 strings derived from the epoch millis', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ items: [] })
    )
    await listGoogleEvents({
      accessToken: 'token',
      calendarId: 'primary',
      timeMin: TIME_MIN,
      timeMax: TIME_MAX,
      fetchImpl
    })
    const [url] = fetchImpl.mock.calls[0]
    const params = new URL(String(url)).searchParams
    expect(params.get('timeMin')).toBe(new Date(TIME_MIN).toISOString())
    expect(params.get('timeMax')).toBe(new Date(TIME_MAX).toISOString())
  })

  it('encodeURIComponent-encodes a calendarId containing @ and . before it hits the URL path', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ items: [] })
    )
    await listGoogleEvents({
      accessToken: 'token',
      calendarId: 'me@example.com',
      timeMin: TIME_MIN,
      timeMax: TIME_MAX,
      fetchImpl
    })
    const [url] = fetchImpl.mock.calls[0]
    expect(String(url)).toContain(`/calendars/${encodeURIComponent('me@example.com')}/events`)
    expect(String(url)).not.toContain('/calendars/me@example.com/events')
  })

  it('maps returned events and drops cancelled ones', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        items: [
          {
            id: 'a',
            status: 'confirmed',
            summary: 'Kept',
            start: { dateTime: '2026-08-20T09:00:00+08:00' },
            end: { dateTime: '2026-08-20T10:00:00+08:00' },
            updated: '2026-08-19T00:00:00.000Z'
          },
          { id: 'b', status: 'cancelled' }
        ]
      })
    )
    const events = await listGoogleEvents({
      accessToken: 'token',
      calendarId: 'primary',
      timeMin: TIME_MIN,
      timeMax: TIME_MAX,
      fetchImpl
    })
    expect(events).toHaveLength(1)
    expect(events[0].title).toBe('Kept')
  })

  it('follows nextPageToken until the last page', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: 'p1',
              status: 'confirmed',
              summary: 'Page 1',
              start: { dateTime: '2026-08-20T09:00:00+08:00' },
              end: { dateTime: '2026-08-20T10:00:00+08:00' },
              updated: '2026-08-19T00:00:00.000Z'
            }
          ],
          nextPageToken: 'page-2'
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: 'p2',
              status: 'confirmed',
              summary: 'Page 2',
              start: { dateTime: '2026-08-21T09:00:00+08:00' },
              end: { dateTime: '2026-08-21T10:00:00+08:00' },
              updated: '2026-08-19T00:00:00.000Z'
            }
          ]
        })
      )
    const events = await listGoogleEvents({
      accessToken: 'token',
      calendarId: 'primary',
      timeMin: TIME_MIN,
      timeMax: TIME_MAX,
      fetchImpl
    })
    expect(events.map((entry) => entry.title)).toEqual(['Page 1', 'Page 2'])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('sends the second page request with its page token', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ items: [], nextPageToken: 'page-2' }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
    await listGoogleEvents({
      accessToken: 'token',
      calendarId: 'primary',
      timeMin: TIME_MIN,
      timeMax: TIME_MAX,
      fetchImpl
    })
    const [secondUrl] = fetchImpl.mock.calls[1]
    expect(new URL(String(secondUrl)).searchParams.get('pageToken')).toBe('page-2')
  })

  it('raises GoogleRateLimitedError on 429 without retrying', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'rateLimitExceeded' }, 429))
    await expect(
      listGoogleEvents({
        accessToken: 'token',
        calendarId: 'primary',
        timeMin: TIME_MIN,
        timeMax: TIME_MAX,
        fetchImpl
      })
    ).rejects.toBeInstanceOf(GoogleRateLimitedError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('throws a plain Error carrying the status for a non-429 failure, without retrying', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'backend_error' }, 500))
    let caught: unknown
    try {
      await listGoogleEvents({
        accessToken: 'token',
        calendarId: 'primary',
        timeMin: TIME_MIN,
        timeMax: TIME_MAX,
        fetchImpl
      })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(Error)
    expect(caught).not.toBeInstanceOf(GoogleRateLimitedError)
    expect((caught as Error).message).toContain('500')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('raises GoogleAccessRevokedError on 401 without retrying', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'invalid_credentials' }, 401))
    await expect(
      listGoogleEvents({
        accessToken: 'token',
        calendarId: 'primary',
        timeMin: TIME_MIN,
        timeMax: TIME_MAX,
        fetchImpl
      })
    ).rejects.toBeInstanceOf(GoogleAccessRevokedError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('raises GoogleAccessRevokedError on 403 without retrying', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'insufficientPermissions' }, 403))
    await expect(
      listGoogleEvents({
        accessToken: 'token',
        calendarId: 'primary',
        timeMin: TIME_MIN,
        timeMax: TIME_MAX,
        fetchImpl
      })
    ).rejects.toBeInstanceOf(GoogleAccessRevokedError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('keeps 429 as GoogleRateLimitedError, not GoogleAccessRevokedError', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'rateLimitExceeded' }, 429))
    let caught: unknown
    try {
      await listGoogleEvents({
        accessToken: 'token',
        calendarId: 'primary',
        timeMin: TIME_MIN,
        timeMax: TIME_MAX,
        fetchImpl
      })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(GoogleRateLimitedError)
    expect(caught).not.toBeInstanceOf(GoogleAccessRevokedError)
  })

  it('keeps a 500 as a plain Error carrying its status, not GoogleAccessRevokedError', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'backend_error' }, 500))
    let caught: unknown
    try {
      await listGoogleEvents({
        accessToken: 'token',
        calendarId: 'primary',
        timeMin: TIME_MIN,
        timeMax: TIME_MAX,
        fetchImpl
      })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(Error)
    expect(caught).not.toBeInstanceOf(GoogleAccessRevokedError)
    expect(caught).not.toBeInstanceOf(GoogleRateLimitedError)
    expect((caught as Error).message).toContain('500')
  })

  it('never leaks the access token into a thrown error message', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'backend_error' }, 500))
    await expect(
      listGoogleEvents({
        accessToken: 'super-secret-token',
        calendarId: 'primary',
        timeMin: TIME_MIN,
        timeMax: TIME_MAX,
        fetchImpl
      })
    ).rejects.not.toThrow(/super-secret-token/)
  })

  it('throws GooglePageLimitExceededError instead of silently truncating when the hard page cap is hit', async () => {
    // Why: a self-referential nextPageToken must not hang the sync forever — 21
    // pages always returns another token, so the 20-page cap must trip.
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        items: [
          {
            id: 'x',
            status: 'confirmed',
            summary: 'X',
            start: { dateTime: '2026-08-20T09:00:00+08:00' },
            end: { dateTime: '2026-08-20T10:00:00+08:00' },
            updated: '2026-08-19T00:00:00.000Z'
          }
        ],
        nextPageToken: 'always-more'
      })
    )
    await expect(
      listGoogleEvents({
        accessToken: 'token',
        calendarId: 'primary',
        timeMin: TIME_MIN,
        timeMax: TIME_MAX,
        fetchImpl
      })
    ).rejects.toBeInstanceOf(GooglePageLimitExceededError)
    expect(fetchImpl).toHaveBeenCalledTimes(20)
  })
})
