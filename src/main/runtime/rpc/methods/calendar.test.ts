import { describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../orca-runtime'
import { CALENDAR_METHODS } from './calendar'

const BASE = Date.UTC(2026, 0, 5, 9, 0, 0)
const HOUR = 60 * 60 * 1000

function methodNamed(name: string) {
  const method = CALENDAR_METHODS.find((entry) => entry.name === name)
  if (!method) {
    throw new Error(`Missing RPC method ${name}`)
  }
  return method
}

function makeRuntime() {
  return {
    buildCalendarAgenda: vi.fn(async () => ({ entries: [], truncated: false })),
    createCalendarEvent: vi.fn((input) => ({ id: 'evt-1', ...input })),
    deleteCalendarEvent: vi.fn()
  } as unknown as OrcaRuntimeService
}

describe('calendar rpc methods', () => {
  it('exposes agenda, create, and delete', () => {
    expect(CALENDAR_METHODS.map((entry) => entry.name).sort()).toEqual([
      'calendar.agenda',
      'calendar.create',
      'calendar.delete'
    ])
  })

  it('agenda forwards the window to the runtime', async () => {
    const runtime = makeRuntime()
    const method = methodNamed('calendar.agenda')
    const params = method.params?.parse({ from: BASE, to: BASE + HOUR })
    await method.handler(params, { runtime })
    expect(runtime.buildCalendarAgenda).toHaveBeenCalledWith(BASE, BASE + HOUR)
  })

  // Why: without it on the wire neither consumer can tell a capped agenda from
  // a genuinely quiet week.
  it('agenda passes the truncation flag through to the client', async () => {
    const runtime = makeRuntime()
    runtime.buildCalendarAgenda = vi.fn(async () => ({ entries: [], truncated: true }))
    const method = methodNamed('calendar.agenda')
    const params = method.params?.parse({ from: BASE, to: BASE + HOUR })
    expect(await method.handler(params, { runtime })).toEqual({ entries: [], truncated: true })
  })

  it('create rejects a blank title at the schema boundary', () => {
    const method = methodNamed('calendar.create')
    expect(() => method.params?.parse({ title: '', startAt: BASE, endAt: BASE + HOUR })).toThrow()
  })

  it('create rejects an end before the start at the schema boundary', () => {
    const method = methodNamed('calendar.create')
    expect(() =>
      method.params?.parse({ title: 'Bad', startAt: BASE, endAt: BASE - HOUR })
    ).toThrow()
  })

  it('delete forwards the id', async () => {
    const runtime = makeRuntime()
    const method = methodNamed('calendar.delete')
    await method.handler({ id: 'evt-1' }, { runtime })
    expect(runtime.deleteCalendarEvent).toHaveBeenCalledWith('evt-1')
  })

  // Why: an older paired client that predates 'google' as a source can still
  // render an imported event and offer delete — the host must refuse rather
  // than silently no-op against a store that never held this id (remote-wire
  // Rule 3: what the host publishes reaches old clients even with no wire change).
  it('delete rejects an imported google event id and never touches the store', async () => {
    const storeDelete = vi.fn()
    const runtime = new OrcaRuntimeService({ deleteCalendarEvent: storeDelete } as never)
    const method = methodNamed('calendar.delete')
    expect(() => method.handler({ id: 'google:primary:abc123' }, { runtime })).toThrow(/imported/i)
    expect(storeDelete).not.toHaveBeenCalled()
  })

  it('delete still removes a genuine local event', async () => {
    const storeDelete = vi.fn()
    const runtime = new OrcaRuntimeService({ deleteCalendarEvent: storeDelete } as never)
    const method = methodNamed('calendar.delete')
    await method.handler({ id: 'evt-1' }, { runtime })
    expect(storeDelete).toHaveBeenCalledWith('evt-1')
  })
})
