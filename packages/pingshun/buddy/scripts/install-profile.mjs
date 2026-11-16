#!/usr/bin/env node
/**
 * Recreate the local `pingshun` profile and install the Pingshun Buddy bundle.
 *
 * The profile is the recommended isolated deployment: base + web-app + this
 * bundle, fully separate from the user's everyday `web` profile. An existing
 * `pingshun` profile is renamed aside (never deleted), so the operation is
 * reversible; the `web` profile is never touched.
 *
 * Usage: node scripts/install-profile.ts [--home <dir>] [--no-install]
 * `$DSH_HOME` selects the Harness home (default: ~/.dsh).
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROFILE = 'pingshun'

function fail(message) {
  console.error(`install-profile: ${message}`)
  process.exit(1)
}

const args = process.argv.slice(2)
const homeArg = args.includes('--home') ? args[args.indexOf('--home') + 1] : undefined
const noInstall = args.includes('--no-install')
const home = homeArg ?? process.env.DSH_HOME ?? join(homedir(), '.dsh')
const profilesDir = join(home, 'profiles')
const profileDir = join(profilesDir, PROFILE)
const bundleDir = process.env.PINGSHUN_BUNDLE_DIR ?? PACKAGE_DIR

if (!existsSync(join(bundleDir, 'package.json'))) fail(`bundle directory not found: ${bundleDir}`)
if (!existsSync(join(bundleDir, 'lib', 'client.js'))) {
  fail(`bundle is not built; run: pnpm --filter @deepseek-ai/dsh-pingshun-buddy run build`)
}

/** The web template the pingshun profile derives from (shipped web = base + web-app). */
const BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-pingshun-buddy']

mkdirSync(profilesDir, { recursive: true })

// A previous profile is renamed aside with a timestamp suffix — never deleted,
// so a mistaken rebuild is recoverable by renaming it back.
if (existsSync(profileDir)) {
  const backup = `${profileDir}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`
  renameSync(profileDir, backup)
  console.log(`install-profile: previous profile moved to ${backup}`)
}

mkdirSync(join(profileDir, '.plugin-manager'), { recursive: true })
writeFileSync(join(profileDir, 'package.json'), `${JSON.stringify({
  name: `dsh-profile-${PROFILE}`,
  private: true,
  dependencies: {
    '@deepseek-ai/dsh-pingshun-buddy': `link:${bundleDir}`,
  },
  dsh: { profile: { bundles: BUNDLES } },
}, null, 2)}\n`)
writeFileSync(join(profileDir, 'cordis.patch.yml'), [
  '# dsh profile root — an empty entry list. The tree is composed as patches:',
  '# each bundle in package.json\'s dsh.profile.bundles, then cordis.patch.yml, then any',
  '# --patch overlays. Edit cordis.patch.yml, not this file.',
  '[]',
  '',
].join('\n'))
writeFileSync(join(profileDir, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n')

console.log(`install-profile: profile written at ${profileDir}`)

if (noInstall) process.exit(0)

// Link the bundle into the profile's node_modules, matching what the plugin
// manager's pnpm add records for a local directory.
const pnpm = spawnSync('pnpm', ['install'], { cwd: profileDir, stdio: 'inherit' })
if (pnpm.status !== 0) fail(`pnpm install failed in ${profileDir} (exit ${String(pnpm.status)})`)

console.log('install-profile: done. Start with: pnpm dsh --profile pingshun')
