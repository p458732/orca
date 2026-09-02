import { useState } from 'react'
import { ArrowRight, CalendarDays, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GoogleCalendarConnectedDetails } from './GoogleCalendarConnectedDetails'
import { GoogleCalendarDisconnectDialog } from './GoogleCalendarDisconnectDialog'
import { useGoogleCalendarAccount } from './use-google-calendar-account'
import type { GoogleCalendarNotice } from './google-calendar-sync-outcome-message'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

function NoticeBanner({ notice }: { notice: GoogleCalendarNotice }): React.JSX.Element {
  const destructive = notice.tone === 'error'
  return (
    <div
      role={destructive ? 'alert' : 'status'}
      className={cn(
        'space-y-1 rounded-md border px-3 py-2 text-xs leading-relaxed',
        destructive
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-border bg-muted/20 text-muted-foreground'
      )}
    >
      <p>{notice.text}</p>
      {notice.link ? (
        <a
          href={notice.link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline underline-offset-4"
        >
          {translate(
            'auto.components.settings.calendar.googleAccountLink',
            'Open Google Account connections'
          )}
          <ExternalLink className="size-3" />
        </a>
      ) : null}
    </div>
  )
}

export function CalendarSettingsPane(): React.JSX.Element {
  const openCalendarPage = useAppStore((state) => state.openCalendarPage)
  const account = useGoogleCalendarAccount()
  const [disconnectOpen, setDisconnectOpen] = useState(false)

  return (
    <div className="divide-y divide-border">
      <section className="space-y-4 py-5">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">
            {translate('auto.components.settings.calendar.googleTitle', 'Google Calendar')}
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {translate(
              'auto.components.settings.calendar.googleDescription',
              'Import events from your Google account so they appear beside the events you create in Orca.'
            )}
          </p>
        </div>

        {account.availability === 'loading' ? (
          <p
            role="status"
            aria-live="polite"
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <Loader2 className="size-3.5 animate-spin" />
            {translate(
              'auto.components.settings.calendar.loading',
              'Loading the Google Calendar connection'
            )}
          </p>
        ) : account.availability === 'unavailable' ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {translate(
              'auto.components.settings.calendar.unavailable',
              'Google Calendar import isn’t available on this Orca host. Update the host to connect a Google account.'
            )}
          </p>
        ) : account.connected ? (
          <GoogleCalendarConnectedDetails
            account={account}
            onRequestDisconnect={() => setDisconnectOpen(true)}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
              {translate(
                'auto.components.settings.calendar.connectHint',
                'Connecting opens your browser so you can sign in to Google and choose what Orca may read.'
              )}
            </p>
            <Button type="button" size="sm" disabled={account.connecting} onClick={account.connect}>
              {account.connecting ? <Loader2 className="animate-spin" /> : null}
              {account.connecting
                ? translate(
                    'auto.components.settings.calendar.connecting',
                    'Waiting for your browser…'
                  )
                : translate('auto.components.settings.calendar.connect', 'Connect Google Calendar')}
            </Button>
          </div>
        )}

        {account.notice ? <NoticeBanner notice={account.notice} /> : null}
      </section>

      <section className="py-5">
        <Button
          type="button"
          variant="ghost"
          className="h-auto w-full justify-start whitespace-normal rounded-md border border-border/60 bg-muted/20 px-4 py-3 text-left hover:bg-muted/35 hover:text-foreground"
          onClick={openCalendarPage}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
            <CalendarDays className="size-4" />
          </span>
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="block text-sm font-medium text-foreground">
              {translate('auto.components.settings.calendar.openCalendar', 'Open Calendar')}
            </span>
            <span className="block text-xs font-normal text-muted-foreground">
              {translate(
                'auto.components.settings.calendar.openCalendarDescription',
                'Review this week beside any events imported from Google.'
              )}
            </span>
          </span>
          <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </Button>
      </section>

      <GoogleCalendarDisconnectDialog
        open={disconnectOpen}
        busy={account.disconnecting}
        onOpenChange={setDisconnectOpen}
        onConfirm={() => {
          setDisconnectOpen(false)
          account.disconnect()
        }}
      />
    </div>
  )
}
