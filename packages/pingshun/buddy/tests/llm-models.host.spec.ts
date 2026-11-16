/**
 * Built-in model service: environment reading, OpenAI catalog discovery,
 * default-model selection, and failure handling.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultModelOf, FALLBACK_MODELS, fetchOpenAiModels, readLlmEnvironment } from '../src/host/llm-models.ts'

const ENV_KEYS = ['PINGSHUN_LLM_BASE_URL', 'PINGSHUN_LLM_API_KEY', 'PINGSHUN_LLM_DEFAULT_MODEL'] as const

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
  vi.unstubAllGlobals()
})

describe('readLlmEnvironment', () => {
  it('reads trimmed values and treats empty strings as absent', () => {
    process.env.PINGSHUN_LLM_BASE_URL = '  https://models.example/v1  '
    process.env.PINGSHUN_LLM_API_KEY = ''
    process.env.PINGSHUN_LLM_DEFAULT_MODEL = '  '
    const environment = readLlmEnvironment()
    expect(environment.baseUrl).toBe('https://models.example/v1')
    expect(environment.apiKey).toBeUndefined()
    expect(environment.defaultModel).toBeUndefined()
  })
})

describe('fetchOpenAiModels', () => {
  it('maps the OpenAI catalog ids to DSH model profiles', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'glm-large' }, { id: 'glm-small' }] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const models = await fetchOpenAiModels('https://models.example/v1/', 'sk-test', new AbortController().signal)
    expect(models.map(m => m.id)).toEqual(['glm-large', 'glm-small'])
    expect(models[0]?.contextWindow).toBe(131072)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://models.example/v1/models')
    const init = fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string> }
    expect(init.headers.authorization).toBe('Bearer sk-test')
  })

  it('omits the Authorization header without a key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 'm' }] }) })
    vi.stubGlobal('fetch', fetchMock)
    await fetchOpenAiModels('https://models.example/v1', undefined, new AbortController().signal)
    const init = fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string> }
    expect(init.headers.authorization).toBeUndefined()
  })

  it('throws on non-2xx responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }))
    await expect(fetchOpenAiModels('https://models.example/v1', 'bad', new AbortController().signal))
      .rejects.toThrow('401')
  })

  it('throws on a malformed catalog body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ models: [] }) }))
    await expect(fetchOpenAiModels('https://models.example/v1', undefined, new AbortController().signal))
      .rejects.toThrow('data')
  })

  it('throws on an empty catalog', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }))
    await expect(fetchOpenAiModels('https://models.example/v1', undefined, new AbortController().signal))
      .rejects.toThrow('为空')
  })
})

describe('defaultModelOf', () => {
  it('prefers the env pin over the discovered list', () => {
    const environment = { baseUrl: 'https://x', apiKey: undefined, defaultModel: 'glm-large' }
    expect(defaultModelOf(environment, FALLBACK_MODELS)).toBe('glm-large')
  })

  it('falls back to the first discovered model, then the static fallback', () => {
    const environment = { baseUrl: 'https://x', apiKey: undefined, defaultModel: undefined }
    expect(defaultModelOf(environment, [{ id: 'glm-small', name: 'glm-small', contextWindow: 1, maxTokens: 1 }])).toBe('glm-small')
    expect(defaultModelOf(environment, [])).toBe(FALLBACK_MODELS[0]!.id)
  })
})
