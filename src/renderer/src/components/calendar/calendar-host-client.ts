import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { AgendaEntry } from '../../../../shared/calendar-agenda'
import type { CalendarEvent } from '../../../../shared/calendar-types'

// Calendar events are client-local data, so the calendar never follows the
// active remote runtime the way automations do.
const CALENDAR_TARGET = { kind: 'local' } as const

export type CalendarEventDraft = {
  title: string
  startAt: number
  endAt: number
  allDay: boolean
  notes: string | null
}

export async function fetchCalendarAgenda(from: number, to: number): Promise<AgendaEntry[]> {
  const result = await callRuntimeRpc<{ entries: AgendaEntry[] }>(
    CALENDAR_TARGET,
    'calendar.agenda',
    { from, to }
  )
  return result.entries
}

export async function createCalendarEvent(draft: CalendarEventDraft): Promise<CalendarEvent> {
  const result = await callRuntimeRpc<{ event: CalendarEvent }>(
    CALENDAR_TARGET,
    'calendar.create',
    draft
  )
  return result.event
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  await callRuntimeRpc<void>(CALENDAR_TARGET, 'calendar.delete', { id })
}

/** RPC rejections carry the host's own wording (title required, end before
 *  start); surface it instead of a generic banner. */
export function calendarRequestErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : String(error ?? '').trim()
  return message.length > 0 ? message : fallback
}
