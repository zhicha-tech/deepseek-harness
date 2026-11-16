/**
 * Bundle-local `.env` loading: reads `packages/pingshun/buddy/.env` (or the
 * installed package root's `.env`) at runtime startup and exposes the values
 * to the process environment without overwriting variables the launch
 * environment already provides.
 *
 * Precedence (highest first): Settings UI values → system environment →
 * the bundle `.env` file. The file is a deployment artifact: it is gitignored
 * and must be placed next to the package's package.json at install time.
 *
 * @module
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Plain process-env access (the client base config narrows process.env). */
const env = process.env as Record<string, string | undefined>

/** Parse one `.env` line: KEY=VALUE with optional quotes, `#` comments. */
function parseLine(line: string): { key: string; value: string } | undefined {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed.startsWith('#')) return undefined
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed)
  if (match === null) return undefined
  const key = match[1] as string
  let value = (match[2] as string).trim()
  // Strip one pair of surrounding quotes and any trailing inline comment
  // only when unquoted.
  const quoted = /^(['"])(.*)\1$/.exec(value)
  if (quoted !== null) value = quoted[2] as string
  else value = value.replace(/\s+#.*$/, '').trim()
  return { key, value }
}

/**
 * Load the bundle's `.env` into process.env (system environment wins).
 * @returns the parsed key/value pairs for the runtime's fallback chain.
 */
export function loadBundleEnv(): Record<string, string> {
  const values: Record<string, string> = {}
  // lib/host/env-file.js → package root is two levels up; src/host likewise.
  const envPath = fileURLToPath(new URL('../../.env', import.meta.url))
  let text: string
  try {
    text = readFileSync(envPath, 'utf8')
  } catch {
    // No bundle .env is a valid posture (settings or system env only).
    return values
  }
  for (const line of text.split('\n')) {
    const parsed = parseLine(line)
    if (parsed === undefined) continue
    values[parsed.key] = parsed.value
    if (env[parsed.key] === undefined) env[parsed.key] = parsed.value
  }
  return values
}
