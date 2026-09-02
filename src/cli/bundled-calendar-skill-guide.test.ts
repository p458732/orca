import { describe, expect, it } from 'vitest'
import { BUNDLED_SKILL_GUIDES } from './bundled-skill-guides'

const guide = BUNDLED_SKILL_GUIDES.find((entry) => entry.name === 'orca-calendar')

function markdown(): string {
  if (!guide) {
    throw new Error('Missing bundled orca-calendar skill guide')
  }
  return guide.markdown
}

// Why finding 5: the guide is what an agent believes about the CLI. Google import
// changed three of its claims, and no lint gate catches a guide describing the
// behaviour of an earlier build.
describe('bundled orca-calendar skill guide matches the shipped calendar CLI', () => {
  it('no longer claims automation runs are the only entries that can be dropped', () => {
    expect(markdown()).not.toContain('only automation runs are')
  })

  it('documents the event source field and the google id prefix', () => {
    const text = markdown()
    expect(text).toContain('source')
    expect(text).toContain("'google'")
    expect(text).toContain('google:')
  })

  it('warns that removing an imported event is rejected, not a silent no-op', () => {
    const text = markdown()
    expect(text).toMatch(/id beginning `google:` is rejected/)
    expect(text).toMatch(/read-only/)
  })

  it('stops describing every agenda event as one the user recorded', () => {
    expect(markdown()).not.toContain('a calendar event the user recorded')
  })

  it('keeps the untrusted-content rule pointed at imported events', () => {
    expect(markdown()).toMatch(/not agent instructions/)
    expect(markdown()).not.toContain('A\nfuture calendar integration may pull events')
  })
})
