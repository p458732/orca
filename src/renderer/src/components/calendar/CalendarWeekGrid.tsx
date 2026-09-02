import { CalendarClock, Trash2 } from 'lucide-react'
import { useNow } from '@/hooks/use-now'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { AgendaEntry } from '../../../../shared/calendar-agenda'
import { formatClockTime, formatDayNumber, formatWeekday } from './calendar-date-formatters'
import { startOfLocalDay, type CalendarDayColumn } from './calendar-week-model'

/** Scoped to the column: a multi-day event renders one chip per column it covers. */
function agendaEntryKey(entry: AgendaEntry, dayStart: number): string {
  const id = entry.kind === 'event' ? entry.event.id : `${entry.automationId}:${entry.startAt}`
  return `${dayStart}:${id}`
}

function eventTimeLabel(entry: Extract<AgendaEntry, { kind: 'event' }>): string {
  return entry.event.allDay
    ? translate('auto.components.calendar.CalendarWeekGrid.allDay', 'All day')
    : formatClockTime(entry.startAt)
}

function CalendarEventChip({
  entry,
  selected,
  onSelect,
  onDelete
}: {
  entry: Extract<AgendaEntry, { kind: 'event' }>
  selected: boolean
  onSelect: (eventId: string) => void
  onDelete: (eventId: string) => void
}): React.JSX.Element {
  // Why a flex row, not an overlay: a narrow column truncates the title, and an
  // absolutely positioned delete control would sit on top of it.
  return (
    <div
      data-entry="event"
      data-selected={selected}
      className={cn(
        'flex items-start gap-1 rounded-md border border-border bg-card transition-colors hover:bg-accent',
        selected && 'ring-2 ring-ring'
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(entry.event.id)}
        className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <div className="truncate text-xs font-medium text-card-foreground">{entry.event.title}</div>
        <div className="truncate text-[11px] text-muted-foreground">{eventTimeLabel(entry)}</div>
      </button>
      {selected ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="mt-1 mr-1 shrink-0 text-muted-foreground hover:text-destructive"
              aria-label={translate(
                'auto.components.calendar.CalendarWeekGrid.deleteEvent',
                'Delete event'
              )}
              onClick={() => onDelete(entry.event.id)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {translate('auto.components.calendar.CalendarWeekGrid.deleteEvent', 'Delete event')}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}

function CalendarAutomationChip({
  entry,
  onOpenAutomations
}: {
  entry: Extract<AgendaEntry, { kind: 'automation-run' }>
  onOpenAutomations: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      data-entry="automation-run"
      onClick={onOpenAutomations}
      className="w-full rounded-md border border-dashed border-border bg-muted/40 px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center gap-1 text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
        <CalendarClock className="size-3 shrink-0" />
        <span className="truncate">
          {translate('auto.components.calendar.CalendarWeekGrid.automationLabel', 'Automation')}
        </span>
      </div>
      <div className="truncate text-xs text-foreground">{entry.name}</div>
      <div className="truncate text-[11px] text-muted-foreground">
        {formatClockTime(entry.startAt)}
      </div>
    </button>
  )
}

function CalendarDayCell({
  column,
  isToday,
  selectedEventId,
  onSelectEvent,
  onDeleteEvent,
  onOpenAutomations
}: {
  column: CalendarDayColumn
  isToday: boolean
  selectedEventId: string | null
  onSelectEvent: (eventId: string) => void
  onDeleteEvent: (eventId: string) => void
  onOpenAutomations: () => void
}): React.JSX.Element {
  return (
    <div
      data-current={isToday ? 'true' : undefined}
      className={cn('flex min-w-0 flex-col', isToday && 'bg-accent/40')}
    >
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-2">
        <span className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
          {formatWeekday(column.dayStart)}
        </span>
        <span
          className={cn(
            'text-xs',
            isToday
              ? 'flex size-5 items-center justify-center rounded-full bg-foreground font-semibold text-background'
              : 'text-muted-foreground'
          )}
        >
          {formatDayNumber(column.dayStart)}
        </span>
      </div>
      <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-1.5">
        {column.entries.length === 0 ? (
          <p className="px-1 py-1 text-[11px] text-muted-foreground/70">
            {translate('auto.components.calendar.CalendarWeekGrid.emptyDay', 'Nothing scheduled')}
          </p>
        ) : (
          column.entries.map((entry) =>
            entry.kind !== 'event' ? (
              <CalendarAutomationChip
                key={agendaEntryKey(entry, column.dayStart)}
                entry={entry}
                onOpenAutomations={onOpenAutomations}
              />
            ) : (
              <CalendarEventChip
                key={agendaEntryKey(entry, column.dayStart)}
                entry={entry}
                selected={selectedEventId === entry.event.id}
                onSelect={onSelectEvent}
                onDelete={onDeleteEvent}
              />
            )
          )
        )}
      </div>
    </div>
  )
}

export function CalendarWeekGrid({
  columns,
  selectedEventId,
  onSelectEvent,
  onDeleteEvent,
  onOpenAutomations
}: {
  columns: readonly CalendarDayColumn[]
  selectedEventId: string | null
  onSelectEvent: (eventId: string) => void
  onDeleteEvent: (eventId: string) => void
  onOpenAutomations: () => void
}): React.JSX.Element {
  // Why useNow: reading the clock in render is impure, and a minute tick also
  // moves the today highlight across midnight without a remount.
  const today = startOfLocalDay(useNow(60_000))
  return (
    <div className="grid min-h-0 flex-1 grid-cols-7 divide-x divide-border border-t border-border">
      {columns.map((column) => (
        <CalendarDayCell
          key={column.dayStart}
          column={column}
          isToday={column.dayStart === today}
          selectedEventId={selectedEventId}
          onSelectEvent={onSelectEvent}
          onDeleteEvent={onDeleteEvent}
          onOpenAutomations={onOpenAutomations}
        />
      ))}
    </div>
  )
}
