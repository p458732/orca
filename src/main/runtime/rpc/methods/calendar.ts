import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import { OptionalBoolean, requiredNumber, requiredString } from '../schemas'

const CalendarWindow = z.object({
  from: requiredNumber('Missing window start'),
  to: requiredNumber('Missing window end')
})

const CalendarEventCreate = z
  .object({
    title: requiredString('Missing event title'),
    startAt: requiredNumber('Missing event start'),
    endAt: requiredNumber('Missing event end'),
    allDay: OptionalBoolean,
    notes: z.string().nullable().optional()
  })
  .refine((value) => value.endAt >= value.startAt, {
    message: 'Event end must not precede its start'
  })

const CalendarEventId = z.object({ id: requiredString('Missing event id') })

export const CALENDAR_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'calendar.agenda',
    params: CalendarWindow,
    // Returns { entries, truncated }; `truncated` is additive, so an older
    // client that only reads `entries` is unaffected.
    handler: (params, { runtime }) => runtime.buildCalendarAgenda(params.from, params.to)
  }),
  defineMethod({
    name: 'calendar.create',
    params: CalendarEventCreate,
    handler: (params, { runtime }) => ({ event: runtime.createCalendarEvent(params) })
  }),
  defineMethod({
    name: 'calendar.delete',
    params: CalendarEventId,
    handler: (params, { runtime }) => runtime.deleteCalendarEvent(params.id)
  })
]
