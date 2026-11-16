// @vitest-environment jsdom
/**
 * Surface manager: shadow-priority takeover of `sidebar.workspaces`, the
 * utilities entry, reverse-order teardown, idempotent enter, and partial-
 * install unwind on failure.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { createBuddySurfaces, type SurfaceServices } from '../src/client/surface-manager.ts'
import { modeStore } from '../src/client/mode-store.ts'

type Registration = { readonly name: string; readonly options: Record<string, unknown> }

/** Slot registry double: records registrations per slot name with priorities. */
function makeSlots() {
  const registrations = new Map<string, Registration[]>()
  const injects: { slot: string; fail: boolean }[] = []
  const ctx = {
    slots: {
      register: (options: Record<string, unknown>) => {
        const list = registrations.get(options.name as string) ?? []
        list.push({ name: options.name as string, options })
        registrations.set(options.name as string, list)
        return () => {
          const current = registrations.get(options.name as string) ?? []
          const index = current.findIndex(entry => entry.options === options)
          if (index >= 0) current.splice(index, 1)
        }
      },
      inject: (slot: string, factory: () => () => void) => {
        const record = { slot, fail: false }
        injects.push(record)
        if (record.fail) throw new Error('declaration missing')
        return factory()
      },
    },
  }
  return {
    ctx: ctx as unknown as Context,
    registrations,
    failNextInject(): void {
      const last = injects[injects.length - 1]
      if (last !== undefined) last.fail = true
    },
  }
}

/** Services double: fixed roster rows and inventory answer. */
function makeServices(): SurfaceServices {
  return {
    uiWorkspace: {} as SurfaceServices['uiWorkspace'],
    listRoster: async () => [
      { id: 'ps-office', isDefault: false, name: '办公 Buddy' },
      { id: 'ps-party', isDefault: false, name: '党建 Buddy', broken: 'declaration failed' },
    ],
    listInventory: async () => ({ entries: [], agentPresets: [] }),
    ocrSettings: {
      read: async () => ({}),
      update: async () => ({}),
    } as unknown as SurfaceServices['ocrSettings'],
    readModelInfo: async () => ({
      provider: { displayName: '内置模型服务', baseUrl: 'http://test/v1', models: ['m1'] },
      defaultModel: 'pingshun/m1',
    }),
  }
}

afterEach(() => {
  modeStore.setMode('buddy')
})

describe('pingshun buddy surfaces', () => {
  it('installs the sidebar shadow at lower priority and the utilities entry', () => {
    const { ctx, registrations } = makeSlots()
    const surfaces = createBuddySurfaces(ctx, makeServices())
    surfaces.enter()
    const panel = registrations.get('sidebar.workspaces') ?? []
    expect(panel).toHaveLength(1)
    expect(panel[0]?.options.priority).toBe(-10)
    expect(panel[0]?.options.locale).toBe('pingshun.buddy')
    const tools = registrations.get('conversation.session.header.utilities') ?? []
    expect(tools).toHaveLength(1)
    expect(tools[0]?.options.id).toBe('pingshun-buddy-tools')
    surfaces.exit()
  })

  it('tears down in reverse and leaves the native occupants alone', () => {
    const { ctx, registrations } = makeSlots()
    // A pre-existing native registration that Buddy mode must never remove.
    const nativeDispose = (ctx.slots.register as (options: Record<string, unknown>) => () => void)({ name: 'sidebar.workspaces', priority: 0 })
    const surfaces = createBuddySurfaces(ctx, makeServices())
    surfaces.enter()
    surfaces.exit()
    const remaining = registrations.get('sidebar.workspaces') ?? []
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.options.priority).toBe(0)
    nativeDispose()
    expect(registrations.get('sidebar.workspaces')).toHaveLength(0)
  })

  it('enter is idempotent while installed', () => {
    const { ctx, registrations } = makeSlots()
    const surfaces = createBuddySurfaces(ctx, makeServices())
    surfaces.enter()
    surfaces.enter()
    expect(registrations.get('sidebar.workspaces')).toHaveLength(1)
    surfaces.exit()
    expect(registrations.get('sidebar.workspaces')).toHaveLength(0)
    // Re-entering after a clean exit installs a fresh pair.
    surfaces.enter()
    expect(registrations.get('sidebar.workspaces')).toHaveLength(1)
    surfaces.exit()
  })

  it('unwinds a partial install when a registration fails', () => {
    const { ctx, registrations } = makeSlots()
    const surfaces = createBuddySurfaces(ctx, makeServices())
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // First inject succeeds, second throws once: enter must remove the first
    // again, and a later enter retries as a clean attempt.
    let failUtilities = true
    ctx.slots.inject = ((slot: string, factory: () => () => void) => {
      if (slot === 'conversation.session.header.utilities') {
        if (failUtilities) {
          failUtilities = false
          throw new Error('owner missing')
        }
      }
      const dispose = factory()
      return () => { dispose() }
    }) as typeof ctx.slots.inject
    surfaces.enter()
    expect(errorSpy).toHaveBeenCalled()
    expect(registrations.get('sidebar.workspaces')).toHaveLength(0)
    expect(registrations.get('conversation.session.header.utilities') ?? []).toHaveLength(0)
    // A later enter after the failure is a clean attempt, not a half state.
    surfaces.enter()
    expect(registrations.get('sidebar.workspaces')).toHaveLength(1)
    expect(registrations.get('conversation.session.header.utilities')).toHaveLength(1)
    surfaces.exit()
    errorSpy.mockRestore()
  })

  it('refreshes the roster into the observable store', async () => {
    const { ctx } = makeSlots()
    const surfaces = createBuddySurfaces(ctx, makeServices())
    surfaces.refreshRoster()
    await vi.waitFor(() => {
      expect(surfaces.roster.getSnapshot().get('ps-office')?.name).toBe('办公 Buddy')
      expect(surfaces.roster.getSnapshot().get('ps-party')?.broken).toBe('declaration failed')
    })
  })
})
