// Why: OrcaRuntimeService is already at the max-lines ratchet ceiling — the Google
// account-management surface (7 methods, each touching OAuth/token/cache collaborators)
// lives here instead, with the runtime holding only thin bound delegates.
import type { CalendarEvent } from '../../shared/calendar-types'
import type { GlobalSettings } from '../../shared/global-settings-types'
import {
  listGoogleCalendars,
  type GoogleCalendarSummary
} from '../google-calendar/google-calendar-client'
import {
  clearGoogleCalendarCache,
  readGoogleCalendarCache,
  listCachedEvents,
  type GoogleCalendarCache
} from '../google-calendar/google-calendar-cache'
import {
  GOOGLE_ACCOUNT_ID,
  GOOGLE_TOKEN_EXPIRY_BUFFER_MS,
  syncGoogleCalendars,
  type GoogleCalendarSyncArgs,
  type GoogleSyncOutcome
} from '../google-calendar/google-calendar-sync'
import {
  getGoogleOAuthConfig,
  type GoogleOAuthConfig
} from '../google-calendar/google-oauth-config'
import { beginGoogleOAuthFlow } from '../google-calendar/google-oauth-pkce'
import {
  exchangeGoogleAuthorizationCode,
  refreshGoogleAccessToken,
  revokeGoogleToken
} from '../google-calendar/google-token-exchange'
import {
  clearGoogleTokens,
  loadGoogleTokens,
  saveGoogleTokens,
  type GoogleStoredTokens
} from '../google-calendar/google-token-store'
import { toCalendarEvent, type GoogleCalendarEvent } from '../../shared/google-calendar-event'

export type GoogleCalendarStatus = {
  connected: boolean
  accountEmail: string | null
  syncedAt: number | null
  selectedCalendarIds: string[]
}

export type RuntimeGoogleCalendarCommandHost = {
  getSettings(): GlobalSettings
  updateSettings(patch: Partial<GlobalSettings>): void
}

// Why: injectable so tests exercise the real branching logic without mocking
// 'electron' (the token store/cache modules import it at module scope).
export type RuntimeGoogleCalendarDeps = {
  loadTokens: typeof loadGoogleTokens
  saveTokens: typeof saveGoogleTokens
  clearTokens: typeof clearGoogleTokens
  readCache: typeof readGoogleCalendarCache
  clearCache: typeof clearGoogleCalendarCache
  beginOAuthFlow: typeof beginGoogleOAuthFlow
  exchangeCode: typeof exchangeGoogleAuthorizationCode
  revokeToken: typeof revokeGoogleToken
  refreshAccessToken: typeof refreshGoogleAccessToken
  listCalendars: typeof listGoogleCalendars
  runSync: (args: GoogleCalendarSyncArgs) => Promise<GoogleSyncOutcome>
  getConfig: () => GoogleOAuthConfig
}

const DEFAULT_DEPS: RuntimeGoogleCalendarDeps = {
  loadTokens: loadGoogleTokens,
  saveTokens: saveGoogleTokens,
  clearTokens: clearGoogleTokens,
  readCache: readGoogleCalendarCache,
  clearCache: clearGoogleCalendarCache,
  beginOAuthFlow: beginGoogleOAuthFlow,
  exchangeCode: exchangeGoogleAuthorizationCode,
  revokeToken: revokeGoogleToken,
  refreshAccessToken: refreshGoogleAccessToken,
  listCalendars: listGoogleCalendars,
  runSync: syncGoogleCalendars,
  getConfig: getGoogleOAuthConfig
}

// Why: the cache validates its envelope but not per-calendar contents, so a
// corrupt-but-envelope-valid file can hand back a non-event value here. This
// must never throw into agenda building — a throw would blank the user's
// entire calendar, including their own local events (see calendar-agenda.ts).
function isPlausibleGoogleCalendarEvent(value: unknown): value is GoogleCalendarEvent {
  if (!value || typeof value !== 'object') {
    return false
  }
  const event = value as Record<string, unknown>
  return (
    typeof event.id === 'string' &&
    typeof event.calendarId === 'string' &&
    typeof event.title === 'string' &&
    typeof event.startAt === 'number' &&
    typeof event.endAt === 'number' &&
    typeof event.allDay === 'boolean' &&
    (typeof event.notes === 'string' || event.notes === null) &&
    typeof event.updatedAt === 'number'
  )
}

export function mapCachedGoogleEventsForAgenda(
  cache: GoogleCalendarCache | null,
  selectedCalendarIds: readonly string[]
): CalendarEvent[] {
  return listCachedEvents(cache, selectedCalendarIds)
    .filter(isPlausibleGoogleCalendarEvent)
    .map(toCalendarEvent)
}

export class RuntimeGoogleCalendarCommands {
  private readonly deps: RuntimeGoogleCalendarDeps

  constructor(
    private readonly host: RuntimeGoogleCalendarCommandHost,
    deps: Partial<RuntimeGoogleCalendarDeps> = {}
  ) {
    this.deps = { ...DEFAULT_DEPS, ...deps }
  }

  getGoogleSelectedCalendarIds(): string[] {
    return this.host.getSettings().googleCalendarSelectedIds ?? []
  }

  async setGoogleSelectedCalendars(calendarIds: string[]): Promise<void> {
    this.host.updateSettings({ googleCalendarSelectedIds: calendarIds })
  }

  getGoogleCalendarStatus(): GoogleCalendarStatus {
    const tokens = this.deps.loadTokens(GOOGLE_ACCOUNT_ID)
    const cache = this.deps.readCache(GOOGLE_ACCOUNT_ID)
    return {
      connected: tokens !== null,
      accountEmail: tokens?.accountEmail ?? null,
      syncedAt: cache?.syncedAt ?? null,
      selectedCalendarIds: this.getGoogleSelectedCalendarIds()
    }
  }

  async connectGoogleCalendar(): Promise<{ accountEmail: string | null }> {
    const config = this.deps.getConfig()
    const auth = await this.deps.beginOAuthFlow(config)
    const tokens = await this.deps.exchangeCode({
      config,
      code: auth.code,
      codeVerifier: auth.codeVerifier,
      redirectUri: auth.redirectUri
    })
    this.deps.saveTokens(GOOGLE_ACCOUNT_ID, tokens)
    return { accountEmail: tokens.accountEmail }
  }

  // Why: revocation failing must never trap the user in a connected state —
  // local tokens and cache are always cleared; `revoked` just reports whether
  // the grant was also torn down on Google's side (see revokeGoogleToken).
  async disconnectGoogleCalendar(): Promise<{ revoked: boolean }> {
    const tokens = this.deps.loadTokens(GOOGLE_ACCOUNT_ID)
    let revoked = true
    if (tokens) {
      revoked = await this.deps.revokeToken({
        config: this.deps.getConfig(),
        token: tokens.refreshToken
      })
    }
    this.deps.clearTokens(GOOGLE_ACCOUNT_ID)
    this.deps.clearCache(GOOGLE_ACCOUNT_ID)
    return { revoked }
  }

  async listGoogleCalendarsForAccount(): Promise<GoogleCalendarSummary[]> {
    const tokens = this.deps.loadTokens(GOOGLE_ACCOUNT_ID)
    if (!tokens) {
      throw new Error('google_calendar_not_connected')
    }
    const accessToken = await this.ensureFreshAccessToken(tokens)
    return this.deps.listCalendars({ accessToken })
  }

  async syncGoogleCalendarNow(): Promise<GoogleSyncOutcome> {
    return this.deps.runSync({
      accountId: GOOGLE_ACCOUNT_ID,
      selectedCalendarIds: this.getGoogleSelectedCalendarIds(),
      force: true
    })
  }

  private async ensureFreshAccessToken(tokens: GoogleStoredTokens): Promise<string> {
    const now = Date.now()
    const expired =
      !tokens.accessToken ||
      tokens.accessTokenExpiresAt == null ||
      tokens.accessTokenExpiresAt <= now + GOOGLE_TOKEN_EXPIRY_BUFFER_MS
    if (!expired) {
      return tokens.accessToken as string
    }
    const config = this.deps.getConfig()
    const refreshed = await this.deps.refreshAccessToken({
      config,
      refreshToken: tokens.refreshToken
    })
    this.deps.saveTokens(GOOGLE_ACCOUNT_ID, {
      ...tokens,
      accessToken: refreshed.accessToken,
      accessTokenExpiresAt: refreshed.accessTokenExpiresAt
    })
    return refreshed.accessToken
  }
}
