// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as GoogleCalendarHostClient from '../calendar/google-calendar-host-client'

const SYNCED_AT = Date.UTC(2026, 7, 20, 9, 30)

const mocks = vi.hoisted(() => ({
  fetchStatus: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  listCalendars: vi.fn(),
  setSelected: vi.fn(),
  syncNow: vi.fn(),
  openCalendarPage: vi.fn()
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, options?: Record<string, unknown>) =>
    options
      ? fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(options[name] ?? ''))
      : fallback,
  getIntlLocale: () => 'en-US'
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ openCalendarPage: mocks.openCalendarPage })
}))

vi.mock('../calendar/google-calendar-host-client', async (importOriginal) => {
  const actual = await importOriginal<typeof GoogleCalendarHostClient>()
  return {
    ...actual,
    fetchGoogleCalendarStatus: mocks.fetchStatus,
    connectGoogleCalendar: mocks.connect,
    disconnectGoogleCalendar: mocks.disconnect,
    listGoogleCalendars: mocks.listCalendars,
    setSelectedGoogleCalendars: mocks.setSelected,
    syncGoogleCalendarNow: mocks.syncNow
  }
})

import { CalendarSettingsPane } from './CalendarSettingsPane'

function methodNotFound(): Error {
  return Object.assign(new Error('Unknown method: googleCalendar.status'), {
    code: 'method_not_found'
  })
}

function renderPane(): void {
  render(<CalendarSettingsPane />)
}

function connectedStatus(selected: string[] = ['work']): Record<string, unknown> {
  return {
    connected: true,
    accountEmail: 'person@example.com',
    syncedAt: SYNCED_AT,
    selectedCalendarIds: selected
  }
}

async function renderConnected(selected: string[] = ['work']): Promise<void> {
  mocks.fetchStatus.mockResolvedValue(connectedStatus(selected))
  renderPane()
  await screen.findByText('person@example.com')
}

describe('CalendarSettingsPane', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset()
    }
    mocks.fetchStatus.mockResolvedValue({
      connected: false,
      accountEmail: null,
      syncedAt: null,
      selectedCalendarIds: []
    })
    mocks.connect.mockResolvedValue({ accountEmail: 'person@example.com' })
    mocks.disconnect.mockResolvedValue({ revoked: true })
    mocks.listCalendars.mockResolvedValue([
      { id: 'work', summary: 'Work', primary: true },
      { id: 'personal', summary: 'Personal', primary: false }
    ])
    mocks.setSelected.mockResolvedValue(undefined)
    mocks.syncNow.mockResolvedValue({ status: 'synced', syncedAt: SYNCED_AT, reason: null })
  })

  afterEach(cleanup)

  it('offers a connect action and hides the calendar list until an account is connected', async () => {
    renderPane()

    expect(await screen.findByRole('button', { name: 'Connect Google Calendar' })).toBeEnabled()
    expect(screen.getByText(/Connecting opens your browser/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument()
    expect(mocks.listCalendars).not.toHaveBeenCalled()
  })

  it('names the browser hand-off while the OAuth flow is open', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    let release: (() => void) | undefined
    mocks.connect.mockImplementation(
      () =>
        new Promise<{ accountEmail: string }>((resolve) => {
          release = () => resolve({ accountEmail: 'person@example.com' })
        })
    )
    renderPane()

    await user.click(await screen.findByRole('button', { name: 'Connect Google Calendar' }))
    expect(await screen.findByRole('button', { name: 'Waiting for your browser…' })).toBeDisabled()

    mocks.fetchStatus.mockResolvedValue(connectedStatus())
    release?.()
    await screen.findByText('person@example.com')
  })

  it('shows the account, its calendars, and the last sync time once connected', async () => {
    await renderConnected()

    expect(screen.getByText('Google account')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Work' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Personal' })).not.toBeChecked()
    expect(screen.getByText('Primary')).toBeInTheDocument()
    expect(
      screen.getByText(
        new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
          SYNCED_AT
        )
      )
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeEnabled()
  })

  it('saves the selection when a calendar is checked', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await renderConnected()

    await user.click(screen.getByRole('checkbox', { name: 'Personal' }))
    expect(mocks.setSelected).toHaveBeenCalledWith(['work', 'personal'])

    await user.click(screen.getByRole('checkbox', { name: 'Work' }))
    expect(mocks.setSelected).toHaveBeenLastCalledWith(['personal'])
  })

  it('restores the checkbox and explains the failure when the selection cannot be saved', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    mocks.setSelected.mockRejectedValue(new Error('boom'))
    await renderConnected()

    await user.click(screen.getByRole('checkbox', { name: 'Personal' }))
    expect(await screen.findByText('Could not save the calendar selection.')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Personal' })).not.toBeChecked()
    )
  })

  it('requires confirmation before disconnecting', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await renderConnected()

    await user.click(screen.getByRole('button', { name: 'Disconnect' }))
    expect(mocks.disconnect).not.toHaveBeenCalled()
    expect(await screen.findByText('Disconnect Google Calendar?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mocks.disconnect).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Disconnect' }))
    await user.click(await screen.findByRole('button', { name: 'Disconnect Google Calendar' }))
    expect(mocks.disconnect).toHaveBeenCalledOnce()
  })

  it('tells the user where to remove a grant Google did not revoke', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    mocks.disconnect.mockResolvedValue({ revoked: false })
    await renderConnected()

    await user.click(screen.getByRole('button', { name: 'Disconnect' }))
    await user.click(await screen.findByRole('button', { name: 'Disconnect Google Calendar' }))

    expect(await screen.findByText(/Google did not confirm the revocation/)).toBeInTheDocument()
    expect(screen.getByText(/Third-party apps & services/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open Google Account connections/ })).toHaveAttribute(
      'href',
      'https://myaccount.google.com/connections'
    )
  })

  it.each([
    ['not_connected', 'Google account is not connected. Connect it above, then sync again.'],
    [
      'auth_revoked',
      'Google access is no longer valid. Reconnect your Google account to sync again.'
    ],
    [
      'rate_limited',
      'Google is limiting requests right now. This is temporary — sync again in a few minutes.'
    ],
    ['network_error', 'Could not reach Google. Check your internet connection, then sync again.']
  ])('turns the %s sync reason into an actionable message', async (reason, expected) => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    mocks.syncNow.mockResolvedValue({ status: 'failed', syncedAt: null, reason })
    await renderConnected()

    await user.click(screen.getByRole('button', { name: 'Sync now' }))
    expect(await screen.findByText(expected)).toBeInTheDocument()
    expect(screen.queryByText(reason)).not.toBeInTheDocument()
  })

  it('offers a reconnect that repairs the account in place after auth_revoked', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    mocks.syncNow.mockResolvedValue({
      status: 'failed',
      syncedAt: null,
      reason: 'auth_revoked'
    })
    await renderConnected()
    expect(screen.queryByRole('button', { name: 'Reconnect' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sync now' }))
    const reconnect = await screen.findByRole('button', { name: 'Reconnect' })

    await user.click(reconnect)
    expect(mocks.connect).toHaveBeenCalledOnce()
    // The repair must never route through the destructive path.
    expect(mocks.disconnect).not.toHaveBeenCalled()
    expect(screen.queryByText('Disconnect Google Calendar?')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Reconnect' })).not.toBeInTheDocument()
    )
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument()
  })

  it('keeps reconnect out of a healthy connected account', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await renderConnected()

    expect(screen.queryByRole('button', { name: 'Reconnect' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sync now' }))
    await screen.findByText('Calendars synced.')
    expect(screen.queryByRole('button', { name: 'Reconnect' })).not.toBeInTheDocument()
  })

  it('names the oversized calendar behind page_limit_exceeded', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    mocks.syncNow.mockResolvedValue({
      status: 'failed',
      syncedAt: null,
      reason: 'page_limit_exceeded',
      failedCalendarId: 'personal'
    })
    await renderConnected()

    await user.click(screen.getByRole('button', { name: 'Sync now' }))
    const message = await screen.findByText(
      '“Personal” has more events than one sync can fetch. Deselect it above, then sync again.'
    )
    // The copy says "above", so the checkboxes must really precede the notice.
    expect(
      message.compareDocumentPosition(screen.getByRole('checkbox', { name: 'Personal' }))
    ).toBe(Node.DOCUMENT_POSITION_PRECEDING)
  })

  it('reports a successful and an already-fresh sync differently', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await renderConnected()

    await user.click(screen.getByRole('button', { name: 'Sync now' }))
    expect(await screen.findByText('Calendars synced.')).toBeInTheDocument()

    mocks.syncNow.mockResolvedValue({
      status: 'skipped_fresh',
      syncedAt: SYNCED_AT,
      reason: null
    })
    await user.click(screen.getByRole('button', { name: 'Sync now' }))
    expect(await screen.findByText('Calendars are already up to date.')).toBeInTheDocument()
  })

  it('shows a readable message instead of a blank pane when a request fails', async () => {
    mocks.fetchStatus.mockRejectedValue(new Error('socket hang up'))
    renderPane()

    expect(
      await screen.findByText('Could not load the Google Calendar connection.')
    ).toBeInTheDocument()
    expect(screen.getByText('Google Calendar')).toBeInTheDocument()
    expect(screen.queryByText('socket hang up')).not.toBeInTheDocument()
  })

  it('explains that an older host cannot import Google calendars', async () => {
    mocks.fetchStatus.mockRejectedValue(methodNotFound())
    renderPane()

    expect(await screen.findByText(/isn’t available on this Orca host/)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Connect Google Calendar' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Could not load the Google Calendar connection.')
    ).not.toBeInTheDocument()
  })

  it('opens the calendar page from the pane', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderPane()

    await user.click(await screen.findByRole('button', { name: /Open Calendar/ }))
    expect(mocks.openCalendarPage).toHaveBeenCalledOnce()
  })
})

// Why finding 4: needsReconnect used to live only in memory, so after a relaunch
// the pane showed "connected" with an old last-synced time and no way to repair.
describe('CalendarSettingsPane — a grant that died before this launch', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset()
    }
    mocks.listCalendars.mockResolvedValue([{ id: 'work', summary: 'Work', primary: true }])
  })

  afterEach(cleanup)

  it('offers reconnect on first render from the host’s persisted failure', async () => {
    mocks.fetchStatus.mockResolvedValue({
      ...connectedStatus(),
      lastSyncFailure: 'auth_revoked'
    })
    renderPane()
    expect(await screen.findByRole('button', { name: 'Reconnect' })).toBeInTheDocument()
    expect(mocks.syncNow).not.toHaveBeenCalled()
  })

  it('leaves the pane alone when the last sync succeeded', async () => {
    mocks.fetchStatus.mockResolvedValue({ ...connectedStatus(), lastSyncFailure: null })
    renderPane()
    await screen.findByText('person@example.com')
    expect(screen.queryByRole('button', { name: 'Reconnect' })).not.toBeInTheDocument()
  })
})
