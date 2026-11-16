/**
 * Settings-only sidebar launcher: replaces the account `settings.launcher`
 * occupant (AccountMenu) so the menu offers exactly one action — Settings.
 *
 * The native menu hardcodes Settings / feedback / sign-in in its items
 * array, so there is no configuration that hides only the latter two.
 * Shadowing the single slot at a lower priority removes the feedback and
 * sign-in entries while the shell keeps its own trigger row, connection
 * indicator, and settings panel untouched. Disposing our registration makes
 * the native account menu render again.
 *
 * Host-side sign-in APIs stay available; this is a UI-level removal.
 */
import { useState } from 'react'
import {
  Menu, IconEllipsisOutlineMedium, IconSettingsOutlineMedium,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './index.ts'
import type { PingshunLocaleKey } from './locales.ts'
import css from './settings-launcher.module.css'

/** `settings.launcher` occupant props: shell owner share plus locale. */
export type SettingsLauncherProps = PropsRuntime<'settings.launcher'> & PropsLocale<typeof NS>

/** The settings-only launcher occupant. */
export function SettingsOnlyLauncher({ wide, settingsShortcut, openSettings, t }: SettingsLauncherProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className={css.root}>
      <Menu
        open={open}
        side="top"
        portal
        autoFocus
        className={css.anchor}
        listClassName={css.menu}
        anchor={
          <button
            type="button"
            className={css.trigger}
            data-collapsed={!wide}
            aria-label={t('launcher.more')}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => { setOpen(value => !value) }}
          >
            <IconEllipsisOutlineMedium size={14} />
            {wide && <span className={css.label}>{t('launcher.more')}</span>}
          </button>
        }
        items={[
          { id: 'settings', label: t('launcher.settings'), icon: <IconSettingsOutlineMedium size={16} />,
            ...(settingsShortcut === undefined ? {} : { shortcut: settingsShortcut }) },
        ]}
        onClose={() => { setOpen(false) }}
        onSelect={(id) => {
          if (id === 'settings') {
            setOpen(false)
            openSettings()
          }
        }}
      />
    </div>
  )
}

/** Unused-injected placeholder type: this occupant needs no injected share. */
export type SettingsLauncherInjected = InjectFace<Record<never, never>>

/** Locale keys used by this component (documented for dictionary checks). */
export type LauncherLocaleKey = Extract<PingshunLocaleKey, 'launcher.more' | 'launcher.settings'>
