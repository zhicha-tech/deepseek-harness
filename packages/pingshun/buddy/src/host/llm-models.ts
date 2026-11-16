/**
 * Buddy-mode built-in model service: reads the deployment's OpenAI-compatible
 * endpoint from the environment, discovers its model catalog through the
 * OpenAI `GET {baseURL}/models` convention, and projects the ids into DSH
 * model profiles that the runtime writes into the `llm-pi-ai` provider
 * configuration. No user-side provider or key editing is involved.
 *
 * Environment contract (`.env`, same channel DSH uses for DEEPSEEK_API_KEY):
 * - `PINGSHUN_LLM_BASE_URL` — OpenAI-compatible base, e.g. https://host/v1
 * - `PINGSHUN_LLM_API_KEY` — bearer key for both discovery and inference
 * - `PINGSHUN_LLM_DEFAULT_MODEL` — optional default model id; otherwise the
 *   first discovered model is used.
 *
 * @module
 */

/** Model profile shape accepted by `llm-pi-ai`'s provider configuration. */
export interface LlmModelProfile {
  readonly id: string
  readonly name: string
  readonly contextWindow: number
  readonly maxTokens: number
}

/** Environment values the built-in model service reads. */
export interface LlmEnvironment {
  readonly baseUrl: string | undefined
  readonly apiKey: string | undefined
  readonly defaultModel: string | undefined
}

/** Plain process-env access (the client base config narrows process.env). */
const env = process.env as Record<string, string | undefined>

/** Read the deployment's model-service environment. */
export function readLlmEnvironment(): LlmEnvironment {
  const baseUrl = env.PINGSHUN_LLM_BASE_URL?.trim()
  const apiKey = env.PINGSHUN_LLM_API_KEY?.trim()
  const defaultModel = env.PINGSHUN_LLM_DEFAULT_MODEL?.trim()
  return {
    baseUrl: baseUrl === '' ? undefined : baseUrl,
    apiKey: apiKey === '' ? undefined : apiKey,
    defaultModel: defaultModel === '' ? undefined : defaultModel,
  }
}

/** Fallback catalog used when discovery is unavailable or fails. */
export const FALLBACK_MODELS: readonly LlmModelProfile[] = [
  { id: 'pingshun-default', name: '平顺默认模型', contextWindow: 131072, maxTokens: 8192 },
]

/** Map one OpenAI `/models` id to a DSH model profile with safe capacities. */
function toProfile(id: string): LlmModelProfile {
  return { id, name: id, contextWindow: 131072, maxTokens: 8192 }
}

/**
 * Fetch the OpenAI-compatible model catalog.
 * @param baseUrl - OpenAI-compatible base URL (no trailing slash required).
 * @param apiKey - bearer key; omitted when the endpoint allows anonymous reads.
 * @param signal - cancellation for the HTTP request.
 * @returns discovered model profiles, or undefined when the catalog is empty.
 * @throws on network failure, non-2xx status, or a malformed catalog body.
 */
export async function fetchOpenAiModels(
  baseUrl: string, apiKey: string | undefined, signal: AbortSignal,
): Promise<LlmModelProfile[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/models`
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      ...apiKey !== undefined ? { authorization: `Bearer ${apiKey}` } : {},
    },
    signal,
  })
  if (!response.ok) throw new Error(`模型服务返回 ${String(response.status)}（GET ${url}）`)
  const body = await response.json() as { data?: { id?: unknown }[] }
  if (!Array.isArray(body.data)) throw new Error('模型目录格式不符：缺少 data 数组')
  const ids = body.data
    .map(entry => (typeof entry?.id === 'string' ? entry.id.trim() : ''))
    .filter(id => id !== '')
  if (ids.length === 0) throw new Error('模型目录为空：未发现可用模型')
  return ids.map(toProfile)
}

/** Pick the default model id: the env pin, else the first discovered model. */
export function defaultModelOf(environment: LlmEnvironment, models: readonly LlmModelProfile[]): string {
  if (environment.defaultModel !== undefined) return environment.defaultModel
  return models[0]?.id ?? FALLBACK_MODELS[0]!.id
}
