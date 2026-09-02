import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '../ui/button'
import { SettingsRow } from './SettingsFormControls'
import { GoogleCalendarSelectionList } from './GoogleCalendarSelectionList'
import { getIntlLocale, translate } from '@/i18n/i18n'
import type { GoogleCalendarAccount } from './use-google-calendar-account'

function formatSyncedAt(syncedAt: number | null): string {
  if (syncedAt === null) {
    return translate('auto.components.settings.calendar.neverSynced', 'Never')
  }
  return new Intl.DateTimeFormat(getIntlLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(syncedAt)
}

export function GoogleCalendarConnectedDetails({
  account,
  onRequestDisconnect
}: {
  account: GoogleCalendarAccount
  onRequestDisconnect: () => void
}): React.JSX.Element {
  return (
    <div className="space-y-4">
      <SettingsRow
        label={translate('auto.components.settings.calendar.accountLabel', 'Google account')}
        description={account.accountEmail ?? undefined}
        control={
          <div className="flex items-center gap-2">
            {/* A dead grant keeps the account connected, so repair must not route through disconnect. */}
            {account.needsReconnect ? (
              <Button
                type="button"
                size="sm"
                disabled={account.connecting}
                onClick={account.connect}
              >
                {account.connecting ? <Loader2 className="animate-spin" /> : null}
                {account.connecting
                  ? translate(
                      'auto.components.settings.calendar.connecting',
                      'Waiting for your browser…'
                    )
                  : translate('auto.components.settings.calendar.reconnect', 'Reconnect')}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={account.disconnecting}
              onClick={onRequestDisconnect}
            >
              {account.disconnecting ? <Loader2 className="animate-spin" /> : null}
              {translate('auto.components.settings.calendar.disconnect', 'Disconnect')}
            </Button>
          </div>
        }
      />
      <SettingsRow
        label={translate('auto.components.settings.calendar.lastSyncedLabel', 'Last synced')}
        description={formatSyncedAt(account.syncedAt)}
        control={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={account.syncing}
            onClick={account.syncNow}
          >
            {account.syncing ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {account.syncing
              ? translate('auto.components.settings.calendar.syncing', 'Syncing…')
              : translate('auto.components.settings.calendar.syncNow', 'Sync now')}
          </Button>
        }
      />
      <GoogleCalendarSelectionList
        calendars={account.calendars}
        selectedIds={account.selectedIds}
        loading={account.calendarsLoading}
        onToggle={account.toggleCalendar}
      />
    </div>
  )
}
