import {
  buildOAuthLoopbackCallbackPage,
  OAUTH_LOOPBACK_CALLBACK_RESPONSE_HEADERS
} from '../oauth-loopback/oauth-loopback-callback-page'

export const ORCA_CLOUD_CALLBACK_RESPONSE_HEADERS = OAUTH_LOOPBACK_CALLBACK_RESPONSE_HEADERS

export const ORCA_CLOUD_CALLBACK_SUCCESS_PAGE = buildOAuthLoopbackCallbackPage({
  title: 'Signed in to Orca',
  body: 'You can close this tab and return to the app.'
})
