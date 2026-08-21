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
