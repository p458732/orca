import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: true, getVersion: () => '1.4.195' } }))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))

const { isPersonalBuild } = await import('./personal-build-identity')

describe('isPersonalBuild', () => {
  it('recognises the version stamp the personal packaging script writes', () => {
    expect(isPersonalBuild('1.4.195-personal.1756800000000.bc2f593ebb12')).toBe(true)
  })

  it('leaves release and local builds alone', () => {
    expect(isPersonalBuild('1.4.195')).toBe(false)
    expect(isPersonalBuild('1.4.195-rc.3')).toBe(false)
    expect(isPersonalBuild('1.4.195-local.1756800000000.bc2f593ebb12')).toBe(false)
  })

  it('finds the channel when stamped onto a prerelease base', () => {
    expect(isPersonalBuild('1.4.195-rc.1.personal.1756800000000.bc2f593ebb12')).toBe(true)
  })

  it('does not match a version that merely contains the word', () => {
    expect(isPersonalBuild('1.4.195-personalized')).toBe(false)
    expect(isPersonalBuild('1.4.195+personal.1')).toBe(false)
  })

  it('rejects anything that is not a version', () => {
    expect(isPersonalBuild('not-a-version-personal.1')).toBe(false)
    expect(isPersonalBuild('')).toBe(false)
  })
})
