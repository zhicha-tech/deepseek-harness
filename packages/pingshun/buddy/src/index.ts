/**
 * Pingshun Buddy package entry (Host companion for the browser roster).
 *
 * The bundle's `pingshun-ui` Loader row names this package so the modules node
 * half picks up its `dsh.client` declaration and serves the client half. The
 * Host-side behavior lives in `@deepseek-ai/dsh-pingshun-buddy/runtime`; this companion only
 * re-exports the preset catalog and presentation metadata for programmatic
 * consumers.
 *
 * @module @deepseek-ai/dsh-pingshun-buddy
 */

/** Stable Cordis plugin name. */
export const name = 'pingshun-buddy'

/** Host companion for the browser Buddy plugin; no Host registrations. */
export function apply(): void {}

export { PINGSHUN_PRESETS } from './host/presets.ts'
export { BUDDY_CATALOG, type BuddyCatalogEntry } from './shared/catalog.ts'
