/**
 * Pingshun Buddy Host runtime: token bridging and the mode-driven preset
 * registration.
 *
 * The plugin owns one settings namespace (its own Config): two volatile
 * secret OCR tokens and the volatile `buddyMode` flag. Tokens are bridged to
 * well-known process environment variables on every change, because the OCR
 * tools live inside preset scopes that cannot inject a Host-level service;
 * `process.env` is the same channel DSH itself uses for `DEEPSEEK_API_KEY`.
 * `buddyMode` is the single source of truth for the UI mode: `buddy` registers
 * the six business presets, `dsh` unregisters them — so DeepSeek mode genuinely
 * has no Buddy agents in the Host roster, not merely a hidden UI.
 *
 * @module @deepseek-ai/dsh-pingshun-buddy/runtime
 */
import { type Context, type Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { PINGSHUN_PRESETS } from './presets.ts'
import { defaultModelOf, fetchOpenAiModels, readLlmEnvironment, type LlmModelProfile } from './llm-models.ts'
import { loadBundleEnv } from './env-file.ts'
// Type-only: pulls the settings service and default-model service Context merges.
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { credentialRef } from '@deepseek-ai/dsh-credentials'

/** Settings namespace and Cordis row id. */
export const RUNTIME_NAMESPACE = 'pingshun-runtime'

/** Environment variables the OCR tools read (bridged from Settings). */
export const ENV = {
  paddleToken: 'PINGSHUN_PADDLE_OCR_TOKEN',
  mineruToken: 'PINGSHUN_MINERU_OCR_TOKEN',
  paddleBaseUrl: 'PINGSHUN_PADDLE_OCR_BASE_URL',
  paddleModel: 'PINGSHUN_PADDLE_OCR_MODEL',
  mineruBaseUrl: 'PINGSHUN_MINERU_BASE_URL',
  mineruModelVersion: 'PINGSHUN_MINERU_MODEL_VERSION',
} as const

/** Volatile plugin configuration exposed through Settings. */
export interface Config {
  /** PaddleOCR bearer token; secret, edited in Settings. */
  readonly paddleToken: Volatile<string | undefined>
  /** MinerU bearer token; secret, edited in Settings. */
  readonly mineruToken: Volatile<string | undefined>
  /** UI mode: the Buddy workbench or the native DeepSeek UI. */
  readonly buddyMode: Volatile<'buddy' | 'dsh'>
  /** PaddleOCR model identifier. */
  readonly paddleModel: Volatile<string>
  /** PaddleOCR jobs endpoint base. */
  readonly paddleBaseUrl: Volatile<string>
  /** MinerU model version: pipeline | vlm | MinerU-HTML. */
  readonly mineruModelVersion: Volatile<string>
  /** MinerU API base. */
  readonly mineruBaseUrl: Volatile<string>
  /** Poll interval in milliseconds. */
  readonly pollIntervalMs: Volatile<number>
  /** Upper bound on total OCR wait in milliseconds. */
  readonly maxWaitMs: Volatile<number>
  /** User's model provider saved before Buddy mode overrode the default. */
  readonly savedModelProvider: Volatile<string | undefined>
  /** User's model id saved before Buddy mode overrode the default. */
  readonly savedModel: Volatile<string | undefined>
}

export const Config: z<Config> = z.object({
  paddleToken: z.string().role('secret').volatile(),
  mineruToken: z.string().role('secret').volatile(),
  buddyMode: z.union(['buddy', 'dsh']).default('buddy').volatile(),
  paddleModel: z.string().default('PaddleOCR-VL-1.6').volatile(),
  paddleBaseUrl: z.string().default('https://paddleocr.aistudio-app.com').volatile(),
  mineruModelVersion: z.string().default('vlm').volatile(),
  mineruBaseUrl: z.string().default('https://mineru.net').volatile(),
  pollIntervalMs: z.number().step(1).min(500).default(5000).volatile(),
  maxWaitMs: z.number().step(1).min(5000).default(600000).volatile(),
  savedModelProvider: z.string().volatile(),
  savedModel: z.string().volatile(),
}) as z<Config>

/** Cordis plugin name. */
export const name = 'pingshun-runtime'

/** Services required by the runtime plugin. */
export const inject = ['agentPresets', 'settings', 'agentDefaultModel']

/** Process environment with arbitrary string keys (the client base config
 * narrows `process.env` to its own template; Host code needs plain access). */
const env = process.env as Record<string, string | undefined>

/** Write or clear one environment variable from a volatile value. */
function bridge(key: string, value: string | undefined): void {
  if (value === undefined || value === '') delete env[key]
  else env[key] = value
}

/** Register the runtime: bridge tokens and drive preset registration. */
export function apply(ctx: Context, config: Config): void {
  // Snapshot the pre-existing system environment FIRST (before the bundle
  // .env is merged in), then load the bundle's .env (system environment wins
  // over the file). The fallback chain below is:
  // Settings value → system environment → bundle .env.
  const systemEnv = new Map<string, string | undefined>()
  for (const key of [...Object.values(ENV), 'PINGSHUN_LLM_BASE_URL', 'PINGSHUN_LLM_API_KEY', 'PINGSHUN_LLM_DEFAULT_MODEL']) {
    systemEnv.set(key, env[key])
  }
  const bundleEnv = loadBundleEnv()
  /** Fallback chain: Settings value → system environment → bundle .env. */
  const fallbackOf = (key: string): string | undefined => systemEnv.get(key) ?? bundleEnv[key]

  // Bridge the volatile configuration into the process environment so the
  // preset-scoped OCR tools can read it without injecting a Host service.
  const syncEnv = (): void => {
    const bridgeWithFallback = (key: string, configValue: string | undefined): void => {
      const value = configValue ?? fallbackOf(key)
      bridge(key, value)
    }
    bridgeWithFallback(ENV.paddleToken, config.paddleToken.get())
    bridgeWithFallback(ENV.mineruToken, config.mineruToken.get())
    bridgeWithFallback(ENV.paddleBaseUrl, config.paddleBaseUrl.get())
    bridgeWithFallback(ENV.paddleModel, config.paddleModel.get())
    bridgeWithFallback(ENV.mineruBaseUrl, config.mineruBaseUrl.get())
    bridgeWithFallback(ENV.mineruModelVersion, config.mineruModelVersion.get())
  }
  syncEnv()

  // Mode-driven preset registration, serialized and latest-wins. A fast
  // switch — including one during the initial registration — must not leave a
  // stale roster: `targetMode` tracks the newest setting, and the loop keeps
  // reconciling until the live roster matches it.
  let disposers: (() => Promise<void>)[] = []
  let currentMode: 'buddy' | 'dsh' | undefined
  let targetMode: 'buddy' | 'dsh' = config.buddyMode.get()
  let running = false
  let again = false

  // Built-in model service: the user's own default-model selection is saved
  // into this plugin's own persisted config (`savedModelProvider/savedModel`)
  // before Buddy mode overrides it, so DeepSeek mode restores it even across
  // restarts. The environment is read once at apply time: later volatile
  // updates run with a launch-env snapshot that may not carry the variables.
  let modelAbort: AbortController | undefined
  const llmEnvironment = readLlmEnvironment()

  /** Save the user's own default selection, but never the one we wrote:
   * `currentSelection` returning `pingshun` means our own earlier write is
   * already in the settings document, so the saved original must be kept. */
  const saveUserSelection = async (): Promise<void> => {
    try {
      const current = ctx.agentDefaultModel.currentSelection()
      if (current.provider === 'pingshun') return
      await ctx.settings.update(RUNTIME_NAMESPACE, {
        savedModelProvider: current.provider,
        savedModel: current.model,
      })
    } catch (error) {
      ctx.logger.warn(`pingshun-runtime: 默认模型选择保存失败（不影响 Agent 注册）：${String(error)}`)
    }
  }

  /** Project the discovered catalog into the llm-pi-ai provider config and
   * point the default selection at it. Never blocks preset registration. */
  const syncModels = async (): Promise<void> => {
    const environment = llmEnvironment
    if (environment.baseUrl === undefined) {
      ctx.logger.warn('pingshun-runtime: PINGSHUN_LLM_BASE_URL 未设置，使用静态 fallback 模型列表')
      return
    }
    modelAbort?.abort()
    const controller = new AbortController()
    modelAbort = controller
    let models: readonly LlmModelProfile[]
    try {
      models = await fetchOpenAiModels(environment.baseUrl, environment.apiKey, controller.signal)
    } catch (error) {
      if (controller.signal.aborted) return
      ctx.logger.warn(`pingshun-runtime: 模型目录拉取失败，保留静态 fallback：${String(error)}`)
      return
    }
    if (controller.signal.aborted) return
    try {
      // Write the COMPLETE profile (not just models): the settings document
      // must carry api/baseURL/apiKeyEnv itself, since the bundle patch's
      // initial config and the settings document merge at the volatile
      // record level and a models-only patch would leave the route without
      // its wire protocol.
      await ctx.settings.update('llm-pi-ai', {
        providers: {
          pingshun: {
            displayName: '平顺模型服务',
            api: 'openai-responses',
            baseURL: environment.baseUrl,
            apiKeyEnv: 'PINGSHUN_LLM_API_KEY',
            models: [...models],
          },
        },
      })
      const model = defaultModelOf(environment, models)
      // Idempotent write: skip when the default already points at this model,
      // so the write's own volatile-update cannot nest HMR transactions.
      const current = ctx.agentDefaultModel.currentSelection()
      if (current.provider === 'pingshun' && current.model === model) return
      await ctx.settings.update('agent-default-model', { provider: 'pingshun', model })
      ctx.logger.info(`pingshun-runtime: 已接入平顺模型服务（${String(models.length)} 个模型，默认 ${model}）`)
    } catch (error) {
      ctx.logger.warn(`pingshun-runtime: 模型配置写入失败：${String(error)}`)
    }
  }

  // Built-in model credential: llm-pi-ai resolves `apiKeyEnv` through the
  // credentials service FIRST and the launch-environment snapshot only as a
  // fallback. The bundle .env loads at plugin activation — after the launch
  // snapshot was captured — so the key must be stored through the credentials
  // service (the same write path the web Models page uses). A key already
  // stored through the credentials service always wins; this write is skipped
  // when the stored value already matches the bundle key.
  const ensureModelCredential = async (): Promise<void> => {
    const apiKey = fallbackOf('PINGSHUN_LLM_API_KEY')
    if (apiKey === undefined || apiKey.length === 0) {
      ctx.logger.warn('pingshun-runtime: PINGSHUN_LLM_API_KEY 未设置（.env / 环境变量均无）')
      return
    }
    const credentials = ctx.get('credentials', false)
    if (credentials === undefined) {
      ctx.logger.warn('pingshun-runtime: credentials 服务不可用，模型凭据未写入')
      return
    }
    const ref = credentialRef('PINGSHUN_LLM_API_KEY')
    try {
      const existing = await credentials.resolve(ref)
      if (existing?.value === apiKey) return
      await credentials.set(ref, apiKey)
      ctx.logger.info('pingshun-runtime: 模型服务凭据已写入 credentials 服务')
    } catch (error) {
      ctx.logger.warn(`pingshun-runtime: 模型服务凭据写入失败：${String(error)}`)
    }
  }

  const syncMode = async (): Promise<void> => {
    if (running) {
      // A reconciliation is already in flight; ask it to run once more with
      // the newest target instead of racing it.
      again = true
      return
    }
    running = true
    try {
      do {
        again = false
        const mode = targetMode
        if (currentMode === mode) continue
        currentMode = mode
        // Unregister in parallel: each disposer's `definitions.delete` runs
        // synchronously before its first await, so the Buddy roster disappears
        // from agentPresets.list immediately, then scope teardown settles.
        const pending = disposers.map(dispose => dispose())
        disposers = []
        await Promise.all(pending)
        if (mode === 'buddy') {
          // Register in parallel so the six presets mount together.
          disposers = await Promise.all(PINGSHUN_PRESETS.map(definition => ctx.agentPresets.register(definition)))
          // Save the user's own selection, then sync the built-in model
          // service. These run SEQUENTIALLY in one detached chain: settings
          // updates are HMR transactions that cannot nest, so the two writes
          // must not run concurrently. Discovery never blocks the roster.
          // The credential write precedes both so the first model request
          // already resolves the key through the credentials service.
          void (async () => {
            await ensureModelCredential()
            await saveUserSelection()
            await syncModels()
          })().catch((error: unknown) => {
            ctx.logger.warn(`pingshun-runtime: 模型服务同步失败：${String(error)}`)
          })
        } else {
          // DeepSeek mode: restore the user's own selection saved before the
          // Buddy override (persisted in this plugin's config).
          modelAbort?.abort()
          const provider = config.savedModelProvider.get()
          const model = config.savedModel.get()
          if (provider !== undefined && model !== undefined) {
            // Idempotent restore: skip when the default is already the saved
            // selection, so the restore's own volatile-update cannot re-enter
            // this write and nest HMR transactions.
            const current = ctx.agentDefaultModel.currentSelection()
            if (current.provider === provider && current.model === model) continue
            try {
              await ctx.settings.update('agent-default-model', { provider, model })
            } catch (error) {
              ctx.logger.warn(`pingshun-runtime: 默认模型还原失败：${String(error)}`)
            }
          }
        }
      } while (again || currentMode !== targetMode)
    } finally {
      running = false
    }
  }

  ctx.effect(() => {
    void syncMode().catch((error: unknown) => {
      ctx.logger.warn(`pingshun-runtime: initial preset registration failed: ${String(error)}`)
    })
    const stop = ctx.on('loader/volatile-update', () => {
      syncEnv()
      targetMode = config.buddyMode.get()
      void syncMode().catch((error: unknown) => {
        ctx.logger.warn(`pingshun-runtime: mode sync failed: ${String(error)}`)
      })
    })
    return () => {
      stop()
      modelAbort?.abort()
      for (const dispose of disposers) void dispose()
      disposers = []
    }
  }, 'pingshun-runtime: preset registration')
}
