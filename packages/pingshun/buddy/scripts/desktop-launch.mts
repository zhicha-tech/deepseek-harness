/**
 * Pingshun Buddy: Linux dev-launch workaround for the Desktop shell.
 *
 * The official `start:desktop` launcher only supports mac-arm64/mac-x64/win-x64
 * (`SUPPORTED_TARGETS` in apps/desktop/scripts/desktop-build-paths.mjs rejects
 * linux-x64). This script replicates the official launcher's preparation steps
 * with the packaging target forced to win-x64 (used only for path checks), then
 * launches the real Linux Electron binary directly.
 *
 * Prerequisites (already satisfied in this repo):
 * - `apps/desktop/lib/main.js` built (`pnpm --filter @deepseek-ai/dsh-desktop run bundle`)
 * - Electron binary installed (`pnpm --filter @deepseek-ai/dsh-desktop exec install-electron`)
 * - The external plugin profile at apps/desktop/.desktop-build/development/home/profiles/desktop
 *   carries the @deepseek-ai/dsh-pingshun-buddy bundle (installed once; survives project rebuilds).
 *
 * Usage (from the repository root):
 *   pnpm exec tsx packages/pingshun/buddy/scripts/desktop-launch.mts
 *
 * Debug ports: main=9229, renderer(CDP)=9222, host=9230.
 */
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// packages/pingshun/buddy/scripts/this file → repo root is three levels up.
const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..', '..', '..', '..')
const appRoot = join(repoRoot, 'apps', 'desktop')
const developmentRoot = join(appRoot, '.desktop-build', 'development')

const require = createRequire(join(appRoot, 'package.json'))
// scripts/ sources are plain TS, loaded through tsx (same as the dev launcher).
const { prepareDevelopmentProject } = await import(
  join(appRoot, 'scripts', 'development-project.ts')
) as { prepareDevelopmentProject: (options: Record<string, unknown>) => string }

const version = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8')).version as string
const hostProtocolSource = readFileSync(join(appRoot, 'src', 'host-protocol.ts'), 'utf8')
const hostProtocolVersion = Number(/DESKTOP_HOST_PROTOCOL_VERSION = (\d+)/.exec(hostProtocolSource)?.[1] ?? '4')
const pnpmVersion = JSON.parse(readFileSync(join(appRoot, 'node_modules', 'pnpm', 'package.json'), 'utf8')).version as string
const electronPath = require('electron') as string
const nodeVersion = (await new Promise<string>((resolvePromise) => {
  const child = spawn(electronPath, ['-p', 'process.versions.node'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString() })
  child.on('close', () => { resolvePromise(output.trim()) })
}))

const release = { schemaVersion: 1, version, hostProtocolVersion, nodeVersion, pnpmVersion }

const prepared = prepareDevelopmentProject({
  projectDir: join(developmentRoot, 'project'),
  cliDir: join(repoRoot, 'apps', 'cli'),
  hostDir: join(repoRoot, 'apps', 'desktop-host'),
  dependencyDir: join(repoRoot, 'node_modules', '.pnpm', 'node_modules'),
  release,
  target: 'win-x64',
})
console.log('prepared project:', prepared)

// The disposable runtime project rebuilt above only carries official packages;
// re-add the @deepseek-ai/dsh-pingshun-buddy link and bundle entry it wiped, without running
// pnpm install (the link target is the workspace package itself).
const projectPackageJson = join(prepared, 'package.json')
const manifest = JSON.parse(readFileSync(projectPackageJson, 'utf8')) as {
  dependencies: Record<string, string>
  dsh: { profile: { bundles: string[] } }
}
manifest.dependencies['@deepseek-ai/dsh-pingshun-buddy'] = 'link:' + join(repoRoot, 'packages', 'pingshun', 'buddy')
if (!manifest.dsh.profile.bundles.includes('@deepseek-ai/dsh-pingshun-buddy')) manifest.dsh.profile.bundles.push('@deepseek-ai/dsh-pingshun-buddy')
writeFileSync(projectPackageJson, JSON.stringify(manifest, null, 2))
mkdirSync(join(prepared, 'node_modules', '@pingshun'), { recursive: true })
try { symlinkSync(join(repoRoot, 'packages', 'pingshun', 'buddy'), join(prepared, 'node_modules', '@pingshun', 'buddy'), 'dir') } catch { /* exists */ }

const home = join(developmentRoot, 'home')
const userData = join(developmentRoot, 'electron-user-data')
const primaryRuntime = join(appRoot, '.desktop-build', 'win-x64', 'runtime', 'primary-runtime')

const child = spawn(electronPath, [
  '--inspect=127.0.0.1:9229',
  '--remote-debugging-port=9222',
  `--user-data-dir=${userData}`,
  appRoot,
], {
  cwd: appRoot,
  env: {
    ...process.env,
    DSH_HOME: home,
    DSH_DESKTOP_PRIMARY_RUNTIME_DIR: primaryRuntime,
    DSH_DESKTOP_HOST_INSPECT_PORT: '9230',
    DSH_DESKTOP_OPEN_DEVTOOLS: '0',
    ELECTRON_ENABLE_LOGGING: '1',
  },
  stdio: 'inherit',
})
child.on('close', (code) => { process.exitCode = code ?? 0 })
