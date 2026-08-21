import { readGoogleCalendarCache, type GoogleCalendarCache } from './google-calendar-cache'
import {
  GOOGLE_ACCOUNT_ID,
  isGoogleCacheStale,
  syncGoogleCalendars,
  type GoogleCalendarSyncArgs,
  type GoogleSyncOutcome
} from './google-calendar-sync'

/** Spec §刷新機制: the agenda path may block for at most this long before falling
 *  back to the cache, so a slow network cannot hang an agent mid-run. */
export const GOOGLE_AGENDA_SYNC_TIMEOUT_MS = 10_000

export type GoogleAgendaRefreshDeps = {
  readCache: (accountId: string) => GoogleCalendarCache | null
  runSync: (args: GoogleCalendarSyncArgs) => Promise<GoogleSyncOutcome>
  now: () => number
  timeoutMs: number
}

const DEFAULT_DEPS: GoogleAgendaRefreshDeps = {
  readCache: readGoogleCalendarCache,
  runSync: syncGoogleCalendars,
  now: Date.now,
  timeoutMs: GOOGLE_AGENDA_SYNC_TIMEOUT_MS
}

/** Resolves to null once `ms` elapses; the underlying work keeps running so its
 *  cache write still lands for the next reader. */
function withDeadline<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms)
  })
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer))
}

export type GoogleAgendaRefresh = {
  cache: GoogleCalendarCache | null
  /** null when nothing was attempted, or when the sync outran the deadline. */
  outcome: GoogleSyncOutcome | null
}

/** Staleness-on-access: an agenda request refreshes a stale cache and serves the
 *  result. Neither a failure nor the deadline may blank the agenda — both fall
 *  back to whatever the cache already holds. */
export async function refreshGoogleCacheForAgenda(args: {
  accountId?: string
  selectedCalendarIds: readonly string[]
  deps?: Partial<GoogleAgendaRefreshDeps>
}): Promise<GoogleAgendaRefresh> {
  const deps = { ...DEFAULT_DEPS, ...args.deps }
  const accountId = args.accountId ?? GOOGLE_ACCOUNT_ID
  const cache = deps.readCache(accountId)
  if (
    args.selectedCalendarIds.length === 0 ||
    !isGoogleCacheStale(cache, deps.now(), args.selectedCalendarIds)
  ) {
    return { cache, outcome: null }
  }
  const outcome = await withDeadline(
    deps.runSync({ accountId, selectedCalendarIds: args.selectedCalendarIds }),
    deps.timeoutMs
  )
  if (outcome?.status !== 'synced') {
    return { cache, outcome }
  }
  return { cache: deps.readCache(accountId), outcome }
}
