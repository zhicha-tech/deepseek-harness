import { clientBundle } from '../../client/tsdown.client.ts'

// Host entries: the package glue, the runtime (OCR service + preset manager),
// and the preset-scoped OCR tools plugin. The browser client bundle is emitted
// alongside by the shared preset.
export default clientBundle(import.meta.dirname, [
  'lib/types/index.js',
  'lib/types/host/runtime.js',
  'lib/types/host/ocr-tools.js',
])
