import { mapGoogleEvent, type GoogleCalendarEvent } from '../../shared/google-calendar-event'

type FetchImpl = typeof globalThis.fetch

const CALENDAR_LIST_URL = 'https://www.googleapis.com/calendar/v3/users/me/calendarList'
const EVENTS_BASE_URL = 'https://www.googleapis.com/calendar/v3/calendars'
// Why: caps a self-referential nextPageToken so a broken response can't hang the sync forever.
const MAX_EVENT_PAGES = 20
// Why: Google's documented per-page ceiling for events.list — set explicitly so the effective
// window (this × MAX_EVENT_PAGES) is ours to reason about, not whatever Google defaults to.
const MAX_RESULTS_PER_PAGE = 2500

export type GoogleCalendarSummary = {
  id: string
  summary: string
  primary: boolean
}

// Why: caller decides to serve stale cache instead — never retry a rate limit inside this layer.
export class GoogleRateLimitedError extends Error {
  constructor() {
    super('Google Calendar API rate limit was exceeded.')
    this.name = 'GoogleRateLimitedError'
  }
}

// Why: Task 9 refreshes the access token before every call, so a 401 (or 403 — e.g. access to
// this specific calendar was revoked) here means the grant itself is gone, not merely stale.
// Distinguished so the caller can prompt reconnect instead of treating it as a generic failure.
export class GoogleAccessRevokedError extends Error {
  constructor() {
    super('Google Calendar access was revoked or is no longer authorized.')
    this.name = 'GoogleAccessRevokedError'
  }
}

// Why: thrown instead of returning a partial list — a truncated result must never be
// mistaken for the whole window and cached as if it were complete.
export class GooglePageLimitExceededError extends Error {
  constructor() {
    super(`Google Calendar event pagination exceeded ${MAX_EVENT_PAGES} pages.`)
    this.name = 'GooglePageLimitExceededError'
  }
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` }
}

// Why: never interpolate the response body — it's Google's data, not ours, and
// the token never appears here regardless.
async function throwForFailedResponse(response: Response): Promise<never> {
  if (response.status === 429) {
    throw new GoogleRateLimitedError()
  }
  if (response.status === 401 || response.status === 403) {
    throw new GoogleAccessRevokedError()
  }
  throw new Error(`Google Calendar API request failed with status ${response.status}`)
}

export async function listGoogleCalendars(args: {
  accessToken: string
  fetchImpl?: FetchImpl
}): Promise<GoogleCalendarSummary[]> {
  const { accessToken, fetchImpl = globalThis.fetch } = args
  const response = await fetchImpl(CALENDAR_LIST_URL, { headers: authHeaders(accessToken) })
  if (!response.ok) {
    await throwForFailedResponse(response)
  }
  const payload = (await response.json()) as { items?: unknown }
  const items = Array.isArray(payload.items) ? payload.items : []
  return items.map((raw) => {
    const entry = raw as Record<string, unknown>
    return {
      id: String(entry.id),
      summary: typeof entry.summary === 'string' ? entry.summary : '',
      primary: entry.primary === true
    }
  })
}

function buildEventsUrl(calendarId: string, timeMin: number, timeMax: number): URL {
  const url = new URL(`${EVENTS_BASE_URL}/${encodeURIComponent(calendarId)}/events`)
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('timeMin', new Date(timeMin).toISOString())
  url.searchParams.set('timeMax', new Date(timeMax).toISOString())
  url.searchParams.set('maxResults', String(MAX_RESULTS_PER_PAGE))
  return url
}

export async function listGoogleEvents(args: {
  accessToken: string
  calendarId: string
  timeMin: number
  timeMax: number
  fetchImpl?: FetchImpl
}): Promise<GoogleCalendarEvent[]> {
  const { accessToken, calendarId, timeMin, timeMax, fetchImpl = globalThis.fetch } = args
  const events: GoogleCalendarEvent[] = []
  let pageToken: string | undefined
  for (let page = 0; page < MAX_EVENT_PAGES; page++) {
    const url = buildEventsUrl(calendarId, timeMin, timeMax)
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken)
    }
    const response = await fetchImpl(url, { headers: authHeaders(accessToken) })
    if (!response.ok) {
      await throwForFailedResponse(response)
    }
    const payload = (await response.json()) as { items?: unknown; nextPageToken?: unknown }
    const items = Array.isArray(payload.items) ? payload.items : []
    for (const raw of items) {
      const mapped = mapGoogleEvent(raw, calendarId)
      if (mapped) {
        events.push(mapped)
      }
    }
    pageToken = typeof payload.nextPageToken === 'string' ? payload.nextPageToken : undefined
    if (!pageToken) {
      return events
    }
  }
  throw new GooglePageLimitExceededError()
}
