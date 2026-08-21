import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let tempDir: string

vi.mock('electron', () => ({
  app: { getPath: () => tempDir }
}))

const {
  clearGoogleCalendarCache,
  getGoogleCalendarCachePath,
  listCachedEvents,
  readGoogleCalendarCache,
  writeGoogleCalendarCache
} = await import('./google-calendar-cache')

function makeEvent(id: string, calendarId: string) {
  return {
    id: `google:${calendarId}:${id}`,
    calendarId,
    title: id,
    startAt: new Date(2026, 7, 20, 9, 0, 0).getTime(),
    endAt: new Date(2026, 7, 20, 10, 0, 0).getTime(),
    allDay: false,
    notes: null,
    responseStatus: null,
    etag: null,
    updatedAt: 0
  }
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'orca-gcal-'))
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('google calendar cache', () => {
  it('round-trips a written cache', () => {
    writeGoogleCalendarCache({
      accountId: 'acct',
      syncedAt: 123,
      calendars: { work: [makeEvent('a', 'work')] }
    })
    const loaded = readGoogleCalendarCache('acct')
    expect(loaded?.syncedAt).toBe(123)
    expect(loaded?.calendars.work).toHaveLength(1)
  })

  it('returns null when no cache exists', () => {
    expect(readGoogleCalendarCache('missing')).toBeNull()
  })

  it('returns null rather than throwing on a corrupt cache file', () => {
    writeGoogleCalendarCache({ accountId: 'acct', syncedAt: 1, calendars: {} })
    writeFileSync(getGoogleCalendarCachePath('acct'), 'not json at all')
    expect(readGoogleCalendarCache('acct')).toBeNull()
  })

  it('clears a cache', () => {
    writeGoogleCalendarCache({ accountId: 'acct', syncedAt: 1, calendars: {} })
    clearGoogleCalendarCache('acct')
    expect(readGoogleCalendarCache('acct')).toBeNull()
  })

  it('clearing a cache that does not exist is a no-op', () => {
    expect(() => clearGoogleCalendarCache('never-existed')).not.toThrow()
  })
})

describe('listCachedEvents', () => {
  const cache = {
    accountId: 'acct',
    syncedAt: 1,
    calendars: {
      work: [makeEvent('w1', 'work')],
      personal: [makeEvent('p1', 'personal')],
      holidays: [makeEvent('h1', 'holidays')]
    }
  }

  it('returns only the selected calendars', () => {
    const events = listCachedEvents(cache, ['work', 'personal'])
    expect(events.map((entry) => entry.calendarId).sort()).toEqual(['personal', 'work'])
  })

  it('returns nothing when nothing is selected', () => {
    expect(listCachedEvents(cache, [])).toEqual([])
  })

  it('ignores a selected calendar that is not in the cache', () => {
    expect(listCachedEvents(cache, ['work', 'gone'])).toHaveLength(1)
  })

  it('returns nothing for a null cache', () => {
    expect(listCachedEvents(null, ['work'])).toEqual([])
  })
})
