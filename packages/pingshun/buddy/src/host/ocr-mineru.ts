/**
 * MinerU precise-extraction cloud client.
 *
 * Two submission modes against the v4 API: a local file goes through the
 * signed-upload flow (`file-urls/batch` → PUT → auto-submit), a remote URL goes
 * through `extract/task`. Both poll until the task settles, then download the
 * result zip and read `full.md`. The token is supplied by the caller (the
 * runtime config); it is never logged or embedded in output.
 *
 * @module
 */
import { unzipSync } from 'fflate'
import { OcrError, sleep, type OcrOutcome } from './ocr-paddle.ts'

/** Effective options for one MinerU run. */
export interface MineruConfig {
  /** Bearer token for the v4 API. */
  readonly token: string
  /** API base (no trailing slash). */
  readonly baseUrl: string
  /** Model version: pipeline | vlm | MinerU-HTML. */
  readonly modelVersion: string
  /** Poll interval in milliseconds. */
  readonly pollIntervalMs: number
  /** Upper bound on total wait in milliseconds. */
  readonly maxWaitMs: number
}

/** Input for one MinerU run: exactly one of a local path or a remote URL. */
export interface MineruInput {
  readonly filePath?: string
  readonly fileUrl?: string
  readonly isOcr?: boolean
  readonly enableFormula?: boolean
  readonly enableTable?: boolean
  readonly language?: string
  readonly pageRanges?: string
  readonly extraFormats?: readonly string[]
}

/** Successful MinerU outcome, with the result zip URL for traceability. */
export interface MineruOutcome extends OcrOutcome {
  readonly zipUrl: string
}

/** Shared headers for the v4 API. */
function headers(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

/** Read a v4 JSON envelope, raising on transport or `code != 0` failures. */
async function v4(response: Response, what: string): Promise<Record<string, unknown>> {
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new OcrError(`${what} failed with HTTP ${response.status}`, body.slice(0, 500))
  }
  const body = await response.json() as { code?: number; msg?: string; data?: unknown }
  if (body.code !== 0) throw new OcrError(`${what} rejected: ${body.msg ?? 'unknown'}`, body)
  return (body.data ?? {}) as Record<string, unknown>
}

/** Common optional extraction flags. */
function flags(input: MineruInput): Record<string, unknown> {
  return {
    ...input.isOcr !== undefined ? { is_ocr: input.isOcr } : {},
    ...input.enableFormula !== undefined ? { enable_formula: input.enableFormula } : {},
    ...input.enableTable !== undefined ? { enable_table: input.enableTable } : {},
    ...input.language !== undefined ? { language: input.language } : {},
    ...input.extraFormats !== undefined ? { extra_formats: input.extraFormats } : {},
  }
}

/** Poll a single task until done/failed, returning its zip URL. */
async function awaitTaskZip(taskId: string, config: MineruConfig, signal?: AbortSignal): Promise<string> {
  const deadline = Date.now() + config.maxWaitMs
  for (;;) {
    if (signal?.aborted) throw new OcrError('OCR cancelled')
    if (Date.now() > deadline) throw new OcrError('OCR timed out; query the task manually later')
    const response = await fetch(`${config.baseUrl}/api/v4/extract/task/${taskId}`, { headers: headers(config.token), signal: signal ?? null })
    const data = await v4(response, 'MinerU task query') as { state?: string; full_zip_url?: string; err_msg?: string }
    if (data.state === 'done') {
      if (typeof data.full_zip_url !== 'string' || data.full_zip_url === '') throw new OcrError('MinerU done but no result zip URL', data)
      return data.full_zip_url
    }
    if (data.state === 'failed') throw new OcrError(`MinerU failed: ${data.err_msg ?? 'unknown'}`, data)
    await sleep(config.pollIntervalMs, signal)
  }
}

/** Poll a signed-upload batch until the single file's task settles. */
async function awaitBatchZip(batchId: string, config: MineruConfig, signal?: AbortSignal): Promise<string> {
  const deadline = Date.now() + config.maxWaitMs
  for (;;) {
    if (signal?.aborted) throw new OcrError('OCR cancelled')
    if (Date.now() > deadline) throw new OcrError('OCR timed out; query the batch manually later')
    const response = await fetch(`${config.baseUrl}/api/v4/extract-results/batch/${batchId}`, { headers: headers(config.token), signal: signal ?? null })
    const data = await v4(response, 'MinerU batch query') as { extract_result?: { state?: string; full_zip_url?: string; err_msg?: string }[] }
    const first = data.extract_result?.[0] ?? {}
    if (first.state === 'done') {
      if (typeof first.full_zip_url !== 'string' || first.full_zip_url === '') throw new OcrError('MinerU done but no result zip URL', data)
      return first.full_zip_url
    }
    if (first.state === 'failed') throw new OcrError(`MinerU failed: ${first.err_msg ?? 'unknown'}`, data)
    await sleep(config.pollIntervalMs, signal)
  }
}

/** Submit a remote URL task. */
async function submitUrl(input: MineruInput & { fileUrl: string }, config: MineruConfig, signal?: AbortSignal): Promise<string> {
  const response = await fetch(`${config.baseUrl}/api/v4/extract/task`, {
    method: 'POST',
    headers: headers(config.token),
    body: JSON.stringify({ url: input.fileUrl, model_version: config.modelVersion, ...flags(input), ...input.pageRanges !== undefined ? { page_ranges: input.pageRanges } : {} }),
    signal: signal ?? null,
  })
  const data = await v4(response, 'MinerU task submit') as { task_id?: string }
  if (typeof data.task_id !== 'string' || data.task_id === '') throw new OcrError('MinerU task submit returned no task_id', data)
  return data.task_id
}

/** Submit a local file through the signed-upload flow. */
async function submitFile(input: MineruInput & { filePath: string }, config: MineruConfig, signal?: AbortSignal): Promise<string> {
  const name = input.filePath.split(/[\\/]/).pop() ?? 'document'
  const response = await fetch(`${config.baseUrl}/api/v4/file-urls/batch`, {
    method: 'POST',
    headers: headers(config.token),
    body: JSON.stringify({ files: [{ name }], model_version: config.modelVersion, ...flags(input) }),
    signal: signal ?? null,
  })
  const data = await v4(response, 'MinerU upload-url request') as { batch_id?: string; file_urls?: string[] }
  const batchId = data.batch_id
  const uploadUrl = data.file_urls?.[0]
  if (typeof batchId !== 'string' || typeof uploadUrl !== 'string') throw new OcrError('MinerU upload-url request returned no batch/upload URL', data)
  const { readFile } = await import('node:fs/promises')
  const bytes = await readFile(input.filePath).catch((error: unknown) => {
    throw new OcrError(`cannot read file: ${input.filePath}`, String(error))
  })
  const upload = await fetch(uploadUrl, { method: 'PUT', body: new Uint8Array(bytes), signal: signal ?? null })
  if (!upload.ok) throw new OcrError(`MinerU file upload failed with HTTP ${upload.status}`)
  return batchId
}

/** Download the result zip and read its `full.md`. */
async function readZipMarkdown(zipUrl: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(zipUrl, { signal: signal ?? null })
  if (!response.ok) throw new OcrError(`MinerU result zip download failed with HTTP ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch (error) {
    throw new OcrError('MinerU result is not a readable zip', String(error))
  }
  const markdownEntry = Object.keys(files).find(name => name.endsWith('full.md'))
  if (markdownEntry === undefined) throw new OcrError('MinerU result zip has no full.md', Object.keys(files))
  return new TextDecoder().decode(files[markdownEntry])
}

/** Run MinerU end to end and return the folded markdown plus the zip URL. */
export async function runMineruOcr(input: MineruInput, config: MineruConfig, signal?: AbortSignal): Promise<MineruOutcome> {
  let id: string
  let zipUrl: string
  if (input.fileUrl !== undefined) {
    id = await submitUrl({ ...input, fileUrl: input.fileUrl }, config, signal)
    zipUrl = await awaitTaskZip(id, config, signal)
  } else if (input.filePath !== undefined) {
    id = await submitFile({ ...input, filePath: input.filePath }, config, signal)
    zipUrl = await awaitBatchZip(id, config, signal)
  } else {
    throw new OcrError('either filePath or fileUrl is required')
  }
  const markdown = await readZipMarkdown(zipUrl, signal)
  return { jobId: id, extractedPages: undefined, markdown, zipUrl }
}
