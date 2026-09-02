import { Loader2 } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Checkbox } from '../ui/checkbox'
import { Label } from '../ui/label'
import { translate } from '@/i18n/i18n'
import type { GoogleCalendarSummary } from '../calendar/google-calendar-host-client'

type GoogleCalendarSelectionListProps = {
  calendars: readonly GoogleCalendarSummary[]
  selectedIds: readonly string[]
  loading: boolean
  onToggle: (calendarId: string) => void
}

export function GoogleCalendarSelectionList({
  calendars,
  selectedIds,
  loading,
  onToggle
}: GoogleCalendarSelectionListProps): React.JSX.Element {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>
          {translate('auto.components.settings.calendar.calendarsLabel', 'Calendars to import')}
        </Label>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.calendar.calendarsDescription',
            'Only the calendars you select are imported into Orca.'
          )}
        </p>
      </div>
      {loading ? (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Loader2 className="size-3.5 animate-spin" />
          {translate('auto.components.settings.calendar.calendarsLoading', 'Loading calendars')}
        </p>
      ) : calendars.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.calendar.calendarsEmpty',
            'No calendars found in this Google account.'
          )}
        </p>
      ) : (
        <ul className="space-y-0.5">
          {calendars.map((calendar) => (
            <li key={calendar.id}>
              <div className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent">
                <Checkbox
                  checked={selectedIds.includes(calendar.id)}
                  aria-label={calendar.summary}
                  onCheckedChange={() => onToggle(calendar.id)}
                />
                <span className="min-w-0 flex-1 truncate text-sm">{calendar.summary}</span>
                {calendar.primary ? (
                  <Badge variant="secondary" className="shrink-0">
                    {translate('auto.components.settings.calendar.primaryBadge', 'Primary')}
                  </Badge>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
