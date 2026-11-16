/**
 * Read-only Models settings section for Buddy mode: shadows the native
 * `settings.section` id `models` (a list slot) with a display-only summary
 * of the deployment's built-in model service — endpoint, catalog, and the
 * default model — with no add/edit/delete affordances. DeepSeek mode
 * disposes the shadow and the native editor renders again.
 */
import { useEffect, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './index.ts'
import type { PingshunLocaleKey } from './locales.ts'

/** One provider's read-only presentation, read from the Host settings. */
interface ProviderInfo {
  readonly displayName: string
  readonly baseUrl: string
  readonly models: readonly string[]
}

/** Injected share: read the built-in provider and the default model. */
export interface ModelSectionInjected {
  readonly readModelInfo: () => Promise<{ provider: ProviderInfo; defaultModel: string }>
}

/** `settings.section` occupant props. */
export type ModelSectionProps = PropsRuntime<'settings.section'>
  & PropsLocale<typeof NS>
  & InjectFace<ModelSectionInjected>

/** Read-only model-service summary: endpoint, catalog, default model. */
export function ModelSectionReadonly({ readModelInfo, t }: ModelSectionProps) {
  const [info, setInfo] = useState<{ provider: ProviderInfo; defaultModel: string } | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  useEffect(() => {
    const controller = new AbortController()
    readModelInfo().then(value => {
      if (!controller.signal.aborted) setInfo(value)
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { controller.abort() }
  }, [readModelInfo])

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
            <span style={{ fontWeight: 600, fontSize: '14px' }}>{info.provider.displayName}</span>
            <span style={{ fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' }}>{t('model.builtin')}</span>
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--dsw-alias-label-secondary)', wordBreak: 'break-all' }}>
            {info.provider.baseUrl}
          </div>
          <div style={{ fontSize: '12.5px' }}>
            <span style={{ color: 'var(--dsw-alias-label-secondary)' }}>{t('model.defaultModel')}: </span>
            <span style={{ fontWeight: 500 }}>{info.defaultModel}</span>
          </div>
          <div style={{ fontSize: '12.5px' }}>
            <span style={{ color: 'var(--dsw-alias-label-secondary)' }}>{t('model.availableModels')}: </span>
            <span>{info.provider.models.join('、')}</span>
          </div>
        </div>
      )}
    </div>
  )
}

/** Locale keys used by this component. */
export type ModelSectionLocaleKey = Extract<PingshunLocaleKey,
  'model.sectionHint' | 'model.builtin' | 'model.defaultModel' | 'model.availableModels'>
