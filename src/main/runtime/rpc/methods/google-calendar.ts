import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'

const SetSelectedCalendars = z.object({
  calendarIds: z.array(z.string())
})

export const GOOGLE_CALENDAR_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'googleCalendar.status',
    params: null,
    handler: (_params, { runtime }) => runtime.getGoogleCalendarStatus()
  }),
  // Why: opens a browser and waits on the user, potentially minutes — the Unix
  // socket transport's idle-timeout keepalive is armed for this method (see
  // classifyRuntimeLongPoll in runtime-rpc/runtime-rpc-long-poll.ts). Never send a credential across this
  // boundary; only the account email may cross.
  defineMethod({
    name: 'googleCalendar.connect',
    params: null,
    handler: async (_params, { runtime }) => {
      const { accountEmail } = await runtime.connectGoogleCalendar()
      return { connected: true, accountEmail }
    }
  }),
  defineMethod({
    name: 'googleCalendar.disconnect',
    params: null,
    handler: async (_params, { runtime }) => {
      const { revoked } = await runtime.disconnectGoogleCalendar()
      return { ok: true, revoked }
    }
  }),
  defineMethod({
    name: 'googleCalendar.listCalendars',
    params: null,
    handler: async (_params, { runtime }) => ({
      calendars: await runtime.listGoogleCalendarsForAccount()
    })
  }),
  defineMethod({
    name: 'googleCalendar.setSelectedCalendars',
    params: SetSelectedCalendars,
    handler: async (params, { runtime }) => {
      await runtime.setGoogleSelectedCalendars(params.calendarIds)
      return { ok: true }
    }
  }),
  defineMethod({
    name: 'googleCalendar.syncNow',
    params: null,
    handler: async (_params, { runtime }) => ({
      outcome: await runtime.syncGoogleCalendarNow()
    })
  })
]
