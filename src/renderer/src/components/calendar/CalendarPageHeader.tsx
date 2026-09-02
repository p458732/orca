import { CalendarDays, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { WeekBounds } from './calendar-week-model'
import { formatWeekRange } from './calendar-date-formatters'

export function CalendarPageHeader({
  bounds,
  onClose,
  onPreviousWeek,
  onNextWeek,
  onThisWeek,
  onAddEvent
}: {
  bounds: WeekBounds
  onClose: () => void
  onPreviousWeek: () => void
  onNextWeek: () => void
  onThisWeek: () => void
  onAddEvent: () => void
}): React.JSX.Element {
  return (
    <header className="shrink-0 border-b border-border">
      <div className="flex w-full items-center gap-2 px-5 py-3 md:px-8">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 rounded-full"
              onClick={onClose}
              aria-label={translate(
                'auto.components.calendar.CalendarPageHeader.close',
                'Close calendar'
              )}
            >
              <X className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.components.calendar.CalendarPageHeader.close', 'Close calendar')}
          </TooltipContent>
        </Tooltip>
        <div className="mx-1 h-5 w-px bg-border/50" aria-hidden />
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">
            {translate('auto.components.calendar.CalendarPageHeader.title', 'Calendar')}
          </h1>
          <div className="truncate text-xs text-muted-foreground">{formatWeekRange(bounds)}</div>
        </div>
        <ButtonGroup>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={onPreviousWeek}
            aria-label={translate(
              'auto.components.calendar.CalendarPageHeader.previousWeek',
              'Previous week'
            )}
          >
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={onThisWeek}>
            {translate('auto.components.calendar.CalendarPageHeader.thisWeek', 'This week')}
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={onNextWeek}
            aria-label={translate(
              'auto.components.calendar.CalendarPageHeader.nextWeek',
              'Next week'
            )}
          >
            <ChevronRight />
          </Button>
        </ButtonGroup>
        <Button type="button" size="sm" onClick={onAddEvent}>
          <Plus className="size-3.5" />
          {translate('auto.components.calendar.CalendarPageHeader.addEvent', 'New event')}
        </Button>
      </div>
    </header>
  )
}
