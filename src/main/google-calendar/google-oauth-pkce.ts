import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server, type ServerResponse } from 'node:http'
import { shell } from 'electron'
import type { GoogleOAuthConfig } from './google-oauth-config'

export type GoogleAuthorizationCode = {
  code: string
  codeVerifier: string
  redirectUri: string
}

const AUTH_TIMEOUT_MS = 5 * 60 * 1000

const GOOGLE_CALLBACK_RESPONSE_HEADERS = {
  'cache-control': 'no-store',
  'content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'content-type': 'text/html; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff'
} as const

// Why: the loopback callback cannot load Orca's renderer bundle, so this
// standalone page mirrors its canonical light/dark tokens without external assets.
const GOOGLE_CALLBACK_SUCCESS_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>Google Calendar connected</title>
    <style>
      :root {
        --background: #fff;
        --foreground: #0a0a0a;
        --muted-foreground: #737373;
        --border: #e5e5e5;
        --success: #15803d;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --background: #0a0a0a;
          --foreground: #fafafa;
          --muted-foreground: #a1a1a1;
          --border: rgb(255 255 255 / 0.07);
          --success: #86efac;
        }
      }
      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        background: var(--background);
        color: var(--foreground);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0.01em;
      }
      main {
        width: min(440px, calc(100% - 48px));
        padding: 48px 0;
        text-align: center;
      }
      .success-mark {
        width: 44px;
        height: 44px;
        margin: 0 auto 20px;
        display: grid;
        place-items: center;
        border: 1px solid var(--border);
        border-radius: 999px;
        color: var(--success);
      }
      .success-mark svg { width: 22px; height: 22px; }
      h1 {
        margin: 0;
        font-size: 28px;
        font-weight: 650;
        line-height: 1.2;
        letter-spacing: -0.02em;
      }
      p {
        margin: 12px 0 0;
        color: var(--muted-foreground);
        font-size: 15px;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="success-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m5 12 4 4L19 6"></path>
        </svg>
      </div>
      <h1>Google Calendar connected</h1>
      <p>You can close this tab and return to the app.</p>
    </main>
  </body>
</html>`

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function createCodeVerifier(): string {
  return base64Url(randomBytes(32))
}

function createCodeChallenge(verifier: string): string {
  return base64Url(createHash('sha256').update(verifier).digest())
}

function closeServer(server: Server): void {
  try {
    // Why: keep-alive sockets from the browser can delay 'close' (and the
    // timeout cleanup) until the browser drops the connection.
    server.closeAllConnections?.()
    server.close()
  } catch {
    // Already closed.
  }
}

export function buildGoogleAuthorizeUrl(args: {
  config: GoogleOAuthConfig
  redirectUri: string
  state: string
  codeChallenge: string
}): string {
  const { config, redirectUri, state, codeChallenge } = args
  const authorizeUrl = new URL(config.authorizeEndpoint)
  authorizeUrl.searchParams.set('client_id', config.clientId)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('scope', config.scope)
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('code_challenge', codeChallenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')
  // Why: without both, Google won't issue a refresh token and the user re-authorises hourly.
  authorizeUrl.searchParams.set('access_type', 'offline')
  authorizeUrl.searchParams.set('prompt', 'consent')
  return authorizeUrl.toString()
}

export function beginGoogleOAuthFlow(
  config: GoogleOAuthConfig,
  timeoutMs: number = AUTH_TIMEOUT_MS
): Promise<GoogleAuthorizationCode> {
  const codeVerifier = createCodeVerifier()
  const state = base64Url(randomBytes(32))

  return new Promise((resolve, reject) => {
    let settled = false
    let redirectUri = ''

    function rejectFlow(error: Error): void {
      if (settled) {
        return
      }
      settled = true
      reject(error)
      closeServer(server)
    }

    function resolveFlow(code: string): void {
      if (settled) {
        return
      }
      settled = true
      resolve({
        code,
        codeVerifier,
        redirectUri
      })
      closeServer(server)
    }

    function writeInvalidCallback(response: ServerResponse): void {
      response.writeHead(400)
      response.end('Invalid Google Calendar sign-in response.')
    }

    const server = createServer((request, response) => {
      try {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1')
        if (url.pathname !== '/auth/callback') {
          response.writeHead(404)
          response.end('Not found')
          return
        }
        const code = url.searchParams.get('code')
        const returnedState = url.searchParams.get('state')
        if (returnedState !== state) {
          // Why: stray loopback probes must not be able to cancel the user's login.
          writeInvalidCallback(response)
          return
        }
        if (url.searchParams.has('error')) {
          response.writeHead(400)
          response.end('Google Calendar connection was cancelled.')
          rejectFlow(new Error('google_calendar_auth_denied'))
          return
        }
        if (!code) {
          writeInvalidCallback(response)
          return
        }
        response.writeHead(200, GOOGLE_CALLBACK_RESPONSE_HEADERS)
        response.end(GOOGLE_CALLBACK_SUCCESS_PAGE)
        resolveFlow(code)
      } catch (error) {
        rejectFlow(
          error instanceof Error ? error : new Error('google_calendar_auth_callback_failed')
        )
      }
    })

    const timeout = setTimeout(() => {
      rejectFlow(new Error('google_calendar_auth_timeout'))
    }, timeoutMs)
    server.once('close', () => clearTimeout(timeout))
    server.once('error', rejectFlow)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        rejectFlow(new Error('google_calendar_auth_loopback_unavailable'))
        return
      }
      redirectUri = `http://127.0.0.1:${address.port}/auth/callback`
      const authorizeUrl = buildGoogleAuthorizeUrl({
        config,
        redirectUri,
        state,
        codeChallenge: createCodeChallenge(codeVerifier)
      })
      void shell.openExternal(authorizeUrl).catch((error) => {
        rejectFlow(
          error instanceof Error ? error : new Error('google_calendar_auth_browser_open_failed')
        )
      })
    })
  })
}
