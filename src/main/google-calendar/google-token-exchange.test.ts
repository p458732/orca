import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GoogleAuthRevokedError,
  exchangeGoogleAuthorizationCode,
  refreshGoogleAccessToken,
  revokeGoogleToken
} from './google-token-exchange'

const CONFIG = {
  clientId: 'test-client.apps.googleusercontent.com',
  authorizeEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revokeEndpoint: 'https://oauth2.googleapis.com/revoke',
  scope: 'https://www.googleapis.com/auth/calendar.readonly'
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response
}

// Why: a fake clock must not leak into later tests if an assertion throws mid-body.
beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('exchangeGoogleAuthorizationCode', () => {
  it('returns the refresh token and an absolute expiry', async () => {
    const now = new Date(2026, 7, 20, 10, 0, 0).getTime()
    vi.setSystemTime(now)
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        expires_in: 3600
      })
    )
    const tokens = await exchangeGoogleAuthorizationCode({
      config: CONFIG,
      code: 'code-1',
      codeVerifier: 'verifier-1',
      redirectUri: 'http://127.0.0.1:1/auth/callback',
      fetchImpl
    })
    expect(tokens.refreshToken).toBe('refresh-1')
    expect(tokens.accessToken).toBe('access-1')
    expect(tokens.accessTokenExpiresAt).toBe(now + 3600 * 1000)
  })

  it('posts to the token endpoint with the verifier', async () => {
    // Why: typed params so `mock.calls[0]` isn't inferred as an empty tuple.
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ access_token: 'a', refresh_token: 'r', expires_in: 60 })
    )
    await exchangeGoogleAuthorizationCode({
      config: CONFIG,
      code: 'code-1',
      codeVerifier: 'verifier-1',
      redirectUri: 'http://127.0.0.1:1/auth/callback',
      fetchImpl
    })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(CONFIG.tokenEndpoint)
    expect(String(init?.body)).toContain('code_verifier=verifier-1')
    expect(String(init?.body)).toContain('grant_type=authorization_code')
  })

  it('throws when Google rejects the exchange', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'invalid_grant' }, 400))
    await expect(
      exchangeGoogleAuthorizationCode({
        config: CONFIG,
        code: 'bad',
        codeVerifier: 'v',
        redirectUri: 'http://127.0.0.1:1/auth/callback',
        fetchImpl
      })
    ).rejects.toThrow()
  })
})

describe('refreshGoogleAccessToken', () => {
  it('returns a new access token with an absolute expiry', async () => {
    const now = new Date(2026, 7, 20, 10, 0, 0).getTime()
    vi.setSystemTime(now)
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ access_token: 'access-2', expires_in: 1800 })
    )
    const result = await refreshGoogleAccessToken({
      config: CONFIG,
      refreshToken: 'refresh-1',
      fetchImpl
    })
    expect(result.accessToken).toBe('access-2')
    expect(result.accessTokenExpiresAt).toBe(now + 1800 * 1000)
  })

  it('raises GoogleAuthRevokedError when the refresh token is rejected', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'invalid_grant' }, 400))
    await expect(
      refreshGoogleAccessToken({ config: CONFIG, refreshToken: 'dead', fetchImpl })
    ).rejects.toBeInstanceOf(GoogleAuthRevokedError)
  })
})

describe('revokeGoogleToken', () => {
  it('posts the token to the revoke endpoint', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({})
    )
    await revokeGoogleToken({ config: CONFIG, token: 'access-1', fetchImpl })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(CONFIG.revokeEndpoint)
    expect(String(init?.body)).toContain('token=access-1')
  })

  it('does not throw when Google rejects the revocation', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'invalid_token' }, 400))
    await expect(
      revokeGoogleToken({ config: CONFIG, token: 'dead', fetchImpl })
    ).resolves.toBeUndefined()
  })
})
