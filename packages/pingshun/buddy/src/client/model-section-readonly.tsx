/**
 * Models settings section for Buddy mode: shadows the native `settings.section`
 * id `models` (a list slot) with a model picker over the discovered catalog.
 * The endpoint and API key are managed and never displayed; users only choose
 * the default model, persisted through the `agent-default-model` settings
 * namespace. DeepSeek mode disposes the shadow and the native editor renders
 * again.
 *
 * The picker uses the design-system Menu (not a native select), so the
 * dropdown items follow the same visual language as the composer chip:
 * rounded menu surface, hover highlight, and a check mark on the current
 * model.
 */
import { useEffect, useState } from 'react'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './index.ts'
import type { PingshunLocaleKey } from './locales.ts'
import type { ModelSelectionInfo } from './model-select.ts'
import css from './model-select.module.css'

/** Check mark for the currently selected model row. */
function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 7.5L5.5 10L11 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Injected share: catalog reads and selection writes over the settings remote. */
export interface ModelSectionInjected {
  readonly readModelSelection: () => Promise<ModelSelectionInfo>
  readonly selectModel: (model: string) => Promise<void>
}

/** `settings.section` occupant props. */
export type ModelSectionProps = PropsRuntime<'settings.section'>
  & PropsLocale<typeof NS>
  & InjectFace<ModelSectionInjected>

/** Model picker: choose the default model from the managed catalog. */
export function ModelSectionReadonly({ readModelSelection, selectModel, t }: ModelSectionProps) {
  const [open, setOpen] = useState(false)
  const [info, setInfo] = useState<ModelSelectionInfo | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    readModelSelection().then((value) => {
      if (!controller.signal.aborted) setInfo(value)
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { controller.abort() }
  }, [readModelSelection])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '4px 0' }}>
      <p style={{ margin: 0, fontSize: '13px', color: 'var(--dsw-alias-label-secondary)' }}>
        {t('model.sectionHint')}
      </p>
      {error !== undefined && <div style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: '13px' }}>{error}</div>}
      {info !== undefined && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '10px',
          padding: '14px 16px', border: '0.5px solid var(--dsw-alias-border-l3)',
          borderRadius: 'var(--dsw-radius-md)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: '14px' }}>{t('model.builtin')}</span>
          </div>
          <div style={{ fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--dsw-alias-label-secondary)' }}>{t('model.defaultModel')}: </span>
            <Menu
              open={open}
              side="bottom"
              portal
              autoFocus
              anchor={
                <button
                  type="button"
                  className={css.trigger}
                  disabled={saving}
                  aria-haspopup="menu"
                  aria-expanded={open}
                  onClick={() => { setOpen(value => !value) }}
                >
                  <span className={css.triggerLabel}>{info.current}</span>
                  <span className={css.triggerChevron}>▾</span>
                </button>
              }
              items={info.models.map(model => ({
                id: model,
                label: model,
                ...(model === info.current ? { icon: <CheckIcon /> } : {}),
              }))}
              onClose={() => { setOpen(false) }}
              onSelect={(id) => {
                setOpen(false)
                setSaving(true)
                selectModel(id).then(() => {
                  setInfo(previous => previous === undefined ? previous : { ...previous, current: id })
                }).catch((reason: unknown) => {
                  setError(reason instanceof Error ? reason.message : String(reason))
                }).finally(() => { setSaving(false) })
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/** Locale keys used by this component. */
export type ModelSectionLocaleKey = Extract<PingshunLocaleKey,
  'model.sectionHint' | 'model.builtin' | 'model.defaultModel'>
