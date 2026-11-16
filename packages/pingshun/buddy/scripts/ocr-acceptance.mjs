/**
 * Buddy OCR + mode-switch acceptance against a running profile server.
 * Usage: node scripts/ocr-acceptance.mjs <tokenized-url> <screenshot-dir>
 * Covers: six agents enabled, OCR settings dialog open/configure, and the
 * Host-side effect of switching to DeepSeek and back (presets re-register).
 */
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const { chromium } = createRequire(resolve(repoRoot, 'apps/web/package.json'))('playwright')

const url = process.argv[2]
const shotDir = process.argv[3] ?? '/tmp/ps-pdf'
if (url === undefined) { console.error('usage: node scripts/ocr-acceptance.mjs <url> [shotDir]'); process.exit(1) }
mkdirSync(shotDir, { recursive: true })

const browser = await chromium.launch({ timeout: 60000 })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
page.on('pageerror', e => console.log('PAGE ERROR:', e.message.slice(0, 200)))
page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200)) })
const failures = []
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failures.push(name) }

await page.goto(url, { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(5000)
const close = page.locator('[role="dialog"] button[aria-label="关闭"], [role="dialog"] button[aria-label="Close"]')
if (await close.count() > 0) await close.first().click().catch(() => {})
await page.waitForTimeout(1000)

// 1. Six agents enabled (dynamic registration healthy, OCR tools mounted).
let allEnabled = true
for (const name of ['办公 Buddy', '党建 Buddy', '宣传 Buddy', '财务 Buddy', '市场 Buddy', '工程 Buddy']) {
  const btn = page.getByRole('button', { name: new RegExp(name) }).first()
  const disabled = await btn.getAttribute('disabled').catch(() => 'missing')
  if (disabled !== null) allEnabled = false
}
check('six agents enabled (dynamic presets + OCR tools mounted)', allEnabled)

// 2. OCR settings lives in the sidebar's More menu (左下角"更多").
const more = page.getByRole('button', { name: /^更多$/ }).first()
await more.click()
await page.waitForTimeout(800)
const settingsItem = page.getByText('OCR 设置', { exact: true })
check('OCR settings entry in More menu', await settingsItem.count() === 1)
await settingsItem.click()
await page.waitForTimeout(1200)
const dialog = page.getByRole('dialog', { name: 'OCR 设置' })
check('OCR settings dialog opens', await dialog.count() === 1)
await page.screenshot({ path: `${shotDir}/ocr-settings.png` })
const bodyText = await dialog.innerText().catch(() => '')
check('shows token presence fields', bodyText.includes('PaddleOCR') && bodyText.includes('MinerU'))

// 3. Save a test token and confirm presence flips to configured.
await page.locator('input[type="password"]').first().fill('test-paddle-token')
await page.getByRole('button', { name: '保存', exact: true }).click()
await page.waitForTimeout(1500)
const afterSave = await dialog.innerText().catch(() => '')
check('save token succeeds (configured state or saved hint)',
  afterSave.includes('已保存') || afterSave.includes('已配置'))
await page.screenshot({ path: `${shotDir}/ocr-settings-saved.png` })
await page.keyboard.press('Escape')
await page.waitForTimeout(500)

// 4. Switch to DeepSeek (writes buddyMode=dsh → Host unregisters presets).
await page.getByRole('button', { name: '切换到 DeepSeek' }).click()
await page.waitForTimeout(1500)
check('DeepSeek mode: Buddy panel gone', await page.getByText('业务 Agent').count() === 0)
await page.screenshot({ path: `${shotDir}/ocr-deepseek-mode.png` })

// 5. Switch back to Buddy → presets re-register, six agents enabled again.
await page.getByRole('button', { name: '切换到平顺 Buddy' }).click()
await page.waitForTimeout(4000)
let backEnabled = true
for (const name of ['办公 Buddy', '党建 Buddy', '宣传 Buddy', '财务 Buddy', '市场 Buddy', '工程 Buddy']) {
  const btn = page.getByRole('button', { name: new RegExp(name) }).first()
  const disabled = await btn.getAttribute('disabled').catch(() => 'missing')
  if (disabled !== null) backEnabled = false
}
check('back to Buddy: six agents re-registered and enabled', backEnabled)
await page.screenshot({ path: `${shotDir}/ocr-buddy-back.png` })

await browser.close()
console.log(failures.length === 0 ? 'ALL OCR CHECKS PASSED' : `${failures.length} CHECK(S) FAILED`)
process.exit(failures.length === 0 ? 0 : 1)
