import { describe, expect, it } from 'vitest'
import { AGENDA_MAX_ENTRIES, buildCalendarAgenda } from './calendar-agenda'
import type { CalendarEvent } from './calendar-types'
import type { Automation } from './automations-types'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
// Local midnight, not Date.UTC: the RRULE engine resolves BYHOUR/BYMINUTE with
// local-time Date methods, so a UTC-anchored base makes these assertions
// timezone-dependent and flaky off UTC.
const BASE = new Date(2026, 0, 5, 0, 0, 0, 0).getTime() // Monday, local time

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-1',
    title: 'Dentist',
    startAt: BASE + 9 * HOUR,
    endAt: BASE + 10 * HOUR,
    allDay: false,
    notes: null,
    source: 'local',
    createdAt: BASE,
    updatedAt: BASE,
    ...overrides
  }
}

function automation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: 'auto-1',
    name: 'Nightly PR digest',
    prompt: 'summarize',
    precheck: null,
    agentId: 'claude',
    projectId: 'repo-1',
    executionTargetType: 'local',
    executionTargetId: 'local',
    schedulerOwner: 'local_host_service',
    workspaceMode: 'existing',
    workspaceId: 'ws-1',
    baseBranch: null,
    reuseSession: false,
    timezone: 'UTC',
    rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0',
    dtstart: BASE,
    enabled: true,
    nextRunAt: BASE + 8 * HOUR,
    missedRunPolicy: 'run_once_within_grace',
    missedRunGraceMinutes: 720,
    createdAt: BASE,
    updatedAt: BASE,
    ...overrides
  } as Automation
}

describe('buildCalendarAgenda', () => {
  it('returns only events when there are no automations', () => {
    const agenda = buildCalendarAgenda({
      events: [event()],
      automations: [],
      from: BASE,
      to: BASE + DAY
    })
    expect(agenda).toHaveLength(1)
    expect(agenda[0]).toMatchObject({ kind: 'event', startAt: BASE + 9 * HOUR })
  })

  it('returns only automation runs when there are no events', () => {
    const agenda = buildCalendarAgenda({
      events: [],
      automations: [automation()],
      from: BASE,
      to: BASE + DAY
    })
    expect(agenda).toHaveLength(1)
    expect(agenda[0]).toMatchObject({
      kind: 'automation-run',
      automationId: 'auto-1',
      name: 'Nightly PR digest'
    })
  })

  it('returns an empty agenda when both sources are empty', () => {
    expect(
      buildCalendarAgenda({ events: [], automations: [], from: BASE, to: BASE + DAY })
    ).toEqual([])
  })

  it('merges both sources sorted by start time', () => {
    const agenda = buildCalendarAgenda({
      events: [event()],
      automations: [automation()],
      from: BASE,
      to: BASE + DAY
    })
    expect(agenda.map((entry) => entry.kind)).toEqual(['automation-run', 'event'])
    expect(agenda[0].startAt).toBeLessThan(agenda[1].startAt)
  })

  it('expands a recurring automation across multiple days', () => {
    const agenda = buildCalendarAgenda({
      events: [],
      automations: [automation()],
      from: BASE,
      to: BASE + 3 * DAY
    })
    expect(agenda).toHaveLength(3)
  })

  it('excludes events entirely outside the window', () => {
    const agenda = buildCalendarAgenda({
      events: [event({ id: 'past', startAt: BASE - 5 * DAY, endAt: BASE - 5 * DAY + HOUR })],
      automations: [],
      from: BASE,
      to: BASE + DAY
    })
    expect(agenda).toEqual([])
  })

  it('includes an event that overlaps the window boundary', () => {
    const agenda = buildCalendarAgenda({
      events: [event({ id: 'straddle', startAt: BASE - HOUR, endAt: BASE + HOUR })],
      automations: [],
      from: BASE,
      to: BASE + DAY
    })
    expect(agenda).toHaveLength(1)
    expect(agenda[0]).toMatchObject({ kind: 'event' })
  })

  it('skips disabled automations', () => {
    const agenda = buildCalendarAgenda({
      events: [],
      automations: [automation({ enabled: false })],
      from: BASE,
      to: BASE + DAY
    })
    expect(agenda).toEqual([])
  })

  it('returns an empty agenda when the window is inverted', () => {
    const agenda = buildCalendarAgenda({
      events: [event()],
      automations: [automation()],
      from: BASE + DAY,
      to: BASE
    })
    expect(agenda).toEqual([])
  })

  it('truncates at AGENDA_MAX_ENTRIES so a wide window cannot explode', () => {
    const agenda = buildCalendarAgenda({
      events: [],
      automations: [automation({ rrule: 'FREQ=HOURLY;BYMINUTE=0' })],
      from: BASE,
      to: BASE + 365 * DAY
    })
    expect(agenda).toHaveLength(AGENDA_MAX_ENTRIES)
  })

  it('skips an automation whose schedule cannot be expanded', () => {
    const agenda = buildCalendarAgenda({
      events: [event()],
      automations: [automation({ rrule: 'not-a-real-rule' })],
      from: BASE,
      to: BASE + DAY
    })
    expect(agenda).toHaveLength(1)
    expect(agenda[0]).toMatchObject({ kind: 'event' })
  })
})
