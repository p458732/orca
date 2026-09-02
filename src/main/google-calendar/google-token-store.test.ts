import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let tempDir: string
let encryptionAvailable = true

vi.mock('electron', () => ({
  app: { getPath: () => tempDir },
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable,
    encryptString: (value: string) => Buffer.from(`enc:${value}`),
    // Why: real safeStorage throws on bytes it didn't produce; a mock that
    // always succeeds can't expose a read path that skips the real decrypt attempt.
    decryptString: (buffer: Buffer) => {
      const text = buffer.toString()
      if (!text.startsWith('enc:')) {
        throw new Error('bad ciphertext')
      }
      return text.slice('enc:'.length)
    }
  }
}))

const { clearGoogleTokens, getGoogleTokenPath, loadGoogleTokens, saveGoogleTokens } =
  await import('./google-token-store')

const TOKENS = {
  refreshToken: 'refresh-abc',
  accessToken: 'access-xyz',
  accessTokenExpiresAt: new Date(2026, 7, 20, 10, 0, 0).getTime(),
  accountEmail: 'me@example.com'
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'orca-gtoken-'))
  encryptionAvailable = true
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('google token store', () => {
  it('round-trips tokens through encryption', () => {
    saveGoogleTokens('acct', TOKENS)
    expect(loadGoogleTokens('acct')).toEqual(TOKENS)
  })

  it('returns null when nothing was saved', () => {
    expect(loadGoogleTokens('acct')).toBeNull()
  })

  it('still stores when safeStorage encryption is unavailable', () => {
    encryptionAvailable = false
    saveGoogleTokens('acct', TOKENS)
    expect(loadGoogleTokens('acct')).toEqual(TOKENS)
  })

  it('reads a plaintext save after encryption becomes available (regression)', () => {
    encryptionAvailable = false
    saveGoogleTokens('acct', TOKENS)
    encryptionAvailable = true
    expect(loadGoogleTokens('acct')).toEqual(TOKENS)
  })

  it('reads an encrypted save when encryption stays available', () => {
    saveGoogleTokens('acct', TOKENS)
    expect(loadGoogleTokens('acct')).toEqual(TOKENS)
  })

  it('clears tokens', () => {
    saveGoogleTokens('acct', TOKENS)
    clearGoogleTokens('acct')
    expect(loadGoogleTokens('acct')).toBeNull()
  })

  it('returns null rather than throwing on a corrupt token file', () => {
    saveGoogleTokens('acct', TOKENS)
    // Overwrite the exact file the module reads via its own exported path fn.
    writeFileSync(getGoogleTokenPath('acct'), 'not json at all')
    expect(loadGoogleTokens('acct')).toBeNull()
  })
})
