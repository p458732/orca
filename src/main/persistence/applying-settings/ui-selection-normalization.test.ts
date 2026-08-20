import { describe, expect, it } from 'vitest'
import { normalizeGroupBy } from './ui-selection-normalization'

describe('normalizeGroupBy', () => {
  it('accepts directory grouping', () => {
    expect(normalizeGroupBy('directory')).toBe('directory')
  })

  it('still accepts the existing modes', () => {
    expect(normalizeGroupBy('none')).toBe('none')
    expect(normalizeGroupBy('workspace-status')).toBe('workspace-status')
    expect(normalizeGroupBy('repo')).toBe('repo')
    expect(normalizeGroupBy('pr-status')).toBe('pr-status')
  })

  it('maps the legacy flat value onto none', () => {
    expect(normalizeGroupBy('flat')).toBe('none')
  })

  it('falls back to the default for an unrecognized value', () => {
    expect(normalizeGroupBy('nonsense')).not.toBe('nonsense')
  })
})
