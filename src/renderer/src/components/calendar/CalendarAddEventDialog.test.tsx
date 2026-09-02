// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CalendarAddEventDialog } from './CalendarAddEventDialog'

const createCalendarEvent = vi.fn()

vi.mock('./calendar-host-client', () => ({
  createCalendarEvent: (...args: unknown[]) => createCalendarEvent(...args),
  calendarRequestErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback
}))

function renderDialog(onCreated = vi.fn()) {
  const onOpenChange = vi.fn()
  render(
    <CalendarAddEventDialog
      open
      defaultStartAt={new Date(2026, 7, 19, 9, 0).getTime()}
      onOpenChange={onOpenChange}
      onCreated={onCreated}
    />
  )
  return { onCreated, onOpenChange }
}

afterEach(() => {
  cleanup()
  createCalendarEvent.mockReset()
})

describe('CalendarAddEventDialog', () => {
  it('blocks a blank title before reaching the host', async () => {
    renderDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Add event' }))
    expect(screen.getByRole('alert').textContent).toBe('Add a title.')
    expect(createCalendarEvent).not.toHaveBeenCalled()
  })

  it('blocks an end before its start before reaching the host', async () => {
    renderDialog()
    await userEvent.type(screen.getByLabelText('Title'), 'Dentist')
    const end = screen.getByLabelText('End')
    await userEvent.clear(end)
    await userEvent.type(end, '2026-08-19T08:00')
    await userEvent.click(screen.getByRole('button', { name: 'Add event' }))
    expect(screen.getByRole('alert').textContent).toBe('The end must not precede the start.')
    expect(createCalendarEvent).not.toHaveBeenCalled()
  })

  it('creates a valid event and asks the page to reload', async () => {
    createCalendarEvent.mockResolvedValue({ id: 'event-1' })
    const { onCreated, onOpenChange } = renderDialog()
    await userEvent.type(screen.getByLabelText('Title'), 'Dentist')
    await userEvent.click(screen.getByRole('button', { name: 'Add event' }))
    expect(createCalendarEvent).toHaveBeenCalledWith({
      title: 'Dentist',
      startAt: new Date(2026, 7, 19, 9, 0).getTime(),
      endAt: new Date(2026, 7, 19, 10, 0).getTime(),
      allDay: false,
      notes: null
    })
    expect(onCreated).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('surfaces a host rejection inline', async () => {
    createCalendarEvent.mockRejectedValue(new Error('Calendar event title is required.'))
    const { onCreated } = renderDialog()
    await userEvent.type(screen.getByLabelText('Title'), 'Dentist')
    await userEvent.click(screen.getByRole('button', { name: 'Add event' }))
    expect(screen.getByRole('alert').textContent).toBe('Calendar event title is required.')
    expect(onCreated).not.toHaveBeenCalled()
  })
})
