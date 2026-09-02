import React, { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { calendarRequestErrorMessage, createCalendarEvent } from './calendar-host-client'
import {
  buildCalendarEventDraft,
  toDateTimeLocalValue,
  validateCalendarEventDraftFields,
  type CalendarEventDraftError
} from './calendar-event-draft'

const HOUR_MS = 60 * 60 * 1000

function draftErrorMessage(error: CalendarEventDraftError): string {
  if (error === 'title-required') {
    return translate(
      'auto.components.calendar.CalendarAddEventDialog.titleRequired',
      'Add a title.'
    )
  }
  if (error === 'time-required') {
    return translate(
      'auto.components.calendar.CalendarAddEventDialog.timeRequired',
      'Pick a start and an end.'
    )
  }
  return translate(
    'auto.components.calendar.CalendarAddEventDialog.endBeforeStart',
    'The end must not precede the start.'
  )
}

export function CalendarAddEventDialog({
  open,
  defaultStartAt,
  onOpenChange,
  onCreated
}: {
  open: boolean
  defaultStartAt: number
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [invalidField, setInvalidField] = useState<CalendarEventDraftError | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }
    setTitle('')
    setNotes('')
    setAllDay(false)
    setError(null)
    setInvalidField(null)
    setSaving(false)
    setStart(toDateTimeLocalValue(defaultStartAt))
    setEnd(toDateTimeLocalValue(defaultStartAt + HOUR_MS))
  }, [defaultStartAt, open])

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    const fields = { title, start, end }
    const invalid = validateCalendarEventDraftFields(fields)
    if (invalid) {
      setInvalidField(invalid)
      setError(draftErrorMessage(invalid))
      return
    }
    const draft = buildCalendarEventDraft({ ...fields, allDay, notes })
    if (!draft) {
      return
    }
    setInvalidField(null)
    setSaving(true)
    try {
      await createCalendarEvent(draft)
      onCreated()
      onOpenChange(false)
    } catch (cause) {
      setError(
        calendarRequestErrorMessage(
          cause,
          translate(
            'auto.components.calendar.CalendarAddEventDialog.createFailed',
            'Could not save the event.'
          )
        )
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {translate('auto.components.calendar.CalendarAddEventDialog.title', 'New event')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {translate(
              'auto.components.calendar.CalendarAddEventDialog.description',
              'Events live on this computer and show up beside your scheduled automations.'
            )}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(event) => void submit(event)}>
          <div className="space-y-1">
            <Label htmlFor="calendar-event-title">
              {translate('auto.components.calendar.CalendarAddEventDialog.titleLabel', 'Title')}
            </Label>
            <Input
              id="calendar-event-title"
              autoFocus
              value={title}
              aria-invalid={invalidField === 'title-required'}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={translate(
                'auto.components.calendar.CalendarAddEventDialog.titlePlaceholder',
                'Dentist'
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="calendar-event-start">
                {translate('auto.components.calendar.CalendarAddEventDialog.startLabel', 'Start')}
              </Label>
              <Input
                id="calendar-event-start"
                type="datetime-local"
                value={start}
                aria-invalid={invalidField === 'time-required'}
                onChange={(event) => setStart(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="calendar-event-end">
                {translate('auto.components.calendar.CalendarAddEventDialog.endLabel', 'End')}
              </Label>
              <Input
                id="calendar-event-end"
                type="datetime-local"
                value={end}
                aria-invalid={
                  invalidField === 'end-before-start' || invalidField === 'time-required'
                }
                onChange={(event) => setEnd(event.target.value)}
              />
            </div>
          </div>
          <Label htmlFor="calendar-event-all-day" className="text-xs font-normal">
            <Checkbox
              id="calendar-event-all-day"
              checked={allDay}
              onCheckedChange={(checked) => setAllDay(checked === true)}
            />
            {translate('auto.components.calendar.CalendarAddEventDialog.allDayLabel', 'All day')}
          </Label>
          <div className="space-y-1">
            <Label htmlFor="calendar-event-notes">
              {translate(
                'auto.components.calendar.CalendarAddEventDialog.notesLabel',
                'Notes (optional)'
              )}
            </Label>
            <Textarea
              id="calendar-event-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="min-h-20 text-xs"
            />
          </div>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {translate('auto.components.calendar.CalendarAddEventDialog.cancel', 'Cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={saving} className="w-24">
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                translate('auto.components.calendar.CalendarAddEventDialog.submit', 'Add event')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
