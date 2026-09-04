import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: true, getVersion: () => '1.4.195' } }))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))

const { isPersonalBuild } = await import('./personal-build-identity')
const { getVersionChannel } = await import('../shared/release-channel')

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

  it('is not filed under a published release channel', () => {
    // Why: the picker would otherwise show the user an RC channel they are not on and
    // cannot install from — a personal build is published nowhere.
    expect(getVersionChannel('1.4.195-personal.1756800000000.bc2f593ebb12')).toBeNull()
    expect(getVersionChannel('1.4.195-rc.1.personal.1756800000000.bc2f593ebb12')).toBeNull()
    // Unchanged for everything else, including upstream's own local builds.
    expect(getVersionChannel('1.4.195')).toBe('stable')
    expect(getVersionChannel('1.4.195-rc.3')).toBe('rc')
    expect(getVersionChannel('1.4.195-local.1756800000000.bc2f593ebb12')).toBe('rc')
  })
})
