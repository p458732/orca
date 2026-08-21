import { describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { GOOGLE_CALENDAR_METHODS } from './google-calendar'

function methodNamed(name: string) {
  const method = GOOGLE_CALENDAR_METHODS.find((entry) => entry.name === name)
  if (!method) {
    throw new Error(`Missing RPC method ${name}`)
  }
  return method
}

describe('google calendar rpc methods', () => {
  it('exposes the full account surface', () => {
    expect(GOOGLE_CALENDAR_METHODS.map((entry) => entry.name).sort()).toEqual([
      'googleCalendar.connect',
      'googleCalendar.disconnect',
      'googleCalendar.listCalendars',
      'googleCalendar.setSelectedCalendars',
      'googleCalendar.status',
      'googleCalendar.syncNow'
    ])
  })

  it('setSelectedCalendars rejects a non-array payload at the schema boundary', () => {
    const method = methodNamed('googleCalendar.setSelectedCalendars')
    expect(() => method.params?.parse({ calendarIds: 'primary' })).toThrow()
  })

  it('setSelectedCalendars accepts an empty selection', () => {
    const method = methodNamed('googleCalendar.setSelectedCalendars')
    expect(() => method.params?.parse({ calendarIds: [] })).not.toThrow()
  })

  it('setSelectedCalendars forwards the ids to the runtime', async () => {
    const runtime = { setGoogleSelectedCalendars: vi.fn(async () => undefined) }
    const method = methodNamed('googleCalendar.setSelectedCalendars')
    await method.handler({ calendarIds: ['a', 'b'] } as never, { runtime } as never)
    expect(runtime.setGoogleSelectedCalendars).toHaveBeenCalledWith(['a', 'b'])
  })

  it('status forwards the runtime status verbatim', async () => {
    const status = {
      connected: true,
      accountEmail: 'me@example.com',
      syncedAt: 1000,
      selectedCalendarIds: ['primary']
    }
    const runtime = {
      getGoogleCalendarStatus: vi.fn(() => status)
    } as unknown as OrcaRuntimeService
    const method = methodNamed('googleCalendar.status')
    expect(await method.handler(undefined, { runtime })).toEqual(status)
  })

  it('connect runs the PKCE flow and reports connected with the account email', async () => {
    const runtime = {
      connectGoogleCalendar: vi.fn(async () => ({ accountEmail: 'me@example.com' }))
    } as unknown as OrcaRuntimeService
    const method = methodNamed('googleCalendar.connect')
    expect(await method.handler(undefined, { runtime })).toEqual({
      connected: true,
      accountEmail: 'me@example.com'
    })
  })

  it('disconnect always reports ok and surfaces whether remote revocation succeeded', async () => {
    const runtime = {
      disconnectGoogleCalendar: vi.fn(async () => ({ revoked: false }))
    } as unknown as OrcaRuntimeService
    const method = methodNamed('googleCalendar.disconnect')
    expect(await method.handler(undefined, { runtime })).toEqual({ ok: true, revoked: false })
  })

  it('listCalendars wraps the runtime list in a calendars envelope', async () => {
    const calendars = [{ id: 'primary', summary: 'Primary', primary: true }]
    const runtime = {
      listGoogleCalendarsForAccount: vi.fn(async () => calendars)
    } as unknown as OrcaRuntimeService
    const method = methodNamed('googleCalendar.listCalendars')
    expect(await method.handler(undefined, { runtime })).toEqual({ calendars })
  })

  it('syncNow wraps the runtime outcome in an outcome envelope', async () => {
    const outcome = { status: 'synced' as const, syncedAt: 1000, reason: null }
    const runtime = {
      syncGoogleCalendarNow: vi.fn(async () => outcome)
    } as unknown as OrcaRuntimeService
    const method = methodNamed('googleCalendar.syncNow')
    expect(await method.handler(undefined, { runtime })).toEqual({ outcome })
  })
})
