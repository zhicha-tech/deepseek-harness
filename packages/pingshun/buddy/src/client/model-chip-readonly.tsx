/**
 * Read-only model chip for Buddy mode: the `conversation.input.model` shadow.
 *
 * The deployment's model service is built in from the environment (OpenAI-
 * compatible endpoint + key), so the composer shows a static label instead of
 * an interactive provider/model picker. DeepSeek mode disposes the shadow and
 * the native picker renders again.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './index.ts'
import type { PingshunLocaleKey } from './locales.ts'

/** `conversation.input.model` occupant props (session scope + locale). */
export type ModelChipProps = PropsRuntime<'conversation.input.model'> & PropsLocale<typeof NS>

/** Static model-service label: no picker, no editing affordance. */
export function ModelChipReadonly({ t }: ModelChipProps) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        fontSize: '12px', color: 'var(--dsw-alias-label-secondary)',
        padding: '4px 8px', userSelect: 'none',
      }}
      title={t('model.managedHint')}
    >
      {t('model.managed')}
    </span>
  )
}

/** Locale keys used by this component. */
export type ModelChipLocaleKey = Extract<PingshunLocaleKey, 'model.managed' | 'model.managedHint'>
