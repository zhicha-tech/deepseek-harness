/**
 * Models settings section for Buddy mode: shadows the native `settings.section`
 * id `models` (a list slot) with a model picker over the discovered catalog.
 * The endpoint and API key are managed and never displayed; users only choose
 * the default model, persisted through the `agent-default-model` settings
 * namespace. DeepSeek mode disposes the shadow and the native editor renders
 * again.
 */
import { useEffect, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './index.ts'
import type { PingshunLocaleKey } from './locales.ts'
import type { ModelSelectionInfo } from './model-select.ts'

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
  const [info, setInfo] = useState<ModelSelectionInfo | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    readModelSelection().then(value => {
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
            <select
              value={info.current}
              disabled={saving}
              onChange={(event) => {
                const model = event.target.value
                setSaving(true)
                selectModel(model).then(() => {
                  setInfo(previous => previous === undefined ? previous : { ...previous, current: model })
                }).catch((reason: unknown) => {
                  setError(reason instanceof Error ? reason.message : String(reason))
                }).finally(() => { setSaving(false) })
              }}
              style={{ fontSize: '12.5px', padding: '4px 8px', maxWidth: '320px' }}
            >
              {info.models.map(model => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

/** Locale keys used by this component. */
export type ModelSectionLocaleKey = Extract<PingshunLocaleKey,
  'model.sectionHint' | 'model.builtin' | 'model.defaultModel'>
