import type { GoogleOAuthConfig } from './google-oauth-config'
import type { GoogleStoredTokens } from './google-token-store'

type FetchImpl = typeof globalThis.fetch

// Why: refresh token dead (revoked, or a Testing-status app's 7-day expiry) — caller must prompt reconnect.
export class GoogleAuthRevokedError extends Error {
  constructor() {
    super('Google Calendar authorization was revoked or has expired.')
    this.name = 'GoogleAuthRevokedError'
  }
}

type GoogleTokenErrorBody = { error?: string }

async function readTokenError(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as GoogleTokenErrorBody
    return typeof body.error === 'string' ? body.error : undefined
  } catch {
    return undefined
  }
}

// Why: never interpolate the raw body — only status and Google's error code, no token risk.
async function throwForTokenResponse(response: Response): Promise<never> {
  const errorCode = await readTokenError(response)
  if (errorCode === 'invalid_grant') {
    throw new GoogleAuthRevokedError()
  }
  throw new Error(
    `Google token request failed with status ${response.status}${errorCode ? ` (${errorCode})` : ''}`
  )
}

function expiresAtFromNow(expiresInSeconds: number): number {
  return Date.now() + expiresInSeconds * 1000
}

// Why: a 2xx body missing a field we depend on must fail loudly here, not as an
// undefined value silently persisted into the token store.
function requireString(payload: Record<string, unknown>, field: string): string {
  const value = payload[field]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Google token response is missing "${field}"`)
  }
  return value
}

function requireNumber(payload: Record<string, unknown>, field: string): number {
  const value = payload[field]
  if (typeof value !== 'number') {
    throw new Error(`Google token response is missing "${field}"`)
  }
  return value
}

export async function exchangeGoogleAuthorizationCode(args: {
  config: GoogleOAuthConfig
  code: string
  codeVerifier: string
  redirectUri: string
  fetchImpl?: FetchImpl
}): Promise<GoogleStoredTokens> {
  const { config, code, codeVerifier, redirectUri, fetchImpl = globalThis.fetch } = args
  const body = new URLSearchParams({
    client_id: config.clientId,
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  })
  const response = await fetchImpl(config.tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!response.ok) {
    await throwForTokenResponse(response)
  }
  const payload = (await response.json()) as Record<string, unknown>
  const accessToken = requireString(payload, 'access_token')
  const refreshToken = requireString(payload, 'refresh_token')
  const expiresIn = requireNumber(payload, 'expires_in')
  return {
    refreshToken,
    accessToken,
    accessTokenExpiresAt: expiresAtFromNow(expiresIn),
    accountEmail: null
  }
}

export async function refreshGoogleAccessToken(args: {
  config: GoogleOAuthConfig
  refreshToken: string
  fetchImpl?: FetchImpl
}): Promise<{ accessToken: string; accessTokenExpiresAt: number }> {
  const { config, refreshToken, fetchImpl = globalThis.fetch } = args
  const body = new URLSearchParams({
    client_id: config.clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  })
  const response = await fetchImpl(config.tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!response.ok) {
    await throwForTokenResponse(response)
  }
  const payload = (await response.json()) as Record<string, unknown>
  const accessToken = requireString(payload, 'access_token')
  const expiresIn = requireNumber(payload, 'expires_in')
  return {
    accessToken,
    accessTokenExpiresAt: expiresAtFromNow(expiresIn)
  }
}

// Why: revocation failing must never block local disconnect, so this never throws —
// it reports success via the return value instead, so a stale grant left on Google's
// side isn't a silent, invisible failure to the caller.
export async function revokeGoogleToken(args: {
  config: GoogleOAuthConfig
  token: string
  fetchImpl?: FetchImpl
}): Promise<boolean> {
  const { config, token, fetchImpl = globalThis.fetch } = args
  const body = new URLSearchParams({ token })
  try {
    const response = await fetchImpl(config.revokeEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    })
    return response.ok
  } catch {
    return false
  }
}
