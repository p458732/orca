import { describe, expect, it } from 'vitest'
import { isTopLevelView } from './top-level-view'

describe('isTopLevelView', () => {
  it('accepts calendar', () => {
    expect(isTopLevelView('calendar')).toBe(true)
  })

  it('still accepts existing views', () => {
    expect(isTopLevelView('automations')).toBe(true)
    expect(isTopLevelView('terminal')).toBe(true)
  })

  it('rejects unknown values and inherited keys', () => {
    expect(isTopLevelView('nope')).toBe(false)
    expect(isTopLevelView('constructor')).toBe(false)
  })
})
