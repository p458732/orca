import { mapGoogleEvent, type GoogleCalendarEvent } from '../../shared/google-calendar-event'

type FetchImpl = typeof globalThis.fetch

const CALENDAR_LIST_URL = 'https://www.googleapis.com/calendar/v3/users/me/calendarList'
const EVENTS_BASE_URL = 'https://www.googleapis.com/calendar/v3/calendars'
// Why: caps a self-referential nextPageToken so a broken response can't hang the sync forever.
const MAX_EVENT_PAGES = 20

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
