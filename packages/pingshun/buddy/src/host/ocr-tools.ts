/**
 * The two model-facing OCR tools, registered only inside the Pingshun business
 * presets. They read the OCR tokens from well-known process environment
 * variables (bridged from Settings by the runtime plugin) and call the cloud
 * clients directly — no Host-service injection, because preset scopes cannot
 * inject a Host-level service. The native DeepSeek preset never mounts this
 * row, so it never exposes the tools.
 *
 * @module @deepseek-ai/dsh-pingshun-buddy/ocr-tools
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { runPaddleOcr } from './ocr-paddle.ts'
import { runMineruOcr } from './ocr-mineru.ts'

/** Cordis plugin name. */
export const name = 'pingshun-ocr-tools'

/** Only the tool registry is needed; tokens come from the environment. */
export const inject = ['tools']

/** Environment variable names (kept in sync with the runtime plugin). */
const ENV = {
  paddleToken: 'PINGSHUN_PADDLE_OCR_TOKEN',
  mineruToken: 'PINGSHUN_MINERU_OCR_TOKEN',
  paddleBaseUrl: 'PINGSHUN_PADDLE_OCR_BASE_URL',
  paddleModel: 'PINGSHUN_PADDLE_OCR_MODEL',
  mineruBaseUrl: 'PINGSHUN_MINERU_BASE_URL',
  mineruModelVersion: 'PINGSHUN_MINERU_MODEL_VERSION',
} as const

/** Plain process-env access (the client base config narrows process.env). */
const env = process.env as Record<string, string | undefined>

/** Read a required token from the environment, with an actionable error. */
function requiredToken(key: string, label: string): string {
  const token = env[key]
  if (token === undefined || token === '') {
    throw new Error(`${label} token 未配置：请先在平顺 Buddy 设置中填写 ${label} 的 API key`)
  }
  return token
}

/** Validate the file-source arguments: exactly one of a local path or a URL. */
function sourceOf(args: { file_path?: string; file_url?: string }): { filePath?: string; fileUrl?: string } {
  const filePath = typeof args.file_path === 'string' && args.file_path.trim() !== '' ? args.file_path : undefined
  const fileUrl = typeof args.file_url === 'string' && args.file_url.trim() !== '' ? args.file_url : undefined
  if (filePath === undefined && fileUrl === undefined) {
    throw new Error('请提供 file_path（本地文件）或 file_url（远程文件）其中之一')
  }
  return { ...filePath !== undefined ? { filePath } : {}, ...fileUrl !== undefined ? { fileUrl } : {} }
}

/** Registers the two OCR tools on the current preset's tool registry. */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'paddle_ocr',
    description: '用 PaddleOCR（PaddleOCR-VL）识别扫描件/图片/PDF 中的文字与表格，返回 Markdown。适合版式复杂的扫描材料。需要先在平顺 Buddy 设置中配置 PaddleOCR token。',
    parameters: {
      file_path: { type: 'string', description: '本地文件路径（扫描件/图片/PDF 等），与 file_url 二选一。' },
      file_url: { type: 'string', description: '远程文件 URL，与 file_path 二选一。' },
      useDocOrientationClassify: { type: 'boolean', description: '是否启用文档方向分类，默认 false。' },
      useDocUnwarping: { type: 'boolean', description: '是否启用文档矫正，默认 false。' },
      useChartRecognition: { type: 'boolean', description: '是否启用图表识别，默认 false。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          jobId: { type: 'string', required: true },
          extractedPages: { type: 'number' },
          markdown: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text' as const, text: value.markdown.trim() !== '' ? value.markdown : '(未识别出文字内容)' }],
    },
    async execute(args, exec) {
      const outcome = await runPaddleOcr({
        ...sourceOf(args),
        ...args.useDocOrientationClassify !== undefined ? { useDocOrientationClassify: args.useDocOrientationClassify } : {},
        ...args.useDocUnwarping !== undefined ? { useDocUnwarping: args.useDocUnwarping } : {},
        ...args.useChartRecognition !== undefined ? { useChartRecognition: args.useChartRecognition } : {},
      }, {
        token: requiredToken(ENV.paddleToken, 'PaddleOCR'),
        baseUrl: env[ENV.paddleBaseUrl] ?? 'https://paddleocr.aistudio-app.com',
        model: env[ENV.paddleModel] ?? 'PaddleOCR-VL-1.6',
        pollIntervalMs: 5000,
        maxWaitMs: 600000,
      }, exec.signal)
      return {
        jobId: outcome.jobId,
        markdown: outcome.markdown,
        ...outcome.extractedPages !== undefined ? { extractedPages: outcome.extractedPages } : {},
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'mineru_ocr',
    description: '用 MinerU 精准解析识别 PDF/图片/Office 文档为结构化 Markdown（支持表格、公式、多栏版式），返回 Markdown。需要先在平顺 Buddy 设置中配置 MinerU token。',
    parameters: {
      file_path: { type: 'string', description: '本地文件路径（PDF/图片/Office 文档），与 file_url 二选一。' },
      file_url: { type: 'string', description: '远程文件 URL，与 file_path 二选一。' },
      isOcr: { type: 'boolean', description: '是否强制启用 OCR，默认 false。' },
      enableFormula: { type: 'boolean', description: '是否识别公式，默认 true。' },
      enableTable: { type: 'boolean', description: '是否识别表格，默认 true。' },
      language: { type: 'string', description: '文档语言，默认 ch（中文）。' },
      pageRanges: { type: 'string', description: '页码范围，如 "1-10" 或 "2,4-6"。' },
      extraFormats: { type: 'array', items: { type: 'string' }, description: '额外导出格式：docx/html/latex。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          jobId: { type: 'string', required: true },
          markdown: { type: 'string', required: true },
          zipUrl: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text' as const, text: value.markdown.trim() !== '' ? value.markdown : '(未识别出文字内容)' }],
    },
    async execute(args, exec) {
      const outcome = await runMineruOcr({
        ...sourceOf(args),
        ...args.isOcr !== undefined ? { isOcr: args.isOcr } : {},
        ...args.enableFormula !== undefined ? { enableFormula: args.enableFormula } : {},
        ...args.enableTable !== undefined ? { enableTable: args.enableTable } : {},
        ...args.language !== undefined ? { language: args.language } : {},
        ...args.pageRanges !== undefined ? { pageRanges: args.pageRanges } : {},
        ...args.extraFormats !== undefined ? { extraFormats: args.extraFormats } : {},
      }, {
        token: requiredToken(ENV.mineruToken, 'MinerU'),
        baseUrl: env[ENV.mineruBaseUrl] ?? 'https://mineru.net',
        modelVersion: env[ENV.mineruModelVersion] ?? 'vlm',
        pollIntervalMs: 5000,
        maxWaitMs: 600000,
      }, exec.signal)
      return { jobId: outcome.jobId, markdown: outcome.markdown, zipUrl: outcome.zipUrl }
    },
  }))
}
