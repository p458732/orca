import { describe, expect, it } from 'vitest'
import { BUNDLED_SKILL_GUIDES } from './bundled-skill-guides'

const guide = BUNDLED_SKILL_GUIDES.find((entry) => entry.name === 'orca-calendar')

function markdown(): string {
  if (!guide) {
    throw new Error('Missing bundled orca-calendar skill guide')
  }
  return guide.markdown
}

// Why: the guide is what an agent believes about the CLI, and no lint gate
// catches one still describing an integration this build no longer ships.
describe('bundled orca-calendar skill guide matches the shipped calendar CLI', () => {
  it('describes no external calendar import', () => {
    const text = markdown()
    expect(text).not.toMatch(/google/i)
    expect(text).not.toMatch(/imported/i)
  })

  it('documents the agenda, add and remove commands', () => {
    const text = markdown()
    expect(text).toContain('calendar agenda')
    expect(text).toContain('calendar add')
    expect(text).toContain('calendar remove')
  })

  it('keeps the untrusted-content rule', () => {
    expect(markdown()).toMatch(/not agent instructions/)
  })
})
