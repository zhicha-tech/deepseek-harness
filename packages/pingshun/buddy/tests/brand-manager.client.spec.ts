// @vitest-environment jsdom
/**
 * Brand manager: slot takeover at shadow priority, native-title rewriting
 * (bare product title and session-suffixed form), rewrite self-stability,
 * favicon replacement with restore, and idempotent enter/exit.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createBrandManager, rewriteTitle } from '../src/client/brand-manager.ts'
import { FAVICON_HREF } from '../src/client/brand-assets.tsx'

type Registration = { readonly name: string; readonly options: Record<string, unknown> }

/** Slot registry double: records registrations per slot name. */
function makeSlots() {
  const registrations = new Map<string, Registration[]>()
  const ctx = {
    slots: {
      register: (options: Record<string, unknown>) => {
        const list = registrations.get(options.name as string) ?? []
        list.push({ name: options.name as string, options })
        registrations.set(options.name as string, list)
        return () => {
          const current = registrations.get(options.name as string) ?? []
          const index = current.findIndex(entry => entry.options === options)
          if (index >= 0) current.splice(index, 1)
        }
      },
      inject: (_slot: string, factory: () => () => void) => factory(),
    },
  }
  return { ctx, registrations }
}

/** Seed the jsdom head with a native-form title and icon links. */
function seedHead(): void {
  document.head.innerHTML = '<title>DSH 本地构建</title>'
    + '<link rel="icon" type="image/svg+xml" href="/favicon-dark.svg">'
    + '<link rel="icon" type="image/svg+xml" href="/favicon.svg">'
    + '<link rel="apple-touch-icon" href="/apple-touch-icon.png">'
}

/** Flush MutationObserver callbacks (microtask-scheduled). */
const flush = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0) })

afterEach(() => {
  document.head.innerHTML = ''
  document.title = ''
})

describe('rewriteTitle', () => {
  it('rewrites the bare native product titles', () => {
    expect(rewriteTitle('DSH 本地构建')).toBe('平顺 Buddy')
    expect(rewriteTitle('DSH Local Build')).toBe('平顺 Buddy')
  })

  it('rewrites session-suffixed native titles and keeps the session part', () => {
    expect(rewriteTitle('会议纪要 — DSH 本地构建')).toBe('会议纪要 — 平顺 Buddy')
    expect(rewriteTitle('Report draft — DSH Local Build')).toBe('Report draft — 平顺 Buddy')
  })

  it('leaves unknown forms and already-rewritten titles unchanged', () => {
    expect(rewriteTitle('平顺 Buddy')).toBe('平顺 Buddy')
    expect(rewriteTitle('会议纪要 — 平顺 Buddy')).toBe('会议纪要 — 平顺 Buddy')
    expect(rewriteTitle('与 DSH 无关的普通标题')).toBe('与 DSH 无关的普通标题')
  })
})

describe('pingshun buddy brand manager', () => {
  it('registers the three brand slots at shadow priority on enter', () => {
    seedHead()
    const { ctx, registrations } = makeSlots()
    const brand = createBrandManager(ctx as never)
    brand.enter()
    for (const slot of ['sidebar.brand.mark', 'sidebar.brand.name', 'conversation.hero.brand.mark']) {
      const rows = registrations.get(slot) ?? []
      expect(rows).toHaveLength(1)
      expect(rows[0]?.options.priority).toBe(-10)
    }
    brand.exit()
  })

  it('rewrites the live document title as the native projection writes it', async () => {
    seedHead()
    const { ctx } = makeSlots()
    const brand = createBrandManager(ctx as never)
    brand.enter()
    document.title = '会议纪要 — DSH 本地构建'
    await flush()
    expect(document.title).toBe('会议纪要 — 平顺 Buddy')
    document.title = 'DSH Local Build'
    await flush()
    expect(document.title).toBe('平顺 Buddy')
    brand.exit()
  })

  it('does not rewrite its own output (observer stays quiescent)', async () => {
    seedHead()
    const { ctx } = makeSlots()
    const brand = createBrandManager(ctx as never)
    brand.enter()
    document.title = 'DSH 本地构建'
    await flush()
    expect(document.title).toBe('平顺 Buddy')
    // A second flush must not mutate the rewritten value again.
    await flush()
    expect(document.title).toBe('平顺 Buddy')
    brand.exit()
  })

  it('rewrites native hero slogans and empties preview badges', async () => {
    seedHead()
    document.body.innerHTML = '<div><span>探索未至之境</span><span>预览版</span></div>'
    const { ctx } = makeSlots()
    const brand = createBrandManager(ctx as never)
    brand.enter()
    // The entry scan rewrote the pre-rendered hero copy.
    expect(document.body.textContent).toContain('平顺 Buddy')
    expect(document.body.textContent).not.toContain('探索未至之境')
    expect(document.body.textContent).not.toContain('预览版')
    // Later native renders are rewritten by the observer too.
    const span = document.createElement('span')
    span.textContent = 'Into the Unknown'
    document.body.firstElementChild?.append(span)
    await flush()
    expect(span.textContent).toBe('平顺 Buddy')
    brand.exit()
  })

  it('restores the native title and favicon hrefs on exit', () => {
    seedHead()
    const { ctx } = makeSlots()
    const brand = createBrandManager(ctx as never)
    brand.enter()
    const icons = document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]')
    for (const icon of icons) expect(icon.getAttribute('href')).toBe(FAVICON_HREF)
    brand.exit()
    expect(document.title).toBe('DSH 本地构建')
    const restored = [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]')]
    expect(restored.map(link => link.getAttribute('href'))).toEqual(['/favicon-dark.svg', '/favicon.svg', '/apple-touch-icon.png'])
  })

  it('stops rewriting after exit', async () => {
    seedHead()
    const { ctx } = makeSlots()
    const brand = createBrandManager(ctx as never)
    brand.enter()
    brand.exit()
    document.title = 'DSH 本地构建'
    await flush()
    expect(document.title).toBe('DSH 本地构建')
  })

  it('re-enters cleanly after exit and tolerates double enter', () => {
    seedHead()
    const { ctx, registrations } = makeSlots()
    const brand = createBrandManager(ctx as never)
    brand.enter()
    brand.enter()
    expect((registrations.get('sidebar.brand.mark') ?? [])).toHaveLength(1)
    brand.exit()
    expect(registrations.get('sidebar.brand.mark')).toHaveLength(0)
    brand.enter()
    expect((registrations.get('sidebar.brand.mark') ?? [])).toHaveLength(1)
    brand.exit()
  })
})
