import type { AgendaEntry, CalendarAgenda } from '../../shared/calendar-agenda'
import { DAY_MS } from '../../shared/calendar-day-span'
import type { CalendarEvent } from '../../shared/calendar-types'
import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'

const DEFAULT_WINDOW_DAYS = 7
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

function invalidIsoDateTime(flagName: string): RuntimeClientError {
  return new RuntimeClientError(
    'invalid_argument',
    `Invalid --${flagName}: expected an ISO 8601 date-time`
  )
}

// Why: `null` alone can't tell "not date-only shaped" (fall through to
// Date.parse) apart from "date-only shaped but the date doesn't exist" (must
// throw, not silently roll over)
type DateOnlyMatch = { shape: 'none' } | { shape: 'invalid' } | { shape: 'valid'; ms: number }

// Why: a bare date has no universal meaning — Date.parse treats it as UTC
// midnight, but every other part of this feature (event display, the week
// grid) is local. Build it from components so it's genuinely local and
// DST-safe, and flag a calendar date that doesn't exist (e.g. Feb 30).
function matchDateOnly(value: string): DateOnlyMatch {
  const match = DATE_ONLY.exec(value)
  if (!match) {
    return { shape: 'none' }
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(year, month - 1, day)
  const rolledOver =
    date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day
  return rolledOver ? { shape: 'invalid' } : { shape: 'valid', ms: date.getTime() }
}

export function parseIsoToEpochMs(value: string, flagName: string): number {
  const dateOnly = matchDateOnly(value)
  if (dateOnly.shape === 'valid') {
    return dateOnly.ms
  }
  if (dateOnly.shape === 'invalid') {
    throw invalidIsoDateTime(flagName)
  }
  // Why: a zoneless date-time (no Z/offset) is already parsed as local by
  // Date.parse — only the date-only case above needed correcting.
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    throw invalidIsoDateTime(flagName)
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

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

// Why: the rest of the feature (bare-date parsing, the week grid) is local, so a
// UTC render here shows the wrong day off UTC. `--json` still carries epoch ms.
export function formatLocalAgendaTime(timestamp: number): string {
  const at = new Date(timestamp)
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`
}

export function formatAgenda(result: CalendarAgenda): string {
  if (result.entries.length === 0) {
    return 'No events or scheduled automation runs in this window.'
  }
  const lines = result.entries.map((entry: AgendaEntry) => {
    const when = formatLocalAgendaTime(entry.startAt)
    return entry.kind === 'event'
      ? `${when}  [event]       ${entry.event.title}`
      : `${when}  [automation]  ${entry.name}`
  })
  if (result.truncated) {
    lines.push('', 'Truncated: this window holds more entries than the agenda can return.')
  }
  return lines.join('\n')
}

function formatEvent(result: { event: CalendarEvent }): string {
  return `Added "${result.event.title}" (${result.event.id})`
}

export const CALENDAR_HANDLERS: Record<string, CommandHandler> = {
  'calendar agenda': async ({ flags, client, json }) => {
    const window = resolveAgendaWindow(flags, Date.now())
    const result = await client.call<CalendarAgenda>('calendar.agenda', window)
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
