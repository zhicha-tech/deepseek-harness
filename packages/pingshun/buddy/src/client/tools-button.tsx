/**
 * Buddy tool-capability drawer: the `conversation.session.header.utilities`
 * occupant in Buddy mode.
 *
 * The button opens an overlay drawer that shows the current session's bound
 * agent composition — real Host state from the plugin inventory remote
 * (`pluginInventory.list()`), grouped by business area with each row's
 * effective enablement and fiber phase. It is a view: the drawer executes
 * nothing and exposes no tool executors or configuration. The entry is
 * session-scoped, so switching sessions remounts it and the drawer closes
 * with any in-flight read discarded.
 */
import type { AgentPresetPluginGroup, PluginInventoryEntry } from '@deepseek-ai/dsh-host-plugin-inventory'
import type { PluginLocalizedMeta } from '@deepseek-ai/dsh-package-manifest'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NS } from './index.ts'
import { modeStore } from './mode-store.ts'
import type { PingshunLocaleKey } from './locales.ts'
import css from './drawer.module.css'

/** The plugin-inventory answer the drawer renders. */
interface InventoryAnswer {
  readonly entries: readonly PluginInventoryEntry[]
  readonly agentPresets?: readonly AgentPresetPluginGroup[] | undefined
}

/** Injected share: the read-only inventory read. */
export interface ToolDrawerInjected {
  /** Read the plugin inventory snapshot from the Host. */
  listInventory: () => Promise<InventoryAnswer>
}

/** Session-scoped occupant props. */
export type ToolsButtonProps = PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<typeof NS>
  & InjectFace<ToolDrawerInjected>

/** Business grouping for one composition row, by its module name. */
type DrawerGroup = 'files' | 'documents' | 'retrieval' | 'tasks' | 'other'

const GROUP_KEYS: readonly DrawerGroup[] = ['files', 'documents', 'retrieval', 'tasks', 'other']

/** Map a composition row's module name to its drawer group. */
function groupOf(moduleName: string): DrawerGroup {
  if (moduleName.includes('tool-fs')) return 'files'
  if (moduleName.includes('tool-office') || moduleName.includes('tool-present') || moduleName.includes('skill-office')) return 'documents'
  if (moduleName.includes('tool-web') || moduleName.includes('tool-skill')) return 'retrieval'
  if (moduleName.includes('tool-todo') || moduleName.includes('tool-goal') || moduleName.includes('tool-schedule') || moduleName.includes('tool-ask-user')) return 'tasks'
  return 'other'
}

/** Readable row label: localized meta first, then the composition row id. */
function rowLabel(entryId: string | null, moduleName: string, meta: PluginLocalizedMeta | undefined): string {
  const named = meta?.title
  if (named !== undefined) return typeof named === 'string' ? named : named.en
  return entryId ?? moduleName
}

/** The utilities occupant: one button; the drawer renders through a portal. */
export function ToolsButtonSlot({ t, useProjection, listInventory }: ToolsButtonProps) {
  const [open, setOpen] = useState(false)
  const preset = useProjection('agentPreset')
  if (modeStore.getSnapshot() !== 'buddy' || typeof preset !== 'string') return null
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => { setOpen(true) }}>
        {t('drawer.title')}
      </Button>
      {open && (
        <ToolDrawer
          preset={preset}
          listInventory={listInventory}
          t={t}
          onClose={() => { setOpen(false) }}
        />
      )}
    </>
  )
}

/** Overlay drawer body: loads the composition once per open, per session mount. */
function ToolDrawer({ preset, listInventory, t, onClose }: {
  readonly preset: string
  readonly listInventory: ToolDrawerInjected['listInventory']
  readonly t: (key: PingshunLocaleKey) => string
  readonly onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [snapshot, setSnapshot] = useState<readonly AgentPresetPluginGroup[] | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  useEffect(() => {
    const controller = new AbortController()
    listInventory().then((answer) => {
      if (!controller.signal.aborted) setSnapshot(answer.agentPresets ?? [])
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { controller.abort() }
  }, [listInventory])
  // Esc closes; focus management moves to the drawer on open and back on close.
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previousFocus?.focus?.()
    }
  }, [onClose])
  const group = snapshot?.find(entry => entry.id === preset)
  return createPortal(
    <div className={css.overlay} onClick={onClose} role="presentation">
      <aside
        className={css.drawer}
        onClick={(event) => { event.stopPropagation() }}
        role="dialog"
        aria-label={t('drawer.title')}
      >
        <header className={css.head}>
          <span className={css.title}>{t('drawer.title')}</span>
          <button ref={closeRef} type="button" className={css.close} onClick={onClose} aria-label={t('drawer.title')}>×</button>
        </header>
        {error !== undefined && <div className={css.empty}>{error}</div>}
        {error === undefined && snapshot === undefined && <div className={css.empty}>…</div>}
        {group === undefined && snapshot !== undefined && <div className={css.empty}>{t('drawer.empty')}</div>}
        {group !== undefined && GROUP_KEYS.map((key) => {
          const rows = group.rows.filter(row => groupOf(row.moduleName) === key)
          if (rows.length === 0) return null
          return (
            <section key={key}>
              <div className={css.groupLabel}>{t(`drawer.group.${key}` as PingshunLocaleKey)}</div>
              {rows.map((row, index) => {
                const failed = row.fiberPhase === 'failed'
                const stateKey: PingshunLocaleKey = failed
                  ? 'drawer.state.failed'
                  : row.enabled === true
                    ? 'drawer.state.active'
                    : row.enabled === 'conditional' ? 'drawer.state.conditional' : 'drawer.state.inactive'
                return (
                  <div key={row.entryId ?? `${row.moduleName}.${String(index)}`} className={css.row}>
                    <span className={css.rowName}>{rowLabel(row.entryId, row.moduleName, row.meta)}</span>
                    <span className={`${css.state}${failed ? ` ${css.stateFailed}` : row.enabled === true ? ` ${css.stateActive}` : ''}`}>
                      {t(stateKey)}
                    </span>
                  </div>
                )
              })}
            </section>
          )
        })}
      </aside>
    </div>,
    document.body,
  )
}
