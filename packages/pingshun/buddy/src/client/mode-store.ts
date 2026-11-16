/**
 * Buddy ↔ DeepSeek UI mode store.
 *
 * One module-level observable shared by every Buddy surface. The per-tab
 * preference persists in `sessionStorage`; on top of that, `bindSettings`
 * connects the store to the Host's persisted `buddyMode` setting, so a switch
 * also drives the runtime plugin to register/unregister the business presets
 * (DeepSeek mode genuinely removes them from the Host roster). The Host
 * setting is authoritative on first load: `bindSettings` seeds the store from
 * the persisted value when present.
 *
 * @module
 */

/** Which surface the tab shows: the Buddy workbench or the native DSH UI. */
export type BuddyMode = 'buddy' | 'dsh'

const STORAGE_KEY = 'pingshun.buddy.mode'

let current: BuddyMode = readStored()
const listeners = new Set<() => void>()
let remoteWrite: ((mode: BuddyMode) => void) | undefined
let onSwitch: (() => void) | undefined

function readStored(): BuddyMode {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === 'dsh' ? 'dsh' : 'buddy'
  } catch {
    return 'buddy'
  }
}

function persist(mode: BuddyMode): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Persistence is best-effort; the in-memory mode still applies to this tab.
  }
}

/** Framework store shape for `useSyncExternalStore`. */
export const modeStore = {
  getSnapshot(): BuddyMode {
    return current
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
  /** Switch the surface; also drives the Host preset registration when bound. */
  setMode(mode: BuddyMode): void {
    if (current === mode) return
    current = mode
    persist(mode)
    for (const listener of listeners) listener()
    remoteWrite?.(mode)
    onSwitch?.()
  },
  /**
   * Connect the store to the Host `buddyMode` setting.
   * @param settings.write - persist a switch into the Host setting.
   * @param settings.initial - the persisted mode, when the Host has one; seeds the store.
   * @param settings.onSwitch - run after a switch (e.g. refresh native preset pickers).
   */
  bindSettings(settings: { write: (mode: BuddyMode) => void; initial?: BuddyMode; onSwitch?: () => void }): void {
    remoteWrite = settings.write
    onSwitch = settings.onSwitch
    if (settings.initial !== undefined && settings.initial !== current) {
      current = settings.initial
      persist(current)
      for (const listener of listeners) listener()
    }
  },
}
