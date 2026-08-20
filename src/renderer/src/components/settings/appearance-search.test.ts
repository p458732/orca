import { afterEach, describe, expect, it } from 'vitest'

import { i18n } from '@/i18n/i18n'
import { getLanguageEntries, getSidebarEntries } from './appearance-search'
import { matchesSettingsSearch } from './settings-search'

// Native word for "language" in each supported UI language. These must be
// findable no matter which locale the interface is currently rendered in, so a
// speaker can locate (and switch to) their language from any starting point.
const NATIVE_LANGUAGE_WORDS = ['语言', '語言', '언어', '言語', 'Idioma']

describe('getLanguageEntries', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en')
  })

  it.each(['en', 'zh', 'ko', 'ja', 'es'])(
    'indexes every native word for "language" under the %s UI locale',
    async (locale) => {
      await i18n.changeLanguage(locale)
      const entry = getLanguageEntries()[0]
      for (const word of NATIVE_LANGUAGE_WORDS) {
        expect(matchesSettingsSearch(word, entry)).toBe(true)
      }
    }
  )

  it('matches the Spanish native language name in English UI', async () => {
    await i18n.changeLanguage('en')
    expect(matchesSettingsSearch('Español', getLanguageEntries()[0])).toBe(true)
  })
})

// AppearanceWindowSidebarSection looks these up positionally (sidebarEntries[n]),
// so inserting one out of order silently mislabels a neighbouring switch.
describe('getSidebarEntries order', () => {
  it('matches the switch order rendered by the sidebar appearance section', () => {
    expect(
      getSidebarEntries()
        .slice(0, 4)
        .map((entry) => entry.title)
    ).toEqual([
      'Show Tasks Button',
      'Show Automations Button',
      'Show Calendar Button',
      'Show Orca Mobile Button'
    ])
  })
})
