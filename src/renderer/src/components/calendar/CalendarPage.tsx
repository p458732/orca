import { useMemo, useState } from 'react'
import { Info, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { CalendarAddEventDialog } from './CalendarAddEventDialog'
import { CalendarPageHeader } from './CalendarPageHeader'
import { CalendarWeekGrid } from './CalendarWeekGrid'
import { defaultEventStartAt, useCalendarWeekAgenda } from './calendar-page-state'

export default function CalendarPage(): React.JSX.Element {
  const closeCalendarPage = useAppStore((s) => s.closeCalendarPage)
  const openAutomationsPage = useAppStore((s) => s.openAutomationsPage)
  const {
    bounds,
    columns,
    truncated,
    loading,
    error,
    reload,
    removeEvent,
    showPreviousWeek,
    showNextWeek,
    showThisWeek
  } = useCalendarWeekAgenda()
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const newEventStartAt = useMemo(() => defaultEventStartAt(bounds, Date.now()), [bounds])

  return (
    <main className="flex h-full min-h-0 flex-col bg-background">
      <CalendarPageHeader
        bounds={bounds}
        onClose={closeCalendarPage}
        onPreviousWeek={showPreviousWeek}
        onNextWeek={showNextWeek}
        onThisWeek={showThisWeek}
        onAddEvent={() => setAddOpen(true)}
      />
      {error ? (
        <div
          role="alert"
          className="flex shrink-0 items-center gap-2 border-b border-destructive/40 bg-destructive/10 px-5 py-2 text-xs text-destructive md:px-8"
        >
          <span className="min-w-0 flex-1">{error}</span>
          <Button variant="outline" size="xs" onClick={reload}>
            {translate('auto.components.calendar.CalendarPage.retry', 'Retry')}
          </Button>
        </div>
      ) : null}
      {truncated ? (
        <p
          role="status"
          className="flex shrink-0 items-center gap-1.5 border-b border-border px-5 py-2 text-xs text-muted-foreground md:px-8"
        >
          <Info className="size-3.5 shrink-0" />
          {translate(
            'auto.components.calendar.CalendarPage.truncated',
            'This week has more entries than the calendar can show; some are hidden.'
          )}
        </p>
      ) : null}
      {loading ? (
        <p
          role="status"
          aria-live="polite"
          className="flex shrink-0 items-center gap-1.5 border-b border-border px-5 py-2 text-xs text-muted-foreground md:px-8"
        >
          <Loader2 className="size-3.5 animate-spin" />
          {translate('auto.components.calendar.CalendarPage.loading', 'Loading calendar')}
        </p>
      ) : null}
      <CalendarWeekGrid
        columns={columns}
        selectedEventId={selectedEventId}
        onSelectEvent={(eventId) =>
          setSelectedEventId((current) => (current === eventId ? null : eventId))
        }
        onDeleteEvent={(eventId) => {
          setSelectedEventId(null)
          removeEvent(eventId)
        }}
        onOpenAutomations={openAutomationsPage}
      />
      <CalendarAddEventDialog
        open={addOpen}
        defaultStartAt={newEventStartAt}
        onOpenChange={setAddOpen}
        onCreated={reload}
      />
    </main>
  )
}
