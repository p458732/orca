import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const CALENDAR_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['calendar', 'agenda'],
    summary: 'List calendar events and upcoming automation runs',
    usage: 'orca calendar agenda [--from <date-or-datetime>] [--to <date-or-datetime>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'from', 'to'],
    notes: [
      'A bare date (YYYY-MM-DD) or a zoneless date-time (YYYY-MM-DDTHH:mm[:ss]) is local time; add Z or an offset (e.g. +08:00) for an exact UTC instant.',
      'The result carries truncated: true when the window held more entries than the agenda can return; personal events are kept ahead of automation runs.'
    ],
    examples: [
      'orca calendar agenda',
      'orca calendar agenda --json',
      'orca calendar agenda --from 2026-01-05 --to 2026-01-12 --json',
      'orca calendar agenda --from 2026-01-05T00:00:00Z --to 2026-01-12T00:00:00Z --json'
    ]
  },
  {
    path: ['calendar', 'add'],
    summary: 'Add a calendar event',
    usage:
      'orca calendar add --title <text> --start <date-or-datetime> [--end <date-or-datetime>] [--all-day] [--notes <text>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'title', 'start', 'end', 'all-day', 'notes'],
    notes: [
      'A bare date (YYYY-MM-DD) or a zoneless date-time (YYYY-MM-DDTHH:mm[:ss]) is local time; add Z or an offset (e.g. +08:00) for an exact UTC instant.',
      '--all-day widens the event to whole local days and treats --end as inclusive, so --start 2026-01-05 --end 2026-01-06 --all-day covers both days.'
    ],
    examples: [
      'orca calendar add --title "Dentist" --start 2026-01-05T09:00:00Z --end 2026-01-05T10:00:00Z',
      'orca calendar add --title "Team offsite" --start 2026-01-05 --end 2026-01-06 --all-day'
    ]
  },
  {
    path: ['calendar', 'remove'],
    aliases: [['calendar', 'rm']],
    destructive: true,
    summary: 'Remove a calendar event',
    usage: 'orca calendar remove <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id'],
    positionalArgs: ['id'],
    examples: ['orca calendar remove 2f9e...']
  }
]
