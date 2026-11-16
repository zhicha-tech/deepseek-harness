/**
 * Brand manager: swaps the visible product brand while Buddy mode is active
 * and restores the native DeepSeek Harness brand on exit.
 *
 * Three mechanisms, each with its own reversible teardown:
 *
 * - Brand slots: `sidebar.brand.mark`, `sidebar.brand.name`, and
 *   `conversation.hero.brand.mark` are official `single` slots; registering
 *   at shadow priority replaces the fish fallback and disposing ours makes
 *   the native occupant render again.
 * - Document title: the native `DocumentTitle` projection keeps writing
 *   `{session} — {productTitle}` whenever its React state changes, so a
 *   one-shot write would be overwritten. A MutationObserver on the title
 *   rewrites every native-form title to the Buddy form instead; the
 *   rewritten value is shaped so the observer ignores its own write.
 * - Favicon: the native page ships static icon links and nothing manages
 *   them at runtime, so enter replaces their hrefs and exit restores the
 *   recorded originals.
 *
 * @module
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { BrandMark, BrandName, HeroBrandMark, FAVICON_HREF, BRAND_NAME } from './brand-assets.tsx'

/** Lowest priority wins the `single` shadow; the native occupant stays at 0. */
const SHADOW_PRIORITY = -10

/** Product titles the native `DocumentTitle` projection writes. */
const NATIVE_PRODUCT_TITLES = ['DSH 本地构建', 'DSH Local Build'] as const

/** Separator the native title projection puts between session and product. */
const TITLE_SEPARATOR = ' — '

/** Native hero slogan texts the blank home renders, mapped to Buddy copy.
 *
 * The hero headline lives in `ui-conversation`'s own locale namespace; the
 * locale registry gives every `(namespace, locale)` pair a single owner, so
 * there is no official way to contribute replacement copy — the rewrite is
 * the only reversible lever, same as the title. */
const HERO_TEXT_MAP: Readonly<Record<string, string>> = {
  探索未至之境: BRAND_NAME,
  'Into the Unknown': BRAND_NAME,
}

/** Native preview-badge texts; emptied because they mark DeepSeek previews. */
const HERO_HIDDEN_TEXTS: ReadonlySet<string> = new Set(['预览版', 'Preview'])

/** Rewrite a native-form document title to the Buddy form.
 *
 * Recognized native forms are the bare product title and
 * `{anything}${TITLE_SEPARATOR}{product title}`; anything else is returned
 * unchanged so unknown native variants never get mangled. Buddy-form input
 * falls through unchanged, which is what makes the observer ignore its own
 * write.
 */
export function rewriteTitle(raw: string): string {
  for (const productTitle of NATIVE_PRODUCT_TITLES) {
    if (raw === productTitle) return BRAND_NAME
    const native = `${TITLE_SEPARATOR}${productTitle}`
    if (raw.endsWith(native)) return `${raw.slice(0, raw.length - native.length)}${TITLE_SEPARATOR}${BRAND_NAME}`
  }
  return raw
}

/** One mode-driven brand swap with idempotent enter/exit. */
export interface BrandManager {
  /** Activate the Buddy brand; a no-op while already active. */
  enter(): void
  /** Restore the native brand; a no-op while absent. */
  exit(): void
}

/** Create the mode-driven brand pair for one client context. */
export function createBrandManager(ctx: Context): BrandManager {
  let disposers: readonly (() => void)[] = []
  let titleObserver: MutationObserver | undefined
  let heroObserver: MutationObserver | undefined
  let savedIcons: readonly { element: HTMLLinkElement; href: string | null }[] = []
  /** Rewritten hero text nodes with their originals, restored on exit; React
   * never reconciles externally mutated text, so a plain disconnect would
   * leave Buddy copy inside the native UI. */
  let heroRewrites: { node: Text; original: string }[] = []

  /** Rewrite one text node when it carries a known native hero string. */
  const rewriteHeroNode = (node: Node): void => {
    if (node.nodeType !== Node.TEXT_NODE) return
    const text = node as Text
    const value = text.nodeValue ?? ''
    const mapped = HERO_TEXT_MAP[value]
    if (mapped !== undefined) {
      if (value !== mapped) {
        heroRewrites.push({ node: text, original: value })
        text.nodeValue = mapped
      }
      return
    }
    if (HERO_HIDDEN_TEXTS.has(value)) {
      heroRewrites.push({ node: text, original: value })
      text.nodeValue = ''
    }
  }

  /** One pass over the current DOM; only the hero strings match, so this
   * stays cheap enough for a one-shot entry scan. */
  const rewriteHeroTexts = (root: ParentNode): void => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let current = walker.nextNode()
    while (current !== null) {
      rewriteHeroNode(current)
      current = walker.nextNode()
    }
  }

  const watchHero = (): void => {
    const observer = (mutations: MutationRecord[]): void => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          // Native renders insert whole elements; scan their text descendants.
          if (node.nodeType === Node.TEXT_NODE) rewriteHeroNode(node)
          else if (node.nodeType === Node.ELEMENT_NODE) rewriteHeroTexts(node as ParentNode)
        }
        if (mutation.type === 'characterData') rewriteHeroNode(mutation.target)
      }
    }
    const impl = new MutationObserver(observer)
    impl.observe(document.body, { childList: true, subtree: true, characterData: true })
    heroObserver = impl
    rewriteHeroTexts(document.body)
  }

  const unwatchHero = (): void => {
    heroObserver?.disconnect()
    heroObserver = undefined
    for (const { node, original } of heroRewrites) {
      if (node.isConnected) node.nodeValue = original
    }
    heroRewrites = []
  }

  const watchTitle = (): void => {
    const observer = new MutationObserver(() => {
      const desired = rewriteTitle(document.title)
      if (document.title !== desired) document.title = desired
    })
    observer.observe(document.head, { childList: true, subtree: true, characterData: true })
    titleObserver = observer
    // Align the current title without waiting for the next native write.
    const desired = rewriteTitle(document.title)
    if (document.title !== desired) document.title = desired
  }

  const unwatchTitle = (): void => {
    titleObserver?.disconnect()
    titleObserver = undefined
    // The native projection only writes on its own state changes, so restore
    // the bare product title ourselves when the current title is Buddy-form.
    const restored = document.title.endsWith(`${TITLE_SEPARATOR}${BRAND_NAME}`)
      ? `${document.title.slice(0, document.title.length - BRAND_NAME.length - TITLE_SEPARATOR.length)}${TITLE_SEPARATOR}${NATIVE_PRODUCT_TITLES[0]}`
      : document.title === BRAND_NAME ? NATIVE_PRODUCT_TITLES[0] : document.title
    document.title = restored
  }

  const replaceIcons = (): void => {
    const icons = document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]')
    savedIcons = Array.from(icons, element => ({ element, href: element.getAttribute('href') }))
    for (const { element } of savedIcons) element.setAttribute('href', FAVICON_HREF)
  }

  const restoreIcons = (): void => {
    for (const { element, href } of savedIcons) {
      if (href === null) element.removeAttribute('href')
      else element.setAttribute('href', href)
    }
    savedIcons = []
  }

  const enter = (): void => {
    if (disposers.length > 0) return
    const installed: (() => void)[] = []
    try {
      // The three slots carry different owner-prop types, so each registers
      // with its own precise component signature instead of a shared loop.
      installed.unshift(ctx.slots.inject('sidebar.brand.name', () =>
        ctx.slots.register({ name: 'sidebar.brand.name', priority: SHADOW_PRIORITY }, BrandName)))
      installed.unshift(ctx.slots.inject('sidebar.brand.mark', () =>
        ctx.slots.register({ name: 'sidebar.brand.mark', priority: SHADOW_PRIORITY }, BrandMark)))
      installed.unshift(ctx.slots.inject('conversation.hero.brand.mark', () =>
        ctx.slots.register({ name: 'conversation.hero.brand.mark', priority: SHADOW_PRIORITY }, HeroBrandMark)))
      disposers = installed
    } catch (reason: unknown) {
      for (const dispose of installed) dispose()
      console.error('pingshun-buddy: brand slots failed to install; staying on the native brand:', reason)
      return
    }
    watchTitle()
    watchHero()
    replaceIcons()
  }

  const exit = (): void => {
    for (const dispose of disposers) dispose()
    disposers = []
    unwatchTitle()
    unwatchHero()
    restoreIcons()
  }

  return { enter, exit }
}
