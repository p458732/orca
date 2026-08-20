import { CalendarClock, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { getIntlLocale, translate } from '@/i18n/i18n'
import type { AgendaEntry } from '../../../../shared/calendar-agenda'
import { startOfLocalDay, type CalendarDayColumn } from './calendar-week-model'

function agendaEntryKey(entry: AgendaEntry): string {
  return entry.kind === 'event' ? entry.event.id : `${entry.automationId}:${entry.startAt}`
}

function formatClockTime(timestamp: number): string {
  return new Intl.DateTimeFormat(getIntlLocale(), {
    hour: 'numeric',
    minute: '2-digit'
  }).format(timestamp)
}

function formatWeekday(dayStart: number): string {
  return new Intl.DateTimeFormat(getIntlLocale(), { weekday: 'short' }).format(dayStart)
}

function formatDayNumber(dayStart: number): string {
  return new Intl.DateTimeFormat(getIntlLocale(), { day: 'numeric' }).format(dayStart)
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
  return (
    <div className="relative">
      <button
        type="button"
        aria-pressed={selected}
        data-selected={selected}
        onClick={() => onSelect(entry.event.id)}
        className={cn(
          'w-full rounded-md border border-border bg-card px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          selected && 'ring-2 ring-ring'
        )}
      >
        <div className="truncate text-xs font-medium text-card-foreground">{entry.event.title}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {entry.event.allDay
            ? translate('auto.components.calendar.CalendarWeekGrid.allDay', 'All day')
            : formatClockTime(entry.startAt)}
        </div>
      </button>
      {selected ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="absolute top-1 right-1 text-muted-foreground hover:text-destructive"
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
            entry.kind === 'event' ? (
              <CalendarEventChip
                key={agendaEntryKey(entry)}
                entry={entry}
                selected={selectedEventId === entry.event.id}
                onSelect={onSelectEvent}
                onDelete={onDeleteEvent}
              />
            ) : (
              <CalendarAutomationChip
                key={agendaEntryKey(entry)}
                entry={entry}
                onOpenAutomations={onOpenAutomations}
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
  const today = startOfLocalDay(Date.now())
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
