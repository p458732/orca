import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Packages the working tree as a personal macOS build: the official bundle id and
 * app name, so it inherits the installed app's data, but a version marked
 * `-personal.` which `isPersonalBuild()` reads to keep the updater shut. Without
 * that marker the build would offer to "update" to a release that does not
 * contain the local-only work.
 */
const PERSONAL_CHANNEL = 'personal'

export function createPersonalBuildVersion(baseVersion, timestamp, commit) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(baseVersion)) {
    throw new Error(`Package version is not valid semver: ${baseVersion}`)
  }
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new Error('Personal build timestamp is invalid.')
  }
  const sanitizedCommit = commit.replace(/[^0-9A-Za-z-]/g, '').slice(0, 12)
  if (!sanitizedCommit) {
    throw new Error('Git commit identity is empty.')
  }
  const suffix = `${PERSONAL_CHANNEL}.${timestamp}.${sanitizedCommit}`
  return baseVersion.includes('-') ? `${baseVersion}.${suffix}` : `${baseVersion}-${suffix}`
}

export function getPersonalBuildIdentity() {
  const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
  const commit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
    encoding: 'utf8'
  }).trim()
  return {
    commit,
    version: createPersonalBuildVersion(packageJson.version, Date.now(), commit)
  }
}

const COMPUTER_USE_HELPER = 'native/computer-use-macos/.build/release/Orca Computer Use.app'

/**
 * The helper needs Swift Package Manager, which needs a full Xcode — Command Line
 * Tools cannot resolve the platform SDK path. Rather than refusing to package, drop
 * it and say so, loudly: the resulting build works except for computer use.
 */
function resolveComputerUseHelper() {
  if (existsSync(resolve(COMPUTER_USE_HELPER))) {
    return { skip: false }
  }
  console.warn(
    [
      '',
      '  ⚠  Computer-use helper not built — packaging without it.',
      '     Computer use will be unavailable in this build. To include it:',
      '       1. install Xcode, then: sudo xcode-select -s /Applications/Xcode.app',
      '       2. pnpm run build:computer-macos',
      '       3. re-run this command',
      ''
    ].join('\n')
  )
  return { skip: true }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const identity = getPersonalBuildIdentity()
  const { skip } = resolveComputerUseHelper()
  console.log(`[build:mac:personal] version ${identity.version} (updater disabled)`)
  execFileSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    [
      'exec',
      'electron-builder',
      '--config',
      'config/electron-builder.config.cjs',
      '--mac',
      // Passthrough so a single-arch build (`-- --arm64`) does not need its own script.
      ...process.argv.slice(2)
    ],
    {
      env: {
        ...process.env,
        ORCA_BUILD_COMMIT: identity.commit,
        ORCA_LOCAL_BUILD_VERSION: identity.version,
        ...(skip ? { ORCA_SKIP_COMPUTER_USE_HELPER: '1' } : {})
      },
      stdio: 'inherit'
    }
  )
}
