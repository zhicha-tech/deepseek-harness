/**
 * OCR settings section in the native Settings panel (`settings.section`).
 *
 * Replaces the standalone dialog: the native settings shell owns the panel
 * chrome, the section owns the two token fields and their save action.
 * Token presence is read from the Host settings namespace (`pingshun-runtime`,
 * whose token fields are `role('secret')` and therefore redacted to presence
 * markers); saving goes through the settings remote, and the runtime plugin
 * bridges saved tokens to the environment.
 */
import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './index.ts'
import type { OcrSettingsAccess } from './settings-panel.tsx'
import css from './drawer.module.css'

/** Injected share: the OCR token read/save bridge. */
export interface OcrSectionInjected {
  readonly ocrSettings: OcrSettingsAccess
}

/** `settings.section` occupant props. */
export type OcrSectionProps = PropsRuntime<'settings.section'>
  & PropsLocale<typeof NS>
  & InjectFace<OcrSectionInjected>

/** The OCR settings section body. */
export function OcrSection({ ocrSettings, t }: OcrSectionProps) {
  const [status, setStatus] = useState<{ paddle: boolean; mineru: boolean } | undefined>(undefined)
  const [paddle, setPaddle] = useState('')
  const [mineru, setMineru] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    ocrSettings.readStatus().then((value) => {
      if (!controller.signal.aborted) setStatus(value)
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { controller.abort() }
  }, [ocrSettings])

  const save = async (): Promise<void> => {
    setBusy(true)
    setError(undefined)
    setSaved(false)
    try {
      await ocrSettings.save({
        ...paddle.trim() !== '' ? { paddle: paddle.trim() } : {},
        ...mineru.trim() !== '' ? { mineru: mineru.trim() } : {},
      })
      setSaved(true)
      setPaddle('')
      setMineru('')
      setStatus(await ocrSettings.readStatus())
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const statusText = (set: boolean | undefined): string => {
    if (set === undefined) return '…'
    return set ? t('settings.configured') : t('settings.notConfigured')
  }

  return (
    <div className={css.settingsBody}>
      <p className={css.settingsHint}>{t('settings.hint')}</p>
      <label className={css.field}>
        <span className={css.fieldLabel}>PaddleOCR token <span className={css.fieldState}>{statusText(status?.paddle)}</span></span>
        <input
          type="password"
          className={css.input}
          value={paddle}
          placeholder={t('settings.tokenPlaceholder')}
          onChange={(event) => { setPaddle(event.target.value) }}
          autoComplete="off"
        />
      </label>
      <label className={css.field}>
        <span className={css.fieldLabel}>MinerU token <span className={css.fieldState}>{statusText(status?.mineru)}</span></span>
        <input
          type="password"
          className={css.input}
          value={mineru}
          placeholder={t('settings.tokenPlaceholder')}
          onChange={(event) => { setMineru(event.target.value) }}
          autoComplete="off"
        />
      </label>
      {error !== undefined && <div className={css.settingsError}>{error}</div>}
      {saved && <div className={css.settingsSaved}>{t('settings.saved')}</div>}
      <div className={css.settingsActions}>
        <Button size="sm" variant="primary" disabled={busy || (paddle.trim() === '' && mineru.trim() === '')} onClick={() => { void save() }}>
          {t('settings.save')}
        </Button>
      </div>
    </div>
  )
}
