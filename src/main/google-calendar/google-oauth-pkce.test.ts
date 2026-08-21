import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { GoogleOAuthConfig } from './google-oauth-config'

const CONFIG: GoogleOAuthConfig = {
  clientId: 'test-client.apps.googleusercontent.com',
  authorizeEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revokeEndpoint: 'https://oauth2.googleapis.com/revoke',
  scope: 'https://www.googleapis.com/auth/calendar.readonly'
}

let openedUrl = ''
vi.mock('electron', () => ({
  shell: {
    openExternal: async (url: string) => {
      openedUrl = url
      return undefined
    }
  }
}))

import { beginGoogleOAuthFlow, buildGoogleAuthorizeUrl } from './google-oauth-pkce'

function params(url: string): URLSearchParams {
  return new URL(url).searchParams
}

describe('buildGoogleAuthorizeUrl', () => {
  const url = buildGoogleAuthorizeUrl({
    config: CONFIG,
    redirectUri: 'http://127.0.0.1:54321/auth/callback',
    state: 'state-123',
    codeChallenge: 'challenge-abc'
  })

  it('requests offline access so a refresh token is issued', () => {
    expect(params(url).get('access_type')).toBe('offline')
  })

  it('forces the consent screen so a refresh token is re-issued', () => {
    expect(params(url).get('prompt')).toBe('consent')
  })

  it('uses S256 PKCE', () => {
    expect(params(url).get('code_challenge_method')).toBe('S256')
    expect(params(url).get('code_challenge')).toBe('challenge-abc')
  })

  it('requests only the read-only calendar scope', () => {
    expect(params(url).get('scope')).toBe('https://www.googleapis.com/auth/calendar.readonly')
  })

  it('carries client_id, redirect_uri, state and an authorization-code response type', () => {
    const search = params(url)
    expect(search.get('client_id')).toBe(CONFIG.clientId)
    expect(search.get('redirect_uri')).toBe('http://127.0.0.1:54321/auth/callback')
    expect(search.get('state')).toBe('state-123')
    expect(search.get('response_type')).toBe('code')
  })

  // Corrected quoting: the source apostrophe in "Google's" would otherwise close the string early.
  it("targets Google's authorize endpoint", () => {
    expect(url.startsWith(CONFIG.authorizeEndpoint)).toBe(true)
  })
})

function redirectUriFrom(url: string): string {
  return new URL(url).searchParams.get('redirect_uri') ?? ''
}

describe('beginGoogleOAuthFlow', () => {
  beforeEach(() => {
    openedUrl = ''
  })

  it('resolves with the code when the callback carries a matching state', async () => {
    const pending = beginGoogleOAuthFlow(CONFIG)
    await vi.waitFor(() => expect(openedUrl).not.toBe(''))
    const state = new URL(openedUrl).searchParams.get('state')
    const redirect = redirectUriFrom(openedUrl)
    await fetch(`${redirect}?code=the-code&state=${state}`)
    const result = await pending
    expect(result.code).toBe('the-code')
    expect(result.codeVerifier.length).toBeGreaterThan(0)
  })

  it('ignores a callback whose state does not match, so a stray probe cannot cancel the login', async () => {
    const pending = beginGoogleOAuthFlow(CONFIG)
    await vi.waitFor(() => expect(openedUrl).not.toBe(''))
    const redirect = redirectUriFrom(openedUrl)
    const stray = await fetch(`${redirect}?code=attacker&state=wrong-state`)
    expect(stray.status).toBe(400)
    // The real callback must still resolve the flow.
    const state = new URL(openedUrl).searchParams.get('state')
    await fetch(`${redirect}?code=real-code&state=${state}`)
    expect((await pending).code).toBe('real-code')
  })

  it('rejects when the user denies consent', async () => {
    const pending = beginGoogleOAuthFlow(CONFIG)
    // Attach the rejection handler immediately: the reject happens synchronously
    // inside the fetch below, before the test would otherwise observe it.
    const outcome = pending.catch((error: unknown) => error)
    await vi.waitFor(() => expect(openedUrl).not.toBe(''))
    const state = new URL(openedUrl).searchParams.get('state')
    await fetch(`${redirectUriFrom(openedUrl)}?error=access_denied&state=${state}`)
    expect(await outcome).toBeInstanceOf(Error)
  })

  // Injectable timeout (default 5min) lets this test use a short real duration instead of waiting.
  it('rejects once the timeout elapses without a callback', async () => {
    const pending = beginGoogleOAuthFlow(CONFIG, 10)
    const outcome = pending.catch((error: unknown) => error)
    await vi.waitFor(() => expect(openedUrl).not.toBe(''))
    const error = await outcome
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('google_calendar_auth_timeout')
  })
})
