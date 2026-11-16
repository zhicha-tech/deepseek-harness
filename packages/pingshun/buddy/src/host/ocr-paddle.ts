/**
 * PaddleOCR (PaddleOCR-VL) cloud client.
 *
 * Submits a local file (multipart) or a remote file URL to the OCR jobs API,
 * polls the job until it settles, then reads the JSONL result and folds each
 * page's layout-parsing markdown into one document. The token is supplied by
 * the caller (the runtime config); it is never logged or embedded in output.
 *
 * @module
 */

/** Effective options for one PaddleOCR run. */
export interface PaddleConfig {
  /** Bearer token for the jobs API. */
  readonly token: string
  /** Jobs endpoint base (no trailing slash). */
  readonly baseUrl: string
  /** Model identifier. */
  readonly model: string
  /** Poll interval in milliseconds. */
  readonly pollIntervalMs: number
  /** Upper bound on total wait in milliseconds. */
  readonly maxWaitMs: number
}

/** Input for one OCR run: exactly one of a local path or a remote URL. */
export interface PaddleInput {
  readonly filePath?: string
  readonly fileUrl?: string
  readonly useDocOrientationClassify?: boolean
  readonly useDocUnwarping?: boolean
  readonly useChartRecognition?: boolean
}

/** Successful OCR outcome. */
export interface OcrOutcome {
  readonly jobId: string
  readonly extractedPages: number | undefined
  readonly markdown: string
}

/** Structured OCR failure surfaced to the tool result. */
export class OcrError extends Error {
  constructor(message: string, readonly detail?: unknown) {
    super(message)
    this.name = 'OcrError'
  }
}

/** Await a delay that rejects immediately when the caller aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new OcrError('OCR cancelled'))
    }, { once: true })
  })
}

/** Read a response body as JSON, raising an OcrError on a non-2xx status. */
async function readJson(response: Response, what: string): Promise<unknown> {
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new OcrError(`${what} failed with HTTP ${response.status}`, body.slice(0, 500))
  }
  return response.json()
}

/** Submit the OCR job and return its job id. */
async function submit(input: PaddleInput, config: PaddleConfig, signal?: AbortSignal): Promise<string> {
  const url = `${config.baseUrl}/api/v2/ocr/jobs`
  const optionalPayload = {
    useDocOrientationClassify: input.useDocOrientationClassify ?? false,
    useDocUnwarping: input.useDocUnwarping ?? false,
    useChartRecognition: input.useChartRecognition ?? false,
  }
  const headers = { Authorization: `bearer ${config.token}` }
  let response: Response
  if (input.fileUrl !== undefined) {
    response = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileUrl: input.fileUrl, model: config.model, optionalPayload }),
      signal: signal ?? null,
    })
  } else if (input.filePath !== undefined) {
    const { readFile } = await import('node:fs/promises')
    const bytes = await readFile(input.filePath).catch((error: unknown) => {
      throw new OcrError(`cannot read file: ${input.filePath}`, String(error))
    })
    const name = input.filePath.split(/[\\/]/).pop() ?? 'document'
    const form = new FormData()
    form.append('model', config.model)
    form.append('optionalPayload', JSON.stringify(optionalPayload))
    form.append('file', new Blob([new Uint8Array(bytes)]), name)
    response = await fetch(url, { method: 'POST', headers, body: form, signal: signal ?? null })
  } else {
    throw new OcrError('either filePath or fileUrl is required')
  }
  const body = await readJson(response, 'OCR job submit') as { data?: { jobId?: string } }
  const jobId = body.data?.jobId
  if (typeof jobId !== 'string' || jobId === '') throw new OcrError('OCR job submit returned no jobId', body)
  return jobId
}

/** Poll the job until done/failed, returning the JSONL result URL. */
async function awaitResultUrl(jobId: string, config: PaddleConfig, signal?: AbortSignal): Promise<{ jsonlUrl: string; extractedPages: number | undefined }> {
  const deadline = Date.now() + config.maxWaitMs
  const headers = { Authorization: `bearer ${config.token}` }
  for (;;) {
    if (signal?.aborted) throw new OcrError('OCR cancelled')
    if (Date.now() > deadline) throw new OcrError('OCR timed out; query the job manually later')
    const response = await fetch(`${config.baseUrl}/api/v2/ocr/jobs/${jobId}`, { headers, signal: signal ?? null })
    const body = await readJson(response, 'OCR job query') as {
      data?: {
        state?: string
        errorMsg?: string
        extractProgress?: { extractedPages?: number }
        resultUrl?: { jsonUrl?: string }
      }
    }
    const data = body.data ?? {}
    const state = data.state
    if (state === 'done') {
      const jsonlUrl = data.resultUrl?.jsonUrl
      if (typeof jsonlUrl !== 'string' || jsonlUrl === '') throw new OcrError('OCR done but no result URL', body)
      return { jsonlUrl, extractedPages: data.extractProgress?.extractedPages }
    }
    if (state === 'failed') throw new OcrError(`OCR failed: ${data.errorMsg ?? 'unknown'}`, body)
    await sleep(config.pollIntervalMs, signal)
  }
}

/** Fold the JSONL result into one markdown document. */
async function readMarkdown(jsonlUrl: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(jsonlUrl, { signal: signal ?? null })
  if (!response.ok) throw new OcrError(`OCR result download failed with HTTP ${response.status}`)
  const text = await response.text()
  const parts: string[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    try {
      const parsed = JSON.parse(trimmed) as {
        result?: { layoutParsingResults?: { markdown?: { text?: string } }[] }
      }
      for (const result of parsed.result?.layoutParsingResults ?? []) {
        const markdown = result.markdown?.text
        if (typeof markdown === 'string' && markdown.trim() !== '') parts.push(markdown)
      }
    } catch {
      // A malformed line is skipped; the rest of the document still folds.
    }
  }
  return parts.join('\n\n')
}

/** Run PaddleOCR end to end and return the folded markdown. */
export async function runPaddleOcr(input: PaddleInput, config: PaddleConfig, signal?: AbortSignal): Promise<OcrOutcome> {
  const jobId = await submit(input, config, signal)
  const { jsonlUrl, extractedPages } = await awaitResultUrl(jobId, config, signal)
  const markdown = await readMarkdown(jsonlUrl, signal)
  return { jobId, extractedPages, markdown }
}
