import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { UiUpdate } from './client-ui-schemas'
import { omitUndefinedValues, tolerateUnknownValues } from './ui-update-value-tolerance'

describe('UiUpdate groupBy', () => {
  it('parses the current directory value alongside its siblings', () => {
    const parsed = UiUpdate.parse({ groupBy: 'directory', sidebarWidth: 320 })

    expect(parsed.groupBy).toBe('directory')
    expect(parsed.sidebarWidth).toBe(320)
  })
})

// Simulates a host running a build from before 'directory' was added to
// UiUpdateFields.groupBy (client-ui-schemas.ts:194) — same shape, same
// tolerateUnknownValues/omitUndefinedValues wrapping (ui-update-value-tolerance.ts),
// one enum member short. Pins the wire contract from the design spec's Tests
// section: an unrecognized groupBy value degrades to "absent", not a whole-payload
// rejection, and it alone is dropped — every sibling field still lands.
const PreDirectoryUiUpdateFields = z
  .object({
    groupBy: z.enum(['none', 'workspace-status', 'repo', 'pr-status']).optional(),
    sidebarWidth: z.number().finite().optional()
  })
  .strict()

const PreDirectoryUiUpdate = z
  .object(tolerateUnknownValues(PreDirectoryUiUpdateFields.shape))
  .strict()
  .default({})
  .transform(omitUndefinedValues)

describe('UiUpdate groupBy wire tolerance for a host that predates directory', () => {
  it('drops only groupBy, preserving sibling fields in the same payload', () => {
    const parsed = PreDirectoryUiUpdate.parse({ groupBy: 'directory', sidebarWidth: 320 })

    expect(parsed).not.toHaveProperty('groupBy')
    expect(parsed.sidebarWidth).toBe(320)
  })
})
