/**
 * Buddy surface manager: installs and removes the mode-driven registrations.
 *
 * Buddy mode takes over two framework seats without replacing their owners:
 *
 * - `sidebar.workspaces` (a `single` slot) is shadowed by a lower-priority
 *   registration; disposing ours makes the native workspace browser render
 *   again. No native registration is touched.
 * - `conversation.session.header.utilities` (a `list` slot) gains the
 *   tool-drawer entry.
 *
 * `enter` installs both and remembers the disposers; `exit` runs them in
 * reverse. Re-entering after exit re-registers cleanly, and an install that
 * throws unwinds the partial install so a failed takeover degrades to the
 * native UI instead of a half-mounted shell.
 *
 * @module
 */
import type { Context } from '@deepseek-ai/cordis'
import type { AgentPresetRow } from '@deepseek-ai/dsh-agent-preset-registry/types'
import type { AgentPresetPluginGroup, PluginInventoryEntry } from '@deepseek-ai/dsh-host-plugin-inventory'
import type { UiWorkspace } from '@deepseek-ai/dsh-client-ui-workspace/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { BuddyPanel, type BuddyPanelInjected } from './buddy-panel.tsx'
import { NS } from './index.ts'
import { ToolsButtonSlot, type ToolDrawerInjected } from './tools-button.tsx'
import { OcrSection } from './ocr-section.tsx'
import { SettingsOnlyLauncher } from './settings-launcher.tsx'
import { ModelChipReadonly } from './model-chip-readonly.tsx'
import { ModelSectionReadonly } from './model-section-readonly.tsx'
import type { OcrSettingsAccess } from './settings-panel.tsx'

/** Empty settings.action occupant: hides the native open-document button. */
function EmptySettingsAction() { return null }

/** Lowest priority wins the `single` shadow; the native occupant stays at 0. */
const SHADOW_PRIORITY = -10

/** The plugin-inventory answer shape the drawer reads. */
interface InventoryAnswer {
  readonly entries: readonly PluginInventoryEntry[]
  readonly agentPresets?: readonly AgentPresetPluginGroup[] | undefined
}

/** Services and remotes the Buddy surfaces read. */
export interface SurfaceServices {
  /** Shared session navigation. */
  readonly uiWorkspace: UiWorkspace
  /** Read the agent-preset roster from the Host. */
  readonly listRoster: () => Promise<readonly AgentPresetRow[]>
  /** Read the plugin inventory snapshot from the Host. */
  readonly listInventory: () => Promise<InventoryAnswer>
  /** OCR token settings access (presence read + save). */
  readonly ocrSettings: OcrSettingsAccess
  /** Read the built-in provider summary and the default model. */
  readonly readModelInfo: () => Promise<{
    provider: { displayName: string; baseUrl: string; models: readonly string[] }
    defaultModel: string
  }>
}

/** One mode-driven surface pair with idempotent enter/exit. */
export interface BuddySurfaces {
  /** Install the Buddy registrations; a no-op while already installed. */
  enter(): void
  /** Remove the Buddy registrations in reverse order; a no-op while absent. */
  exit(): void
  /** Observable roster of agent presets, refreshed by {@link SurfaceServices.listRoster}. */
  readonly roster: SnapshotStore<ReadonlyMap<string, AgentPresetRow>>
  /** Pull the roster once; surfaces read the store, never the wire, for renders. */
  refreshRoster(): void
}

/** Create the mode-driven surface pair for one client context. */
export function createBuddySurfaces(ctx: Context, services: SurfaceServices): BuddySurfaces {
  const roster = createSnapshotStore<ReadonlyMap<string, AgentPresetRow>>(new Map())
  let disposers: readonly (() => void)[] = []
  let rosterTimer: ReturnType<typeof setTimeout> | undefined

  const refreshRoster = (): void => {
    services.listRoster().then((rows) => {
      roster.set(new Map(rows.map(row => [row.id, row])))
    }).catch((reason: unknown) => {
      console.warn('pingshun-buddy: agent preset roster read failed:', reason)
    })
  }

  const enter = (): void => {
    if (disposers.length > 0) return
    refreshRoster()
    // The Host re-registers the presets asynchronously after the buddyMode
    // write; re-read shortly after so the panel reflects the Buddy roster
    // rather than the just-uninstalled DeepSeek one.
    rosterTimer = setTimeout(refreshRoster, 1500)
    const installed: (() => void)[] = []
    const panelInjected = (): BuddyPanelInjected => ({
      hooks: { roster },
      uiWorkspace: services.uiWorkspace,
      refreshRoster,
      ocrSettings: services.ocrSettings,
    })
    const drawerInjected = (): ToolDrawerInjected => ({
      listInventory: services.listInventory,
    })
    const targets = [
      {
        slot: 'sidebar.workspaces',
        register: () => ctx.slots.register({
          name: 'sidebar.workspaces',
          // `single` slots carry no id; the priority below shadows the native
          // occupant and this entry leaves cleanly on exit.
          priority: SHADOW_PRIORITY,
          locale: NS,
          inject: panelInjected,
        }, BuddyPanel),
      },
      {
        slot: 'conversation.session.header.utilities',
        register: () => ctx.slots.register({
          name: 'conversation.session.header.utilities',
          id: 'pingshun-buddy-tools',
          order: 500,
          locale: NS,
          inject: drawerInjected,
        }, ToolsButtonSlot),
      },
      {
        slot: 'settings.section',
        register: () => ctx.slots.register({
          name: 'settings.section',
          id: 'pingshun-ocr',
          order: 100,
          label: () => 'OCR',
          locale: NS,
          inject: () => ({ ocrSettings: services.ocrSettings }),
        }, OcrSection),
      },
      {
        slot: 'settings.launcher',
        // Shadow the account menu (Settings / feedback / sign-in) with a
        // Settings-only menu while Buddy mode is active. Disposing on exit
        // restores the native AccountMenu in DeepSeek mode.
        register: () => ctx.slots.register({
          name: 'settings.launcher',
          priority: SHADOW_PRIORITY,
          locale: NS,
        }, SettingsOnlyLauncher),
      },
      {
        slot: 'conversation.input.model',
        // Read-only model chip: the deployment's model service is built in,
        // so the composer shows a static label instead of the picker.
        register: () => ctx.slots.register({
          name: 'conversation.input.model',
          priority: SHADOW_PRIORITY,
          locale: NS,
        }, ModelChipReadonly),
      },
      {
        slot: 'settings.section',
        // Read-only Models section: shadows the native editor (same list id
        // `models`, lower priority) with a display-only summary of the
        // built-in model service; DeepSeek mode restores the native editor.
        register: () => ctx.slots.register({
          name: 'settings.section',
          id: 'models',
          priority: SHADOW_PRIORITY,
          order: 9,
          label: () => '模型',
          locale: NS,
          inject: () => ({ readModelInfo: services.readModelInfo }),
        }, ModelSectionReadonly),
      },
      {
        slot: 'settings.action',
        // Hide the "打开配置文件" header action: same list id `open-document`
        // at shadow priority renders nothing in its place.
        register: () => ctx.slots.register({
          name: 'settings.action',
          id: 'open-document',
          priority: SHADOW_PRIORITY,
          order: 0,
          locale: NS,
        }, EmptySettingsAction),
      },
    ] as const
    try {
      for (const target of targets) {
        // inject waits for the declaring owner, then binds the registration;
        // its return reverses both when we exit Buddy mode.
        const dispose = ctx.slots.inject(target.slot, target.register)
        installed.unshift(dispose)
      }
      disposers = installed
    } catch (reason: unknown) {
      // Unwind the partial install: a failed takeover must degrade to the
      // native UI, never leave a half-mounted Buddy shell.
      for (const dispose of installed) dispose()
      console.error('pingshun-buddy: Buddy surfaces failed to install; staying on the native UI:', reason)
    }
  }

  const exit = (): void => {
    if (rosterTimer !== undefined) { clearTimeout(rosterTimer); rosterTimer = undefined }
    for (const dispose of disposers) dispose()
    disposers = []
  }

  return { enter, exit, roster, refreshRoster }
}
