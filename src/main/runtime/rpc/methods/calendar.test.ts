import { describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../orca-runtime'
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
    buildCalendarAgenda: vi.fn(() => []),
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
})
