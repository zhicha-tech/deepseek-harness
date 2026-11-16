/**
 * Pingshun Buddy, browser half.
 *
 * Permanent registration: one `sidebar.footer.action` entry whose label
 * follows the current mode (→ Buddy in native UI, → DeepSeek in Buddy mode),
 * so both directions stay reachable from the sidebar foot. The mode-driven
 * surfaces (Buddy sidebar takeover and conversation tool button) mount and
 * unmount through the surface manager without touching native registrations,
 * and the first entry into a profile that installed this bundle opens in
 * Buddy mode (`mode-store`).
 */
import type { Context } from '@deepseek-ai/cordis'
import type { AgentPresetRow } from '@deepseek-ai/dsh-agent-preset-registry/types'
import { modeStore } from './mode-store.ts'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the uiWorkspace client service (startSession/openSession types).
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
// Type-only: the api-remotes Context merge (ctx.remote.agentPresets / pluginInventory).
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { en, zh, type PingshunLocaleKey } from './locales.ts'
import { createBuddySurfaces, type BuddySurfaces } from './surface-manager.ts'
import { createBrandManager } from './brand-manager.ts'
import { createModelNavDedup } from './model-nav-dedup.ts'
import { readModelSelection, selectModel } from './model-select.ts'
import type { OcrSettingsAccess } from './settings-panel.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Buddy mode switch, sidebar catalog, and tool drawer copy. */
    'pingshun.buddy': PingshunLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'pingshun.buddy'

/** Services required by the browser plugin; the remote namespaces follow the
 * plugin-manager's declared-subpath convention (`remote.<namespace>`). */
export const inject = ['slots', 'locale', 'uiWorkspace', 'remote', 'remote.agentPresets', 'remote.pluginInventory', 'remote.settings']

/** Read the agent-preset roster from the Host remote. */
async function listRoster(ctx: Context): Promise<readonly AgentPresetRow[]> {
  const answer = await ctx.remote.agentPresets.list()
  if (!answer.ok) throw new Error(`agentPresets.list failed: ${answer.error.message}`)
  return answer.value.presets
}

/** Read the plugin-inventory snapshot from the Host remote. */
async function listInventory(ctx: Context): Promise<{
  readonly entries: readonly import('@deepseek-ai/dsh-host-plugin-inventory').PluginInventoryEntry[]
  readonly agentPresets?: readonly import('@deepseek-ai/dsh-host-plugin-inventory').AgentPresetPluginGroup[] | undefined
}> {
  const answer = await ctx.remote.pluginInventory.list()
  if (!answer.ok) throw new Error(`pluginInventory.list failed: ${answer.error.message}`)
  return answer.value
}

/** OCR token settings backed by the runtime plugin's settings namespace. */
function ocrSettings(ctx: Context): OcrSettingsAccess {
  const ns = 'pingshun-runtime'
  return {
    async readStatus() {
      const result = await ctx.remote.settings.describe()
      if (!result.ok) throw new Error(`settings.describe failed: ${result.error.message}`)
      const namespace = result.value.namespaces.find(entry => entry.ns === ns)
      const secrets = namespace?.secrets ?? []
      return {
        paddle: secrets.some(secret => secret.path[0] === 'paddleToken' && secret.set),
        mineru: secrets.some(secret => secret.path[0] === 'mineruToken' && secret.set),
      }
    },
    async save(tokens) {
      const patch: Record<string, string> = {}
      if (tokens.paddle !== undefined) patch.paddleToken = tokens.paddle
      if (tokens.mineru !== undefined) patch.mineruToken = tokens.mineru
      if (Object.keys(patch).length === 0) return
      const result = await ctx.remote.settings.update(ns, patch, undefined)
      if (!result.ok) throw new Error(`settings.update failed: ${result.error.message}`)
    },
  }
}

/** Read the built-in provider summary and the default model from settings. */
async function readModelInfo(ctx: Context): Promise<{
  provider: { displayName: string; baseUrl: string; models: readonly string[] }
  defaultModel: string
}> {
  const result = await ctx.remote.settings.describe()
  if (!result.ok) throw new Error(`settings.describe failed: ${result.error.message}`)
  const llm = result.value.namespaces.find(entry => entry.ns === 'llm-pi-ai')
  const providers = (llm?.value as { providers?: Record<string, { displayName?: string; baseURL?: string; models?: { id: string }[] }> } | undefined)?.providers ?? {}
  const pingshun = providers.pingshun ?? {}
  const defaultNs = result.value.namespaces.find(entry => entry.ns === 'agent-default-model')
  const defaultValue = defaultNs?.value as { provider?: string; model?: string } | undefined
  return {
    provider: {
      displayName: pingshun.displayName ?? '平顺模型服务',
      baseUrl: pingshun.baseURL ?? '',
      models: (pingshun.models ?? []).map(m => m.id),
    },
    defaultModel: defaultValue?.model ?? '',
  }
}

/** Read the persisted UI mode from the runtime settings namespace. */
async function readBuddyMode(ctx: Context): Promise<'buddy' | 'dsh' | undefined> {
  const result = await ctx.remote.settings.describe()
  if (!result.ok) return undefined
  const namespace = result.value.namespaces.find(entry => entry.ns === 'pingshun-runtime')
  const value = namespace?.value
  const mode = typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>).buddyMode
    : undefined
  return mode === 'dsh' || mode === 'buddy' ? mode : undefined
}

/** Registers the dictionaries, the permanent switch entry, and the mode-driven surfaces. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'pingshun-buddy: dictionaries')

  const surfaces: BuddySurfaces = createBuddySurfaces(ctx, {
    uiWorkspace: ctx.get('uiWorkspace') as import('@deepseek-ai/dsh-client-ui-workspace/client').UiWorkspace,
    listRoster: () => listRoster(ctx),
    listInventory: () => listInventory(ctx),
    ocrSettings: ocrSettings(ctx),
    readModelInfo: () => readModelInfo(ctx),
    readModelSelection: () => readModelSelection(ctx),
    selectModel: (model: string) => selectModel(ctx, model),
  })
  const brand = createBrandManager(ctx)
  const modelNavDedup = createModelNavDedup()

  // Connect the mode store to the Host's persisted buddyMode setting, so a
  // switch also registers/unregisters the business presets on the Host.
  const syncSetting = {
    write: (mode: 'buddy' | 'dsh') => {
      void ctx.remote.settings.update('pingshun-runtime', { buddyMode: mode }, undefined).catch((error: unknown) => {
        console.warn('pingshun-buddy: buddyMode write failed:', error)
      })
    },
    onSwitch: () => {
      // The native preset picker reads the roster only when its chip loads.
      // Emit the client's re-read notification after the Host has reconciled,
      // so it drops the Buddy presets once they are unregistered.
      setTimeout(() => { ctx.emit('connection/reset') }, 400)
    },
  }
  modeStore.bindSettings(syncSetting)
  void readBuddyMode(ctx).then((initial) => {
    if (initial !== undefined) modeStore.bindSettings({ ...syncSetting, initial })
  }).catch(() => {})

  ctx.effect(() => {
    const sync = (): void => {
      if (modeStore.getSnapshot() === 'buddy') {
        surfaces.enter()
        brand.enter()
        modelNavDedup.enter()
      } else {
        surfaces.exit()
        brand.exit()
        modelNavDedup.exit()
      }
    }
    sync()
    const unsubscribe = modeStore.subscribe(sync)
    return () => {
      unsubscribe()
      surfaces.exit()
      brand.exit()
      modelNavDedup.exit()
    }
  }, 'pingshun-buddy: mode-driven surfaces')
}
