import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'

const TOKEN_DIR_NAME = 'google-calendar-tokens'

export type GoogleStoredTokens = {
  refreshToken: string
  accessToken: string | null
  accessTokenExpiresAt: number | null
  accountEmail: string | null
}

function getTokenDir(): string {
  return join(app.getPath('userData'), TOKEN_DIR_NAME)
}

// Why: accountId (an email) isn't filename-safe; base64url matches linear-credential-paths.ts's
// convention for account-scoped file names.
export function getGoogleTokenPath(accountId: string): string {
  return join(getTokenDir(), `${Buffer.from(accountId).toString('base64url')}.enc`)
}

// Matches linear-token-store.ts's writeEncryptedToken: encrypt when available,
// otherwise warn and fall back to plaintext. Both paths use mode 0o600.
function writeEncryptedTokens(path: string, serialized: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(serialized)
    writeFileSync(path, encrypted, { mode: 0o600 })
    return
  }

  console.warn('[google-calendar] safeStorage encryption unavailable — storing token in plaintext')
  writeFileSync(path, serialized, { encoding: 'utf-8', mode: 0o600 })
}

function isGoogleStoredTokens(value: unknown): value is GoogleStoredTokens {
  if (!value || typeof value !== 'object') {
    return false
  }
  const tokens = value as Record<string, unknown>
  return (
    typeof tokens.refreshToken === 'string' &&
    (typeof tokens.accessToken === 'string' || tokens.accessToken === null) &&
    (typeof tokens.accessTokenExpiresAt === 'number' || tokens.accessTokenExpiresAt === null) &&
    (typeof tokens.accountEmail === 'string' || tokens.accountEmail === null)
  )
}

export function saveGoogleTokens(accountId: string, tokens: GoogleStoredTokens): void {
  const dir = getTokenDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeEncryptedTokens(getGoogleTokenPath(accountId), JSON.stringify(tokens))
}

// Why: ciphertext-vs-plaintext was decided at write time, which can differ
// from now (e.g. Linux keyring absent at save, present at read) — try
// decrypt first, only fall back to plaintext on failure.
function decodeStoredTokens(raw: Buffer): string {
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(raw)
    } catch {
      return raw.toString('utf-8')
    }
  }
  return raw.toString('utf-8')
}

// Why: a refresh token must never surface in an error — any read failure
// (missing file, corrupt bytes, undecryptable ciphertext) yields null.
export function loadGoogleTokens(accountId: string): GoogleStoredTokens | null {
  const path = getGoogleTokenPath(accountId)
  if (!existsSync(path)) {
    return null
  }
  try {
    const raw = readFileSync(path)
    const serialized = decodeStoredTokens(raw)
    const parsed: unknown = JSON.parse(serialized)
    return isGoogleStoredTokens(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function clearGoogleTokens(accountId: string): void {
  rmSync(getGoogleTokenPath(accountId), { force: true })
}
