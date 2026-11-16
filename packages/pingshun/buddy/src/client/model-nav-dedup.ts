/**
 * Models-section navigation dedup for Buddy mode.
 *
 * `settings.section` is a LIST slot: the settings shell builds its nav from
 * the raw ledger (`ctx.slots.entries`), which lists every registration —
 * including the shadowed native `models` entry. Shadowing only elects the
 * content occupant, so the nav would show two "模型" rows (ours order 9,
 * native order 10). This observer hides the LAST "模型" nav row (the native
 * one) while Buddy mode is active, and restores it on exit. The content area
 * is already our read-only section through the shadow.
 *
 * The settings shell owns the nav rows; there is no official slot to remove
 * one list entry from the nav, so this is the same DOM-level lever the brand
 * manager uses for the native hero slogan.
 *
 * @module
 */

/** One mode-driven nav dedup with idempotent enter/exit. */
export interface ModelNavDedup {
  enter(): void
  exit(): void
}

/** Create the nav dedup for one document. */
export function createModelNavDedup(): ModelNavDedup {
  let observer: MutationObserver | undefined
  const hidden: HTMLElement[] = []

  const dedup = (): void => {
    // The settings shell renders one `navCell` row per registration. Hide the
    // whole CELL (not just its label), targeting the native row that sorts
    // last (our section registers order 9, the native one order 10). Match
    // both locale forms: our section's label is always 模型; the native row
    // follows the shell locale (模型 in zh, Models in en).
    const rows = [...document.querySelectorAll<HTMLElement>('[class*="navCell"]')]
      .filter((el) => {
        const text = el.textContent?.trim()
        return (text === '模型' || text === 'Models') && el.style.display !== 'none'
      })
    if (rows.length < 2) return
    const native = rows[rows.length - 1]
    if (native !== undefined) {
      hidden.push(native)
      native.style.display = 'none'
    }
  }

  const enter = (): void => {
    if (observer !== undefined) return
    observer = new MutationObserver(() => { dedup() })
    observer.observe(document.body, { childList: true, subtree: true })
    dedup()
  }

  const exit = (): void => {
    observer?.disconnect()
    observer = undefined
    for (const el of hidden) el.style.display = ''
    hidden.length = 0
  }

  return { enter, exit }
}
