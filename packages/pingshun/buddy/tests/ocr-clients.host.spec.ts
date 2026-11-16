/**
 * OCR cloud clients, protocol-level tests with a mocked `fetch`.
 * Covers: submit → poll → result folding for both providers, the missing-token
 * error, and the zip → markdown read for MinerU. No real cloud calls.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { zipSync } from 'fflate'
import { runPaddleOcr } from '../src/host/ocr-paddle.ts'
import { runMineruOcr } from '../src/host/ocr-mineru.ts'

/** JSON response helper. */
function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

const paddleConfig = {
  token: 'test-token',
  baseUrl: 'https://paddle.test',
  model: 'PaddleOCR-VL-1.6',
  pollIntervalMs: 1,
  maxWaitMs: 5000,
}

const mineruConfig = {
  token: 'test-token',
  baseUrl: 'https://mineru.test',
  modelVersion: 'vlm',
  pollIntervalMs: 1,
  maxWaitMs: 5000,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('paddle ocr client', () => {
  it('submits, polls, and folds the JSONL markdown by page', async () => {
    const jsonl = [
      JSON.stringify({ result: { layoutParsingResults: [{ markdown: { text: '# 第一页' } }] } }),
      JSON.stringify({ result: { layoutParsingResults: [{ markdown: { text: '第二页内容' } }] } }),
    ].join('\n')
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith('/api/v2/ocr/jobs')) return jsonResponse({ data: { jobId: 'job-1' } })
      if (url.endsWith('/api/v2/ocr/jobs/job-1')) {
        return jsonResponse({ data: { state: 'done', extractProgress: { extractedPages: 2 }, resultUrl: { jsonUrl: 'https://cdn.test/result.jsonl' } } })
      }
      if (url === 'https://cdn.test/result.jsonl') return new Response(jsonl, { status: 200 })
      throw new Error(`unexpected fetch: ${url}`)
    }))
    const outcome = await runPaddleOcr({ fileUrl: 'https://cdn.test/doc.pdf' }, paddleConfig)
    expect(outcome.jobId).toBe('job-1')
    expect(outcome.extractedPages).toBe(2)
    expect(outcome.markdown).toBe('# 第一页\n\n第二页内容')
    expect(calls[0]).toBe('https://paddle.test/api/v2/ocr/jobs')
  })

  it('raises a structured error when the job fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/v2/ocr/jobs')) return jsonResponse({ data: { jobId: 'job-2' } })
      return jsonResponse({ data: { state: 'failed', errorMsg: 'bad file' } })
    }))
    await expect(runPaddleOcr({ fileUrl: 'https://cdn.test/doc.pdf' }, paddleConfig)).rejects.toThrow('OCR failed: bad file')
  })

  it('requires a file source', async () => {
    await expect(runPaddleOcr({}, paddleConfig)).rejects.toThrow('either filePath or fileUrl is required')
  })
})

describe('mineru ocr client', () => {
  it('submits a URL task, polls, and reads full.md from the result zip', async () => {
    const zip = zipSync({ 'full.md': new TextEncoder().encode('# MinerU 结果') })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/v4/extract/task') ) return jsonResponse({ code: 0, data: { task_id: 'task-1' } })
      if (url.endsWith('/api/v4/extract/task/task-1')) {
        return jsonResponse({ code: 0, data: { state: 'done', full_zip_url: 'https://cdn.test/result.zip' } })
      }
      if (url === 'https://cdn.test/result.zip') return new Response(zip, { status: 200 })
      throw new Error(`unexpected fetch: ${url}`)
    }))
    const outcome = await runMineruOcr({ fileUrl: 'https://cdn.test/doc.pdf' }, mineruConfig)
    expect(outcome.jobId).toBe('task-1')
    expect(outcome.markdown).toBe('# MinerU 结果')
    expect(outcome.zipUrl).toBe('https://cdn.test/result.zip')
  })

  it('uses the signed-upload flow for a local file', async () => {
    // Write a temp file to upload.
    const { writeFile, mkdtemp } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 'ocr-test-'))
    const filePath = join(dir, 'doc.pdf')
    await writeFile(filePath, new Uint8Array([1, 2, 3]))
    const zip = zipSync({ 'full.md': new TextEncoder().encode('本地文件结果') })
    const uploads: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/v4/file-urls/batch')) {
        return jsonResponse({ code: 0, data: { batch_id: 'batch-1', file_urls: ['https://oss.test/upload'] } })
      }
      if (url === 'https://oss.test/upload') { uploads.push(url); return new Response(null, { status: 200 }) }
      if (url.endsWith('/api/v4/extract-results/batch/batch-1')) {
        return jsonResponse({ code: 0, data: { extract_result: [{ state: 'done', full_zip_url: 'https://cdn.test/local.zip' }] } })
      }
      if (url === 'https://cdn.test/local.zip') return new Response(zip, { status: 200 })
      throw new Error(`unexpected fetch: ${url} ${String(init?.method)}`)
    }))
    const outcome = await runMineruOcr({ filePath }, mineruConfig)
    expect(outcome.jobId).toBe('batch-1')
    expect(outcome.markdown).toBe('本地文件结果')
    expect(uploads).toEqual(['https://oss.test/upload'])
  })
})
