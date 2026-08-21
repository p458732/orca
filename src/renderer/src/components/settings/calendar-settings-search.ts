import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'

export const getCalendarSettingsSearchEntries = createLocalizedCatalog(() => [
  {
    title: translate('auto.components.settings.calendar.showButton', 'Show Calendar Button'),
    description: translate(
      'auto.components.settings.calendar.showButtonSearchDescription',
      'Show the Calendar shortcut in the sidebar.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.calendar.keywordCalendar', 'calendar'),
      ...translateSearchKeyword('auto.components.settings.calendar.keywordSidebar', 'sidebar'),
      ...translateSearchKeyword('auto.components.settings.calendar.keywordEvents', 'events')
    ]
  },
  {
    title: translate('auto.components.settings.calendar.connect', 'Connect Google Calendar'),
    description: translate(
      'auto.components.settings.calendar.connectSearchDescription',
      'Connect a Google account, choose which calendars to import, and sync them.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.calendar.keywordGoogle', 'google'),
      ...translateSearchKeyword('auto.components.settings.calendar.keywordCalendar', 'calendar'),
      ...translateSearchKeyword('auto.components.settings.calendar.keywordSync', 'sync'),
      ...translateSearchKeyword('auto.components.settings.calendar.keywordImport', 'import'),
      ...translateSearchKeyword('auto.components.settings.calendar.keywordOauth', 'oauth')
    ]
  }
])
