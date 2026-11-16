/**
 * OCR token settings dialog (Buddy mode).
 *
 * Reads the two OCR tokens' presence from the Host settings namespace
 * (`pingshun-runtime`, whose token fields are `role('secret')` and therefore
 * redacted to presence markers), and saves new tokens through the settings
 * remote. The runtime plugin bridges saved tokens to the environment, so the
 * next OCR call uses them without a restart.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PingshunLocaleKey } from './locales.ts'
import css from './drawer.module.css'

/** Access to the OCR token settings (presence read + save). */
export interface OcrSettingsAccess {
  /** Read whether each token is configured (never returns the token value). */
  readStatus(): Promise<{ paddle: boolean; mineru: boolean }>
  /** Save the supplied tokens; empty fields are left unchanged. */
  save(tokens: { paddle?: string; mineru?: string }): Promise<void>
}

/** The OCR settings dialog. */
export function OcrSettingsDialog({ access, t, onClose }: {
  readonly access: OcrSettingsAccess
  readonly t: (key: PingshunLocaleKey) => string
  readonly onClose: () => void
}) {
  const [status, setStatus] = useState<{ paddle: boolean; mineru: boolean } | undefined>(undefined)
  const [paddle, setPaddle] = useState('')
  const [mineru, setMineru] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    access.readStatus().then((value) => {
      if (!controller.signal.aborted) setStatus(value)
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { controller.abort() }
  }, [access])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [onClose])

  const save = async (): Promise<void> => {
    setBusy(true)
    setError(undefined)
    setSaved(false)
    try {
      await access.save({
        ...paddle.trim() !== '' ? { paddle: paddle.trim() } : {},
        ...mineru.trim() !== '' ? { mineru: mineru.trim() } : {},
      })
      setSaved(true)
      setPaddle('')
      setMineru('')
      setStatus(await access.readStatus())
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

  return createPortal(
    <div className={css.overlay} onClick={onClose} role="presentation">
      <div className={css.settingsDialog} onClick={(event) => { event.stopPropagation() }} role="dialog" aria-label={t('settings.title')}>
        <header className={css.head}>
          <span className={css.title}>{t('settings.title')}</span>
          <button type="button" className={css.close} onClick={onClose} aria-label={t('settings.title')}>×</button>
        </header>
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
            <Button size="sm" variant="ghost" onClick={onClose}>{t('settings.close')}</Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
