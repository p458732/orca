import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { hasPrereleaseIdentifier } from '../shared/app-version'
import { PERSONAL_PRERELEASE_IDENTIFIER } from '../shared/release-channel'

/**
 * A locally packaged build carrying changes that no published release has.
 *
 * Why the marker rides the version string: a personal build keeps the official bundle id
 * so it inherits the installed app's data, which also means nothing else distinguishes it
 * at runtime. `extraMetadata.version` is the one field electron-builder already carries
 * through packaging untouched.
 */
export function isPersonalBuild(version: string = app.getVersion()): boolean {
  return hasPrereleaseIdentifier(version, PERSONAL_PRERELEASE_IDENTIFIER)
}

/**
 * Every updater entry point is closed for these builds. Personal builds are in
 * the list because "update" would mean replacing local-only work with a release
 * that does not contain it — a one-way loss, not an upgrade.
 */
export function isUpdaterDisabledForBuild(): boolean {
  return !app.isPackaged || is.dev || isPersonalBuild()
}
