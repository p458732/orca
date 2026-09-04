import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { getLocalBuildIdentity } from './build-mac-local.mjs'

/**
 * Packages the working tree as a personal macOS build: the official bundle id and app
 * name, so it inherits the installed app's data, but a version stamped with the
 * `personal` channel which `isPersonalBuild()` reads to keep the updater shut. Without
 * that stamp the build would offer to "update" to a release that does not contain the
 * local-only work.
 */
const COMPUTER_USE_HELPER = 'native/computer-use-macos/.build/release/Orca Computer Use.app'

// The helper needs Swift Package Manager, which needs a full Xcode. Rather than refusing
// to package on a Command Line Tools machine, drop it and say so, loudly: the resulting
// build works except for computer use.
const skipComputerUse = !existsSync(resolve(COMPUTER_USE_HELPER))
if (skipComputerUse) {
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
}

const identity = getLocalBuildIdentity('personal')
console.log(`[build:mac:personal] version ${identity.version} (updater disabled)`)
execFileSync(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  [
    'exec',
    'electron-builder',
    '--config',
    'config/electron-builder.config.cjs',
    '--mac',
    // Passthrough so a single-arch build (`-- --arm64`) does not need its own script. The
    // bare `--` is dropped because `pnpm run` forwards the separator itself, and
    // electron-builder stops parsing options when it sees one.
    ...process.argv.slice(2).filter((arg) => arg !== '--')
  ],
  {
    env: {
      ...process.env,
      ORCA_BUILD_COMMIT: identity.commit,
      ORCA_LOCAL_BUILD_VERSION: identity.version,
      ...(skipComputerUse ? { ORCA_SKIP_COMPUTER_USE_HELPER: '1' } : {})
    },
    stdio: 'inherit'
  }
)
