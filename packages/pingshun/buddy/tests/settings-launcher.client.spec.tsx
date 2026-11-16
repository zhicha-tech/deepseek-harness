// @vitest-environment jsdom
/**
 * Settings-only launcher: the shadow `settings.launcher` occupant renders
 * exactly one menu item (Settings), opens the settings panel through the
 * shell's `openSettings`, and never offers sign-in or feedback entries.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SettingsOnlyLauncher } from '../src/client/settings-launcher.tsx'

/** Shell owner props for the launcher occupant (mock `t` is cast through the launcher props type). */
function makeProps(overrides: Record<string, unknown> = {}): Parameters<typeof SettingsOnlyLauncher>[0] {
  return {
    wide: true,
    settingsOpen: false,
    openSettings: vi.fn(),
    openOnboarding: vi.fn(),
    t: ((key: string) => key === 'launcher.more' ? '更多' : '设置') as never,
    ...overrides,
  } as Parameters<typeof SettingsOnlyLauncher>[0]
}

afterEach(() => { cleanup() })

describe('settings-only launcher', () => {
  it('renders the More trigger with a label in the wide column', () => {
    render(<SettingsOnlyLauncher {...makeProps()} />)
    expect(screen.getByRole('button', { name: '更多' })).toBeDefined()
    expect(screen.getByText('更多')).toBeDefined()
  })

  it('hides the label in the collapsed rail', () => {
    render(<SettingsOnlyLauncher {...makeProps({ wide: false })} />)
    expect(screen.getByRole('button', { name: '更多' })).toBeDefined()
    expect(screen.queryByText('更多')).toBeNull()
  })

  it('opens a menu with exactly one Settings item', () => {
    render(<SettingsOnlyLauncher {...makeProps()} />)
    fireEvent.click(screen.getByRole('button', { name: '更多' }))
    const items = screen.getAllByRole('menuitem')
    expect(items).toHaveLength(1)
    expect(items[0]?.textContent).toContain('设置')
    expect(document.body.textContent).not.toContain('登录')
    expect(document.body.textContent).not.toContain('意见反馈')
  })

  it('calls openSettings when the Settings item is selected', () => {
    const props = makeProps()
    render(<SettingsOnlyLauncher {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '更多' }))
    fireEvent.click(screen.getByRole('menuitem'))
    expect(props.openSettings).toHaveBeenCalledTimes(1)
  })
})
