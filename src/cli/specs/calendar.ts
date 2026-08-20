import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const CALENDAR_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['calendar', 'agenda'],
    summary: 'List calendar events and upcoming automation runs',
    usage: 'orca calendar agenda [--from <iso>] [--to <iso>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'from', 'to'],
    examples: [
      'orca calendar agenda',
      'orca calendar agenda --json',
      'orca calendar agenda --from 2026-01-05T00:00:00Z --to 2026-01-12T00:00:00Z --json'
    ]
  },
  {
    path: ['calendar', 'add'],
    summary: 'Add a calendar event',
    usage:
      'orca calendar add --title <text> --start <iso> [--end <iso>] [--all-day] [--notes <text>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'title', 'start', 'end', 'all-day', 'notes'],
    examples: [
      'orca calendar add --title "Dentist" --start 2026-01-05T09:00:00Z --end 2026-01-05T10:00:00Z'
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
