import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const repoRoot = '/home/gx/work_project/dsh-development/deepseek-harness'
const { chromium } = createRequire(resolve(repoRoot, 'apps/web/package.json'))('playwright')

const url = process.argv[2]
if (!url) { console.error('usage: node brand-acceptance.mjs <url>'); process.exit(1) }

const browser = await chromium.launch()
const page = await browser.newPage()
const failures = []
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failures.push(name) }
const sleep = (ms) => page.waitForTimeout(ms)

const NATIVE_SLOGANS = ['探索未至之境', 'Into the Unknown']

await page.goto(url, { waitUntil: 'domcontentloaded' })
await sleep(6000)

// --- Buddy mode brand checks ---
check('web: document.title === 平顺 Buddy', (await page.title()) === '平顺 Buddy')
const icons = await page.evaluate(() => [...document.head.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')].map(l => l.getAttribute('href')))
check(`web: all favicon hrefs replaced (${icons.filter(h => h?.startsWith('data:image/svg+xml')).length}/3)`, icons.length === 3 && icons.every(h => h?.startsWith('data:image/svg+xml')))
const body = await page.locator('body').innerText()
check('web: sidebar shows 平顺 Buddy brand name', body.includes('平顺 Buddy'))
check('web: no DSH text visible', !body.includes('DSH') && !body.includes('本地构建'))
check('web: native slogan replaced', NATIVE_SLOGANS.every(s => !body.includes(s)))
const marks = await page.evaluate(() => [...document.querySelectorAll('svg')].filter(svg => svg.innerHTML.includes('1f6feb')).length)
check(`web: Pingshun marks rendered (${marks})`, marks >= 2)
const badges = await page.evaluate(() => [...document.querySelectorAll('*')].filter(el => el.children.length === 0 && ['预览版', 'Preview'].includes(el.textContent?.trim() ?? '')).length)
check('web: preview badge emptied', badges === 0)
await page.screenshot({ path: '/tmp/ps-pdf/brand-buddy-mode.png' })

// --- Switch to DeepSeek, verify native brand restores ---
const toDsh = page.getByRole('button', { name: /切换到 DeepSeek|Switch to DeepSeek/ })
if (await toDsh.count() === 0) { console.log('FAIL web: mode toggle missing'); process.exit(1) }
await toDsh.click(); await sleep(5000)
check('web: deepseek title restored', (await page.title()).includes('DSH'))
const icons2 = await page.evaluate(() => [...document.head.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')].map(l => l.getAttribute('href')))
check('web: native favicons restored', icons2.every(h => !h?.startsWith('data:image/svg+xml')))
const body2 = await page.locator('body').innerText()
check('web: native brand visible again (DSH/本地构建)', body2.includes('DSH') || body2.includes('本地构建'))
check('web: native slogan restored', NATIVE_SLOGANS.some(s => body2.includes(s)))
await page.screenshot({ path: '/tmp/ps-pdf/brand-deepseek-mode.png' })

// --- Back to Buddy ---
await page.getByRole('button', { name: /切换到平顺 Buddy|Switch to Pingshun Buddy/ }).click(); await sleep(5000)
check('web: back to Buddy, title is 平顺 Buddy again', (await page.title()) === '平顺 Buddy')
const icons3 = await page.evaluate(() => [...document.head.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')].map(l => l.getAttribute('href')))
check('web: favicons replaced again after round-trip', icons3.every(h => h?.startsWith('data:image/svg+xml')))
const body3 = await page.locator('body').innerText()
check('web: sidebar brand is 平顺 Buddy after round-trip', body3.includes('平顺 Buddy'))
check('web: no slogan after round-trip', NATIVE_SLOGANS.every(s => !body3.includes(s)))
await page.screenshot({ path: '/tmp/ps-pdf/brand-buddy-return.png' })

console.log(failures.length === 0 ? 'BRAND ALL CHECKS PASSED' : `${failures.length} FAILED`)
await browser.close()
process.exit(failures.length === 0 ? 0 : 1)
