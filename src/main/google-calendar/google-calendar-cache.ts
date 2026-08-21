import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { GoogleCalendarEvent } from '../../shared/google-calendar-event'

const CACHE_DIR_NAME = 'google-calendar'

export type GoogleCalendarCache = {
  accountId: string
  syncedAt: number
  calendars: Record<string, GoogleCalendarEvent[]>
}

function getCacheDir(): string {
  return join(app.getPath('userData'), CACHE_DIR_NAME)
}

// Why: accountId (an email) isn't filename-safe; base64url matches linear-credential-paths.ts's
// convention for account-scoped file names.
export function getGoogleCalendarCachePath(accountId: string): string {
  return join(getCacheDir(), `${Buffer.from(accountId).toString('base64url')}.json`)
}

function isGoogleCalendarCache(value: unknown): value is GoogleCalendarCache {
  if (!value || typeof value !== 'object') {
    return false
  }
  const cache = value as Record<string, unknown>
  return (
    typeof cache.accountId === 'string' &&
    typeof cache.syncedAt === 'number' &&
    typeof cache.calendars === 'object' &&
    cache.calendars !== null &&
    !Array.isArray(cache.calendars)
  )
}

// Why: cache is derived, disposable data — any read failure (missing file, bad
// JSON, wrong shape) must yield null rather than throw into agenda building.
export function readGoogleCalendarCache(accountId: string): GoogleCalendarCache | null {
  try {
    const raw = readFileSync(getGoogleCalendarCachePath(accountId), 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    return isGoogleCalendarCache(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeGoogleCalendarCache(cache: GoogleCalendarCache): void {
  const dir = getCacheDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(getGoogleCalendarCachePath(cache.accountId), JSON.stringify(cache))
}

export function clearGoogleCalendarCache(accountId: string): void {
  rmSync(getGoogleCalendarCachePath(accountId), { force: true })
}

export function listCachedEvents(
  cache: GoogleCalendarCache | null,
  selectedCalendarIds: readonly string[]
): GoogleCalendarEvent[] {
  if (!cache) {
    return []
  }
  return selectedCalendarIds.flatMap((calendarId) => cache.calendars[calendarId] ?? [])
}
