// @vitest-environment happy-dom

import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
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

function googleEventEntry(startAt: number): AgendaEntry {
  return {
    kind: 'event',
    startAt,
    endAt: startAt + HOUR,
    event: {
      id: 'google:event-1',
      title: 'Standup',
      startAt,
      endAt: startAt + HOUR,
      allDay: false,
      notes: null,
      source: 'google',
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

  it('offers no delete control on a google-sourced event, but still does on a local one', async () => {
    const bounds = getWeekBounds(Date.now())
    const entries = [eventEntry(bounds.from + 9 * HOUR), googleEventEntry(bounds.from + 11 * HOUR)]
    const imported = renderGrid(entries, { selectedEventId: 'google:event-1' })
    await userEvent.click(screen.getByText('Standup'))
    expect(imported.props.onSelectEvent).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Delete event')).toBeNull()
    imported.unmount()

    const local = renderGrid(entries, { selectedEventId: 'event-1' })
    expect(screen.queryAllByLabelText('Delete event')).toHaveLength(1)
    await userEvent.click(screen.getByLabelText('Delete event'))
    expect(local.props.onDeleteEvent).toHaveBeenCalledWith('event-1')
  })

  it('marks a google-sourced event as imported and read-only', () => {
    const bounds = getWeekBounds(Date.now())
    renderGrid([googleEventEntry(bounds.from + 9 * HOUR)])
    const chip = screen.getByText('Standup').closest('[data-entry]')
    expect(chip?.getAttribute('data-entry')).toBe('imported-event')
    expect(within(chip as HTMLElement).getByText('Google')).toBeTruthy()
    expect(within(chip as HTMLElement).getByText('Read-only')).toBeTruthy()
  })

  it('renders an imported event structurally unlike an automation run', () => {
    const bounds = getWeekBounds(Date.now())
    renderGrid([
      googleEventEntry(bounds.from + 9 * HOUR),
      {
        kind: 'automation-run',
        startAt: bounds.from + 10 * HOUR,
        automationId: 'a1',
        name: 'Nightly'
      }
    ])
    const imported = document.querySelector('[data-entry="imported-event"]') as HTMLElement
    const automation = document.querySelector('[data-entry="automation-run"]') as HTMLElement
    expect(imported).toBeTruthy()
    expect(automation).toBeTruthy()
    // An automation run navigates; an imported event is inert content.
    expect(automation.tagName).toBe('BUTTON')
    expect(imported.tagName).not.toBe('BUTTON')
    expect(imported.querySelector('button')).toBeNull()
    expect(within(imported).queryByText('Automation')).toBeNull()
    expect(within(automation).queryByText('Google')).toBeNull()
  })

  it('keeps a local event visually separate from an imported one', () => {
    const bounds = getWeekBounds(Date.now())
    renderGrid([eventEntry(bounds.from + 9 * HOUR), googleEventEntry(bounds.from + 11 * HOUR)])
    const local = screen.getByText('Dentist').closest('[data-entry]')
    expect(local?.getAttribute('data-entry')).toBe('event')
    expect(within(local as HTMLElement).queryByText('Google')).toBeNull()
    expect(within(local as HTMLElement).queryByText('Read-only')).toBeNull()
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
