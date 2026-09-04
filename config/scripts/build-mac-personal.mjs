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

// Why the arch flags are pulled out rather than forwarded: the mac targets pin `arch` in
// the config, and a config-pinned list wins over electron-builder's `--arm64`, so the flag
// was silently ignored and every local build produced both slices. The config reads this
// env var instead.
const ARCH_FLAGS = new Set(['--arm64', '--x64', '--universal'])
const forwardedArgs = process.argv.slice(2).filter((arg) => arg !== '--')
const requestedArchs = forwardedArgs.filter((arg) => ARCH_FLAGS.has(arg)).map((arg) => arg.slice(2))

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
    // Passthrough for electron-builder's own flags. The bare `--` is dropped because
    // `pnpm run` forwards the separator itself, and electron-builder stops parsing
    // options when it sees one.
    ...forwardedArgs.filter((arg) => !ARCH_FLAGS.has(arg))
  ],
  {
    env: {
      ...process.env,
      ORCA_BUILD_COMMIT: identity.commit,
      ORCA_LOCAL_BUILD_VERSION: identity.version,
      ...(requestedArchs.length > 0 ? { ORCA_MAC_ARCHS: requestedArchs.join(',') } : {}),
      ...(skipComputerUse ? { ORCA_SKIP_COMPUTER_USE_HELPER: '1' } : {})
    },
    stdio: 'inherit'
  }
)
