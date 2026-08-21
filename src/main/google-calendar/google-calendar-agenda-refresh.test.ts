import { describe, expect, it, vi } from 'vitest'
import type { GoogleCalendarCache } from './google-calendar-cache'
import { GOOGLE_SYNC_STALE_AFTER_MS, type GoogleSyncOutcome } from './google-calendar-sync'
import {
  GOOGLE_AGENDA_SYNC_TIMEOUT_MS,
  refreshGoogleCacheForAgenda
} from './google-calendar-agenda-refresh'

const NOW = new Date(2026, 7, 20, 3, 0, 0).getTime()

function cacheAt(
  syncedAt: number,
  calendarIds: readonly string[] = ['cal-1']
): GoogleCalendarCache {
  return {
    accountId: 'default',
    syncedAt,
    calendars: Object.fromEntries(calendarIds.map((id) => [id, []]))
  }
}

const STALE = cacheAt(NOW - GOOGLE_SYNC_STALE_AFTER_MS - 1)
const FRESH = cacheAt(NOW - 1000)
const REFRESHED = cacheAt(NOW)

function synced(): GoogleSyncOutcome {
  return { status: 'synced', syncedAt: NOW, reason: null }
}

describe('refreshGoogleCacheForAgenda', () => {
  it('caps the CLI wait at the ten seconds the spec allows', () => {
    expect(GOOGLE_AGENDA_SYNC_TIMEOUT_MS).toBe(10_000)
  })

  // Why finding 1: nothing but the settings "Sync now" button used to call the
  // sync, so a 3am agenda served whatever the last settings visit left on disk.
  it('syncs a stale cache on access and serves the refreshed data', async () => {
    const readCache = vi.fn().mockReturnValueOnce(STALE).mockReturnValueOnce(REFRESHED)
    const runSync = vi.fn(async () => synced())
    const result = await refreshGoogleCacheForAgenda({
      selectedCalendarIds: ['cal-1'],
      deps: { readCache, runSync, now: () => NOW, timeoutMs: 1000 }
    })
    expect(runSync).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'default', selectedCalendarIds: ['cal-1'] })
    )
    expect(result.cache).toBe(REFRESHED)
  })

  it('skips the network entirely when the cache is still fresh', async () => {
    const runSync = vi.fn(async () => synced())
    const result = await refreshGoogleCacheForAgenda({
      selectedCalendarIds: ['cal-1'],
      deps: { readCache: () => FRESH, runSync, now: () => NOW, timeoutMs: 1000 }
    })
    expect(runSync).not.toHaveBeenCalled()
    expect(result.cache).toBe(FRESH)
  })

  it('does not sync when no calendar is selected', async () => {
    const runSync = vi.fn(async () => synced())
    await refreshGoogleCacheForAgenda({
      selectedCalendarIds: [],
      deps: { readCache: () => null, runSync, now: () => NOW, timeoutMs: 1000 }
    })
    expect(runSync).not.toHaveBeenCalled()
  })

  it('serves the existing cache when the sync fails, never a blank agenda', async () => {
    const result = await refreshGoogleCacheForAgenda({
      selectedCalendarIds: ['cal-1'],
      deps: {
        readCache: () => STALE,
        runSync: async () => ({
          status: 'failed',
          syncedAt: STALE.syncedAt,
          reason: 'network_error'
        }),
        now: () => NOW,
        timeoutMs: 1000
      }
    })
    expect(result.cache).toBe(STALE)
    expect(result.outcome?.reason).toBe('network_error')
  })

  it('serves the existing cache once the deadline passes instead of hanging the caller', async () => {
    let release: (outcome: GoogleSyncOutcome) => void = () => {}
    const slow = new Promise<GoogleSyncOutcome>((resolve) => {
      release = resolve
    })
    const result = await refreshGoogleCacheForAgenda({
      selectedCalendarIds: ['cal-1'],
      deps: { readCache: () => STALE, runSync: () => slow, now: () => NOW, timeoutMs: 10 }
    })
    expect(result.cache).toBe(STALE)
    expect(result.outcome).toBeNull()
    release(synced())
    await slow
  })
})
