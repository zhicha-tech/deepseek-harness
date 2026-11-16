/**
 * Model chip for Buddy mode: the `conversation.input.model` shadow.
 *
 * The deployment's model service endpoint and API key are managed and never
 * shown; the chip offers a dropdown over the discovered model catalog so the
 * user picks a model, persisted through the `agent-default-model` settings
 * namespace. DeepSeek mode disposes the shadow and the native picker renders
 * again.
 */
import { useEffect, useState } from 'react'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './index.ts'
import type { PingshunLocaleKey } from './locales.ts'
import type { ModelSelectionInfo } from './model-select.ts'

/** `conversation.input.model` occupant props (session scope + locale + injected share). */
export type ModelChipProps = PropsRuntime<'conversation.input.model'>
  & PropsLocale<typeof NS>
  & InjectFace<ModelChipInjected>

/** Injected share: catalog reads and selection writes over the settings remote. */
export interface ModelChipInjected {
  readonly readModelSelection: () => Promise<ModelSelectionInfo>
  readonly selectModel: (model: string) => Promise<void>
}

/** Model picker chip: catalog dropdown, no endpoint/key affordances. */
export function ModelChipReadonly({ readModelSelection, selectModel, t }: ModelChipProps) {
  const [open, setOpen] = useState(false)
  const [info, setInfo] = useState<ModelSelectionInfo | undefined>(undefined)
  const [, setError] = useState<string | undefined>(undefined)
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
    <Menu
      open={open}
      side="top"
      portal
      autoFocus
      anchor={
        <button
          type="button"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            fontSize: '12px', color: 'var(--dsw-alias-label-secondary)',
            padding: '4px 8px', border: 'none', background: 'transparent',
            cursor: 'pointer',
          }}
          title={t('model.managedHint')}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => { setOpen(value => !value) }}
        >
          {info?.current ?? t('model.managed')}
        </button>
      }
      items={(info?.models ?? []).map(model => ({
        id: model,
        label: model === info?.current ? `${model} ✓` : model,
      }))}
      onClose={() => { setOpen(false) }}
      onSelect={(id) => {
        setOpen(false)
        selectModel(id).then(() => {
          setInfo(previous => previous === undefined ? previous : { ...previous, current: id })
        }).catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : String(reason))
        })
      }}
    />
  )
}

/** Locale keys used by this component. */
export type ModelChipLocaleKey = Extract<PingshunLocaleKey, 'model.managed' | 'model.managedHint'>
