import type { AgendaEntry } from '../../shared/calendar-agenda'
import type { CalendarEvent } from '../../shared/calendar-types'
import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'

const DEFAULT_WINDOW_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

export function parseIsoToEpochMs(value: string, flagName: string): number {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    throw new RuntimeClientError(
      'invalid_argument',
      `Invalid --${flagName}: expected an ISO 8601 date-time`
    )
  }
  return parsed
}

export function resolveAgendaWindow(
  flags: Map<string, string | boolean>,
  now: number
): { from: number; to: number } {
  const rawFrom = getOptionalStringFlag(flags, 'from')
  const rawTo = getOptionalStringFlag(flags, 'to')
  const from = rawFrom ? parseIsoToEpochMs(rawFrom, 'from') : now
  const to = rawTo ? parseIsoToEpochMs(rawTo, 'to') : from + DEFAULT_WINDOW_DAYS * DAY_MS
  if (to <= from) {
    throw new RuntimeClientError('invalid_argument', '--to must be after --from')
  }
  return { from, to }
}

// Why: `all-day` isn't in the shared BOOLEAN_FLAGS set (that set is global to
// the parser), so a stray value token after it lands as a string — reject that
// instead of silently mis-parsing, mirroring getEnabledFlag in automations.ts.
function getAllDayFlag(flags: Map<string, string | boolean>): boolean {
  const value = flags.get('all-day')
  if (typeof value === 'string') {
    throw new RuntimeClientError('invalid_argument', '--all-day does not take a value')
  }
  return value === true
}

function formatAgenda(result: { entries: AgendaEntry[] }): string {
  if (result.entries.length === 0) {
    return 'No events or scheduled automation runs in this window.'
  }
  return result.entries
    .map((entry) => {
      const when = new Date(entry.startAt).toISOString()
      return entry.kind === 'event'
        ? `${when}  [event]       ${entry.event.title}`
        : `${when}  [automation]  ${entry.name}`
    })
    .join('\n')
}

function formatEvent(result: { event: CalendarEvent }): string {
  return `Added "${result.event.title}" (${result.event.id})`
}

export const CALENDAR_HANDLERS: Record<string, CommandHandler> = {
  'calendar agenda': async ({ flags, client, json }) => {
    const window = resolveAgendaWindow(flags, Date.now())
    const result = await client.call<{ entries: AgendaEntry[] }>('calendar.agenda', window)
    printResult(result, json, formatAgenda)
  },
  'calendar add': async ({ flags, client, json }) => {
    const startAt = parseIsoToEpochMs(getRequiredStringFlag(flags, 'start'), 'start')
    const rawEnd = getOptionalStringFlag(flags, 'end')
    const result = await client.call<{ event: CalendarEvent }>('calendar.create', {
      title: getRequiredStringFlag(flags, 'title'),
      startAt,
      endAt: rawEnd ? parseIsoToEpochMs(rawEnd, 'end') : startAt,
      allDay: getAllDayFlag(flags),
      notes: getOptionalStringFlag(flags, 'notes') ?? null
    })
    printResult(result, json, formatEvent)
  },
  // Why: calendar.delete's handler returns void (no `{removed}` field like
  // automation.delete), so the friendly result is synthesized here rather than
  // read off the RPC response — matches the ...response, result: {...} pattern
  // used by `artifacts delete`/`artifacts unshare` for other void RPC results.
  'calendar remove': async ({ flags, client, json }) => {
    const id = getRequiredStringFlag(flags, 'id')
    const response = await client.call('calendar.delete', { id })
    printResult(
      { ...response, result: { removed: true, id } },
      json,
      () => `Removed calendar event ${id}.`
    )
  }
}
