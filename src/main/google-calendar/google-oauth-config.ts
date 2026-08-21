export type GoogleOAuthConfig = {
  clientId: string
  authorizeEndpoint: string
  tokenEndpoint: string
  revokeEndpoint: string
  scope: string
}

// Why: no placeholder — a fake id fails opaquely at Google instead of clearly here.
const GOOGLE_CALENDAR_CLIENT_ID = ''
const GOOGLE_AUTHORIZE_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'
const GOOGLE_CALENDAR_READONLY_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

export function getGoogleOAuthConfig(env: NodeJS.ProcessEnv = process.env): GoogleOAuthConfig {
  const clientId = env.ORCA_GOOGLE_CALENDAR_CLIENT_ID?.trim() || GOOGLE_CALENDAR_CLIENT_ID
  if (!clientId) {
    throw new Error(
      'Google Calendar client id is not configured. Set ORCA_GOOGLE_CALENDAR_CLIENT_ID to your Google OAuth client id.'
    )
  }
  return {
    clientId,
    authorizeEndpoint: GOOGLE_AUTHORIZE_ENDPOINT,
    tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
    revokeEndpoint: GOOGLE_REVOKE_ENDPOINT,
    scope: GOOGLE_CALENDAR_READONLY_SCOPE
  }
}
