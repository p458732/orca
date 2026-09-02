// @vitest-environment happy-dom

import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CalendarWeekGrid } from './CalendarWeekGrid'
import { getWeekBounds, groupAgendaByDay } from './calendar-week-model'
import type { AgendaEntry } from '../../../../shared/calendar-agenda'

// Why: Tooltip needs a provider in the app; stub so chips render standalone.
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

const HOUR = 60 * 60 * 1000

function spanEntry(startAt: number, endAt: number, title: string): AgendaEntry {
  return {
    kind: 'event',
    startAt,
    endAt,
    event: {
      id: title,
      title,
      startAt,
      endAt,
      allDay: false,
      notes: null,
      source: 'local',
      createdAt: startAt,
      updatedAt: startAt
    }
  }
}

function eventEntry(startAt: number): AgendaEntry {
  return {
    kind: 'event',
    startAt,
    endAt: startAt + HOUR,
    event: {
      id: 'event-1',
      title: 'Dentist',
      startAt,
      endAt: startAt + HOUR,
      allDay: false,
      notes: null,
      source: 'local',
      createdAt: startAt,
      updatedAt: startAt
    }
  }
}

function renderGrid(
  entries: AgendaEntry[],
  overrides: Partial<Parameters<typeof CalendarWeekGrid>[0]> = {}
) {
  const bounds = getWeekBounds(Date.now())
  const props = {
    columns: groupAgendaByDay(entries, bounds.from),
    selectedEventId: null,
    onSelectEvent: vi.fn(),
    onDeleteEvent: vi.fn(),
    onOpenAutomations: vi.fn(),
    ...overrides
  }
  return { bounds, props, ...render(<CalendarWeekGrid {...props} />) }
}

afterEach(cleanup)

describe('CalendarWeekGrid', () => {
  it('labels an automation run so it reads as scheduled, not authored', () => {
    const bounds = getWeekBounds(Date.now())
    renderGrid([
      {
        kind: 'automation-run',
        startAt: bounds.from + 9 * HOUR,
        automationId: 'a1',
        name: 'Nightly'
      }
    ])
    expect(screen.getByText('Automation')).toBeTruthy()
    expect(screen.getByText('Nightly')).toBeTruthy()
  })

  it('navigates to automations when an automation run is clicked', async () => {
    const bounds = getWeekBounds(Date.now())
    const { props } = renderGrid([
      {
        kind: 'automation-run',
        startAt: bounds.from + 9 * HOUR,
        automationId: 'a1',
        name: 'Nightly'
      }
    ])
    await userEvent.click(screen.getByText('Nightly'))
    expect(props.onOpenAutomations).toHaveBeenCalledTimes(1)
  })

  it('offers delete only for a selected event', async () => {
    const bounds = getWeekBounds(Date.now())
    const entries = [eventEntry(bounds.from + 9 * HOUR)]
    const { props, unmount } = renderGrid(entries)
    expect(screen.queryByLabelText('Delete event')).toBeNull()
    await userEvent.click(screen.getByText('Dentist'))
    expect(props.onSelectEvent).toHaveBeenCalledWith('event-1')
    unmount()

    const selected = renderGrid(entries, { selectedEventId: 'event-1' })
    await userEvent.click(screen.getByLabelText('Delete event'))
    expect(selected.props.onDeleteEvent).toHaveBeenCalledWith('event-1')
  })

  it('renders one chip per column a multi-day event covers, with unique keys', () => {
    const bounds = getWeekBounds(Date.now())
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderGrid([
      spanEntry(bounds.from + 9 * HOUR, bounds.from + 2 * 24 * HOUR + 17 * HOUR, 'Offsite')
    ])
    expect(screen.getAllByText('Offsite')).toHaveLength(3)
    expect(screen.getAllByText('Nothing scheduled')).toHaveLength(4)
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('shows a placeholder in every empty column', () => {
    renderGrid([])
    expect(screen.getAllByText('Nothing scheduled')).toHaveLength(7)
  })

  it('renders seven columns without an entry that lands on the window end bound', () => {
    const bounds = getWeekBounds(Date.now())
    renderGrid([
      { kind: 'automation-run', startAt: bounds.to, automationId: 'a1', name: 'Out of range' }
    ])
    expect(screen.queryByText('Out of range')).toBeNull()
    expect(screen.getAllByText('Nothing scheduled')).toHaveLength(7)
  })
})
