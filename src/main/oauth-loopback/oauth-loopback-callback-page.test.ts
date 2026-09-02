import { describe, expect, it } from 'vitest'
import {
  buildOAuthLoopbackCallbackPage,
  OAUTH_LOOPBACK_CALLBACK_RESPONSE_HEADERS
} from './oauth-loopback-callback-page'
import {
  ORCA_CLOUD_CALLBACK_RESPONSE_HEADERS,
  ORCA_CLOUD_CALLBACK_SUCCESS_PAGE
} from '../orca-profiles/profile-cloud-callback-page'

describe('oauth loopback callback page', () => {
  // Why: two hand-maintained copies of a CSP set drift, and a drifted security
  // header is a regression. Identity (not equality) is what makes drift impossible.
  it('hands every loopback OAuth flow the same header object', () => {
    expect(ORCA_CLOUD_CALLBACK_RESPONSE_HEADERS).toBe(OAUTH_LOOPBACK_CALLBACK_RESPONSE_HEADERS)
  })

  it('locks the callback response down to an inert document', () => {
    const csp = OAUTH_LOOPBACK_CALLBACK_RESPONSE_HEADERS['content-security-policy']
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("form-action 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(OAUTH_LOOPBACK_CALLBACK_RESPONSE_HEADERS['cache-control']).toBe('no-store')
    expect(OAUTH_LOOPBACK_CALLBACK_RESPONSE_HEADERS['x-content-type-options']).toBe('nosniff')
  })

  it('renders the caller’s wording into one shared shell', () => {
    const page = buildOAuthLoopbackCallbackPage({ title: 'Connected', body: 'Close this tab.' })
    expect(page).toContain('<title>Connected</title>')
    expect(page).toContain('<h1>Connected</h1>')
    expect(page).toContain('<p>Close this tab.</p>')
    expect(page).not.toContain('<script')
  })

  it('keeps the Orca cloud page wording unchanged through the shared builder', () => {
    expect(ORCA_CLOUD_CALLBACK_SUCCESS_PAGE).toContain('<h1>Signed in to Orca</h1>')
    expect(ORCA_CLOUD_CALLBACK_SUCCESS_PAGE).toContain(
      'You can close this tab and return to the app.'
    )
  })
})
