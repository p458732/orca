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
  const payload = (await response.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
  }
  return {
    refreshToken: payload.refresh_token,
    accessToken: payload.access_token,
    accessTokenExpiresAt: expiresAtFromNow(payload.expires_in),
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
  const payload = (await response.json()) as { access_token: string; expires_in: number }
  return {
    accessToken: payload.access_token,
    accessTokenExpiresAt: expiresAtFromNow(payload.expires_in)
  }
}

// Why: revocation failing must never block local disconnect, so this never throws.
export async function revokeGoogleToken(args: {
  config: GoogleOAuthConfig
  token: string
  fetchImpl?: FetchImpl
}): Promise<void> {
  const { config, token, fetchImpl = globalThis.fetch } = args
  const body = new URLSearchParams({ token })
  try {
    await fetchImpl(config.revokeEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    })
  } catch {
    // Network failure during revoke: still allow local disconnect to proceed.
  }
}
