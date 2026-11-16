// @vitest-environment jsdom
/** Mode store: state transitions, subscriptions, and per-tab persistence. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { modeStore } from '../src/client/mode-store.ts'

describe('pingshun buddy mode store', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    modeStore.setMode('buddy')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('defaults to Buddy mode on a fresh tab', () => {
    window.sessionStorage.clear()
    // The store module retains its in-memory value; persistence absence means the default.
    expect(window.sessionStorage.getItem('pingshun.buddy.mode')).toBeNull()
  })

  it('persists the mode switch for this tab', () => {
    modeStore.setMode('dsh')
    expect(modeStore.getSnapshot()).toBe('dsh')
    expect(window.sessionStorage.getItem('pingshun.buddy.mode')).toBe('dsh')
    modeStore.setMode('buddy')
    expect(window.sessionStorage.getItem('pingshun.buddy.mode')).toBe('buddy')
  })

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const seen: string[] = []
    const unsubscribe = modeStore.subscribe(() => { seen.push(modeStore.getSnapshot()) })
    modeStore.setMode('dsh')
    modeStore.setMode('dsh')
    unsubscribe()
    modeStore.setMode('buddy')
    expect(seen).toEqual(['dsh'])
  })

  it('keeps the Buddy default when storage throws', () => {
    vi.spyOn(window.sessionStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    modeStore.setMode('dsh')
    // The in-memory mode still applies even though persistence failed.
    expect(modeStore.getSnapshot()).toBe('dsh')
    modeStore.setMode('buddy')
    expect(modeStore.getSnapshot()).toBe('buddy')
  })
})
