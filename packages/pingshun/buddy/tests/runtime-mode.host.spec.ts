/**
 * Runtime preset-registration reconciliation, tested against a mocked
 * registry. The key scenario: switching to DeepSeek BEFORE the initial Buddy
 * registration finishes must still end with an empty roster (latest-wins,
 * serialized), which the earlier serial/await implementation violated.
 */
import { describe, expect, it, vi } from 'vitest'

/** Minimal volatile field. */
function volatile<T>(get: () => T) {
  return { get }
}

/** Build a mock Host context with a roster and a controllable mode. */
function makeCtx(initialMode: 'buddy' | 'dsh', registerDelayMs = 30) {
  const roster = new Map<string, unknown>()
  const listeners: (() => void)[] = []
  const state = { mode: initialMode as 'buddy' | 'dsh' }
  const ctx = {
    agentPresets: {
      async register(definition: { id: string }) {
        // Simulate the async mount delay of a real preset.
        await new Promise(resolve => setTimeout(resolve, registerDelayMs))
        roster.set(definition.id, definition)
        return async () => { roster.delete(definition.id) }
      },
    },
    settings: {
      async update(_ns: string, _patch: object) {},
    },
    agentDefaultModel: {
      currentSelection() {
        return { provider: 'deepseek-official', model: 'deepseek-chat' }
      },
    },
    on: (_event: string, listener: () => void) => {
      listeners.push(listener)
      return () => {}
    },
    effect: (fn: () => unknown) => { void fn() },
    logger: { warn: vi.fn() },
  }
  const config = {
    buddyMode: volatile(() => state.mode),
    paddleToken: volatile(() => undefined),
    mineruToken: volatile(() => undefined),
    paddleModel: volatile(() => 'm'),
    paddleBaseUrl: volatile(() => 'u'),
    mineruModelVersion: volatile(() => 'v'),
    mineruBaseUrl: volatile(() => 'u'),
    pollIntervalMs: volatile(() => 5000),
    maxWaitMs: volatile(() => 600000),
    savedModelProvider: volatile(() => undefined),
    savedModel: volatile(() => undefined),
  }
  return {
    ctx,
    config,
    roster,
    /** Switch the mode and fire the loader volatile-update listeners. */
    switchTo(mode: 'buddy' | 'dsh') {
      state.mode = mode
      for (const listener of listeners) listener()
    },
  }
}

/** Wait for the reconciliation to settle. */
async function settle(ms = 400): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

describe('pingshun runtime mode reconciliation', () => {
  it('registers the six presets in Buddy mode', async () => {
    const { ctx, config, roster } = makeCtx('buddy')
    const { apply } = await import('../src/host/runtime.ts')
    apply(ctx as never, config as never)
    await settle()
    expect(roster.size).toBe(6)
  })

  it('starts empty in DeepSeek mode', async () => {
    const { ctx, config, roster } = makeCtx('dsh')
    const { apply } = await import('../src/host/runtime.ts')
    apply(ctx as never, config as never)
    await settle()
    expect(roster.size).toBe(0)
  })

  it('switching to DeepSeek during the initial registration still ends empty', async () => {
    const { ctx, config, roster, switchTo } = makeCtx('buddy', 50)
    const { apply } = await import('../src/host/runtime.ts')
    apply(ctx as never, config as never)
    // Switch almost immediately, while the initial registration is in flight.
    await new Promise(resolve => setTimeout(resolve, 10))
    switchTo('dsh')
    await settle(600)
    // After settling, the roster must be empty in DeepSeek mode.
    expect(roster.size).toBe(0)
  })

  it('rapid toggles converge to the latest mode', async () => {
    const { ctx, config, roster, switchTo } = makeCtx('buddy', 20)
    const { apply } = await import('../src/host/runtime.ts')
    apply(ctx as never, config as never)
    await settle()
    expect(roster.size).toBe(6)
    switchTo('dsh')
    switchTo('buddy')
    switchTo('dsh')
    switchTo('buddy')
    await settle(600)
    expect(roster.size).toBe(6)
  })
})
