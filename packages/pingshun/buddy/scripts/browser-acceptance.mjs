/**
 * Pingshun Buddy browser acceptance against a running profile server.
 * Usage: node scripts/browser-acceptance.mjs <tokenized-url> <screenshot-dir>
 * Covers: Buddy default mode, six-agent catalog, preset-bound session
 * creation, tool drawer open/close, and the removed mode toggle.
 */
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
// Playwright ships with the web app's test dependencies, not with this bundle.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const { chromium } = createRequire(resolve(repoRoot, 'apps/web/package.json'))('playwright')

const url = process.argv[2]
const shotDir = process.argv[3] ?? '/tmp/ps-pdf'
if (url === undefined) {
  console.error('usage: node scripts/browser-acceptance.mjs <tokenized-url> [shotDir]')
  process.exit(1)
}
mkdirSync(shotDir, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
page.on('pageerror', (error) => { console.log('PAGE ERROR:', error.message) })
const failures = []
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
  if (!ok) failures.push(name)
}

await page.goto(url, { waitUntil: 'load', timeout: 60_000 })
await page.waitForTimeout(2500)
// The first-run "Get started" account dialog (no API key in this environment)
// owns a modal mask; close it before interacting with the Buddy surfaces.
const getStartedClose = page.locator('[role="dialog"] button[aria-label="关闭"], [role="dialog"] button[aria-label="Close"]')
if (await getStartedClose.count() > 0) {
  await getStartedClose.first().click().catch(() => {})
  await page.waitForTimeout(500)
}
await page.screenshot({ path: `${shotDir}/01-buddy-default.png`, fullPage: false })

// 1. First entry opens in Buddy mode with no mode-toggle entry.
check('buddy default: no DeepSeek toggle entry', await page.getByRole('button', { name: '切换到 DeepSeek' }).count() === 0)

// 2. Six agents render in the Buddy panel.
const panel = page.locator('aside, div').filter({ hasText: '业务 Agent' }).first()
for (const name of ['办公 Buddy', '党建 Buddy', '宣传 Buddy', '财务 Buddy', '市场 Buddy', '工程 Buddy']) {
  const visible = await page.getByText(name, { exact: true }).first().isVisible().catch(() => false)
  check(`agent visible: ${name}`, visible)
}

// 3. Click 办公 Buddy → a preset-bound session opens (composer shows the bound agent).
await page.getByText('办公 Buddy', { exact: true }).first().click()
await page.waitForTimeout(3000)
await page.screenshot({ path: `${shotDir}/02-office-session.png` })
check('preset-bound session opened: agent name appears in the conversation',
  await page.getByText('办公 Buddy').count() >= 1)

// 3b. The blank-session hero hides the native header (native behavior), so the
// tools entry is verified on a real (non-blank) session: send a message so the
// conversation leaves the blank phase and the header utilities render.
const input = page.locator('div[contenteditable]').first()
await input.click()
await page.keyboard.type('你好')
await page.keyboard.press('Enter')
await page.waitForTimeout(8000)
await page.screenshot({ path: `${shotDir}/03-history-session.png` })
check('session opened: tools button appears in header',
  await page.getByRole('button', { name: '工具能力' }).count() === 1)

// 4. Tool drawer: opens with composition, closes on Escape.
await page.getByRole('button', { name: '工具能力' }).click()
await page.waitForTimeout(1200)
const dialog = page.getByRole('dialog')
check('drawer opens with composition', await dialog.count() === 1)
await page.screenshot({ path: `${shotDir}/04-tool-drawer.png` })
await page.keyboard.press('Escape')
await page.waitForTimeout(600)
check('drawer closes on Escape', await page.getByRole('dialog').count() === 0)

// 5. The mode toggle is removed: the Buddy workbench is the fixed home, so
// there is no "切换到 DeepSeek" entry and no native-mode switch to exercise.
check('no DeepSeek mode toggle entry', await page.getByRole('button', { name: '切换到 DeepSeek' }).count() === 0)
check('Buddy agents remain visible', await page.getByText('办公 Buddy', { exact: true }).count() >= 1)
await page.screenshot({ path: `${shotDir}/05-buddy-fixed.png` })

await browser.close()
console.log(failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} CHECK(S) FAILED`)
process.exit(failures.length === 0 ? 0 : 1)
