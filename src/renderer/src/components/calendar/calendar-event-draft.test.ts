import { describe, expect, it } from 'vitest'
import {
  buildCalendarEventDraft,
  parseDateTimeLocalValue,
  toDateTimeLocalValue,
  validateCalendarEventDraftFields
} from './calendar-event-draft'

describe('calendar event draft', () => {
  it('round-trips a local wall-clock value', () => {
    const local = new Date(2026, 7, 19, 9, 30).getTime()
    expect(toDateTimeLocalValue(local)).toBe('2026-08-19T09:30')
    expect(parseDateTimeLocalValue('2026-08-19T09:30')).toBe(local)
  })

  it('rejects an unparseable datetime value', () => {
    expect(parseDateTimeLocalValue('')).toBeNull()
    expect(parseDateTimeLocalValue('2026-08-19')).toBeNull()
    expect(parseDateTimeLocalValue('not-a-date')).toBeNull()
  })

  it('reports a blank title', () => {
    expect(
      validateCalendarEventDraftFields({
        title: '   ',
        start: '2026-08-19T09:00',
        end: '2026-08-19T10:00'
      })
    ).toBe('title-required')
  })

  it('reports an end before its start', () => {
    expect(
      validateCalendarEventDraftFields({
        title: 'Dentist',
        start: '2026-08-19T10:00',
        end: '2026-08-19T09:00'
      })
    ).toBe('end-before-start')
  })

  it('reports an unusable time value', () => {
    expect(
      validateCalendarEventDraftFields({ title: 'Dentist', start: '', end: '2026-08-19T09:00' })
    ).toBe('time-required')
  })

  it('accepts an end equal to its start', () => {
    expect(
      validateCalendarEventDraftFields({
        title: 'Dentist',
        start: '2026-08-19T09:00',
        end: '2026-08-19T09:00'
      })
    ).toBeNull()
  })

  it('builds a trimmed timed draft with notes', () => {
    expect(
      buildCalendarEventDraft({
        title: '  Dentist  ',
        start: '2026-08-19T09:00',
        end: '2026-08-19T10:00',
        allDay: false,
        notes: '  bring x-rays  '
      })
    ).toEqual({
      title: 'Dentist',
      startAt: new Date(2026, 7, 19, 9, 0).getTime(),
      endAt: new Date(2026, 7, 19, 10, 0).getTime(),
      allDay: false,
      notes: 'bring x-rays'
    })
  })

  it('drops blank notes to null', () => {
    const draft = buildCalendarEventDraft({
      title: 'Dentist',
      start: '2026-08-19T09:00',
      end: '2026-08-19T10:00',
      allDay: false,
      notes: '   '
    })
    expect(draft?.notes).toBeNull()
  })

  // Why: all-day widening moved to the host so the CLI and the UI agree; the
  // draft must forward the picked wall-clock values untouched.
  it('forwards an all-day draft unwidened for the host to normalize', () => {
    const draft = buildCalendarEventDraft({
      title: 'Offsite',
      start: '2026-08-19T09:00',
      end: '2026-08-20T14:00',
      allDay: true,
      notes: ''
    })
    expect(draft).toEqual({
      title: 'Offsite',
      startAt: new Date(2026, 7, 19, 9, 0).getTime(),
      endAt: new Date(2026, 7, 20, 14, 0).getTime(),
      allDay: true,
      notes: null
    })
  })

  it('still rejects an all-day range whose end precedes its start', () => {
    expect(
      validateCalendarEventDraftFields({
        title: 'Offsite',
        start: '2026-08-20T09:00',
        end: '2026-08-19T09:00'
      })
    ).toBe('end-before-start')
  })

  it('returns null when the fields do not validate', () => {
    expect(
      buildCalendarEventDraft({ title: '', start: '', end: '', allDay: false, notes: '' })
    ).toBeNull()
  })
})
