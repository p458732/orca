import type { CalendarEvent } from '../../../shared/calendar-types'
import {
  createCalendarEvent as createCalendarEventOperation,
  deleteCalendarEvent as deleteCalendarEventOperation,
  listCalendarEvents as listCalendarEventsOperation,
  type CalendarEventCreateInput,
  type CalendarEventOperations
} from '../calendar/calendar-event-operations'
import type { StoreRuntimeState } from './store-runtime-state'
import type { WriteFlushBarrierOperations } from './write-flush-barriers'

type CalendarEventPersistenceRuntime = Pick<StoreRuntimeState, 'state'>

const calendarEventPersistenceContext = Symbol('CalendarEventPersistence')
type CalendarEventPersistenceContext = {
  runtime: CalendarEventPersistenceRuntime
  flushBarriers: WriteFlushBarrierOperations
}

export class CalendarEventPersistence {
  readonly [calendarEventPersistenceContext]: CalendarEventPersistenceContext

  constructor(
    runtime: CalendarEventPersistenceRuntime,
    flushBarriers: WriteFlushBarrierOperations
  ) {
    this[calendarEventPersistenceContext] = { runtime, flushBarriers }
  }

  listCalendarEvents(): CalendarEvent[] {
    return listCalendarEventsOperation(this[calendarEventPersistenceContext].runtime.state)
  }

  createCalendarEvent(input: CalendarEventCreateInput): CalendarEvent {
    return createCalendarEventOperation(getCalendarEventOperations(this), input)
  }

  deleteCalendarEvent(id: string): void {
    deleteCalendarEventOperation(getCalendarEventOperations(this), id)
  }
}

function getCalendarEventOperations(owner: CalendarEventPersistence): CalendarEventOperations {
  return {
    state: owner[calendarEventPersistenceContext].runtime.state,
    flush: () => owner[calendarEventPersistenceContext].flushBarriers.flush()
  }
}

export function installCalendarEventPersistenceContext(
  target: object,
  source: CalendarEventPersistence
): void {
  Object.defineProperty(target, calendarEventPersistenceContext, {
    value: source[calendarEventPersistenceContext]
  })
}
