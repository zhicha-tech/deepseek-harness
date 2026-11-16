/**
 * Model selection shared by the Buddy-mode composer chip and the Models
 * settings section: the deployment's model service endpoint and API key are
 * managed and never shown; users only pick one of the discovered models.
 * Selection persists through `agent-default-model` settings, the same
 * document the Host runtime syncs the built-in provider into.
 *
 * @module
 */
import type { Context } from '@deepseek-ai/cordis'

/** Discovered model catalog plus the current default selection. */
export interface ModelSelectionInfo {
  readonly models: readonly string[]
  readonly current: string
}

/** Read the built-in provider's model ids and the current default model. */
export async function readModelSelection(ctx: Context): Promise<ModelSelectionInfo> {
  const result = await ctx.remote.settings.describe()
  if (!result.ok) throw new Error(`settings.describe failed: ${result.error.message}`)
  const llm = result.value.namespaces.find(entry => entry.ns === 'llm-pi-ai')
  const providers = (llm?.value as { providers?: Record<string, { models?: { id: string }[] }> } | undefined)?.providers ?? {}
  const models = (providers.pingshun?.models ?? []).map(model => model.id)
  const defaultNs = result.value.namespaces.find(entry => entry.ns === 'agent-default-model')
  const value = defaultNs?.value as { model?: string } | undefined
  return { models, current: value?.model ?? models[0] ?? '' }
}

/** Persist the chosen model as the default selection (provider stays `pingshun`). */
export async function selectModel(ctx: Context, model: string): Promise<void> {
  const result = await ctx.remote.settings.update('agent-default-model', { provider: 'pingshun', model }, undefined)
  if (!result.ok) throw new Error(`settings.update failed: ${result.error.message}`)
}
