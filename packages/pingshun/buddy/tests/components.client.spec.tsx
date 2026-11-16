// @vitest-environment jsdom
/**
 * BuddyPanel and tools-button rendering: catalog rows over Host roster truth
 * (broken presets disabled), agent click starts a preset-bound session, and
 * the drawer shows the live composition with Esc/scrim close.
 */
import type { AgentPresetRow } from '@deepseek-ai/dsh-agent-preset-registry/types'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { BuddyPanel, type BuddyPanelInjected } from '../src/client/buddy-panel.tsx'
import { ToolsButtonSlot, type ToolDrawerInjected } from '../src/client/tools-button.tsx'
import { modeStore } from '../src/client/mode-store.ts'
import { BUDDY_CATALOG } from '../src/shared/catalog.ts'

/** Identity translate: assertions match dictionary keys. */
const t = (key: string): string => key

afterEach(() => {
  modeStore.setMode('buddy')
  document.body.innerHTML = ''
})

describe('buddy panel', () => {
  function makeProps(rosterRows: readonly AgentPresetRow[]) {
    const roster = createSnapshotStore<ReadonlyMap<string, AgentPresetRow>>(
      new Map(rosterRows.map(row => [row.id, row])),
    )
    const uiWorkspace = {
      startSession: vi.fn(),
      openSession: vi.fn(),
    } as unknown as BuddyPanelInjected['uiWorkspace']
    const props = {
      useRoster: (selector: (map: ReadonlyMap<string, AgentPresetRow>) => ReadonlyMap<string, AgentPresetRow>) => selector(roster.getSnapshot()),
      uiWorkspace,
      refreshRoster: () => {},
      t,
      // The hook receives the full list state; two non-blank sessions, newest first.
      // The selector parameter is typed against SessionListState; the partial
      // double covers only the fields selectSessions reads.
      useSessions: (selector: (state: never) => unknown) => selector({
        ids: ['s-1', 's-2'],
        byId: {
          's-1': { id: 's-1', blank: false, updatedAt: 200, title: '讲话稿初稿', projectionValues: { agentPreset: 'ps-office' } },
          's-2': { id: 's-2', blank: false, updatedAt: 100, title: '', displayTitle: '未命名', projectionValues: { agentPreset: 'ps-finance' } },
        },
      } as never) as never,
      wide: true,
      expandSidebar: () => {},
    }
    return { props: props as unknown as Parameters<typeof BuddyPanel>[0], uiWorkspace }
  }

  it('renders catalog agents, disabling ones missing or broken in the Host roster', () => {
    const { props } = makeProps([
      { id: 'ps-office', isDefault: false, name: '办公 Buddy' },
      { id: 'ps-party', isDefault: false, name: '党建 Buddy', broken: 'declaration failed' },
    ])
    render(<BuddyPanel {...props} />)
    const office = screen.getByRole('button', { name: /办公 Buddy/ })
    expect(office.hasAttribute('disabled')).toBe(false)
    const party = screen.getByRole('button', { name: /党建 Buddy/ })
    expect(party.getAttribute('disabled')).not.toBeNull()
    // Broken presets are disabled; the Tooltip label carries the name.
    expect(party.closest('[class]')).not.toBeNull()
    // Catalog entries without a roster row render disabled too.
    expect(screen.getByRole('button', { name: /市场 Buddy/ }).getAttribute('disabled')).not.toBeNull()
    for (const entry of BUDDY_CATALOG) {
      expect(screen.getAllByText(entry.name).length).toBeGreaterThanOrEqual(1)
    }
  })

  it('starts a preset-bound session when an agent is clicked', () => {
    const { props, uiWorkspace } = makeProps([
      { id: 'ps-office', isDefault: false, name: '办公 Buddy' },
    ])
    render(<BuddyPanel {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /办公 Buddy/ }))
    expect(uiWorkspace.startSession).toHaveBeenCalledWith(undefined, { agentPreset: 'ps-office' })
  })

  it('lists history sessions under their recorded preset and opens them by id', () => {
    const { props, uiWorkspace } = makeProps([
      { id: 'ps-office', isDefault: false, name: '办公 Buddy' },
      { id: 'ps-finance', isDefault: false, name: '财务 Buddy' },
    ])
    render(<BuddyPanel {...props} />)
    expect(screen.getByText('讲话稿初稿')).toBeTruthy()
    // An untitled session falls back to its agent's catalog name; the agent
    // row and the session row both render it.
    expect(screen.getAllByText('财务 Buddy').length).toBeGreaterThanOrEqual(2)
    fireEvent.click(screen.getByText('讲话稿初稿'))
    expect(uiWorkspace.openSession).toHaveBeenCalledWith('s-1')
  })
})

describe('tools button and drawer', () => {
  function makeProps(preset: string | undefined) {
    const listInventory = vi.fn(async () => ({
      entries: [],
      agentPresets: [{
        id: 'ps-office',
        isDefault: false,
        rows: [
          { entryId: 'tool-fs', moduleName: '@deepseek-ai/dsh-tool-fs', enabled: true, fiberPhase: 'active' },
          { entryId: 'tool-web', moduleName: '@deepseek-ai/dsh-tool-web', enabled: false, fiberPhase: null },
          { entryId: 'tool-office', moduleName: '@deepseek-ai/dsh-tool-office', enabled: true, fiberPhase: 'failed' },
        ],
      }],
    })) as unknown as ToolDrawerInjected['listInventory']
    return {
      props: {
        sessionId: 's-1',
        useProjection: (key: string) => (key === 'agentPreset' ? preset : undefined),
        listInventory,
        t,
      } as unknown as Parameters<typeof ToolsButtonSlot>[0],
      listInventory,
    }
  }

  it('renders nothing outside Buddy mode or without a bound preset', () => {
    modeStore.setMode('dsh')
    const { props } = makeProps('ps-office')
    const { container } = render(<ToolsButtonSlot {...props} />)
    expect(container.childElementCount).toBe(0)
    modeStore.setMode('buddy')
    const noPreset = makeProps(undefined)
    const second = render(<ToolsButtonSlot {...noPreset.props} />)
    expect(second.container.childElementCount).toBe(0)
  })

  it('opens the drawer with the live composition grouped and states labeled', async () => {
    const { props, listInventory } = makeProps('ps-office')
    render(<ToolsButtonSlot {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'drawer.title' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    await waitFor(() => { expect(listInventory).toHaveBeenCalled() })
    // Group labels and per-row states come from the real inventory answer.
    expect(screen.getAllByText('drawer.group.files')).toHaveLength(1)
    expect(screen.getAllByText('drawer.state.active')).toHaveLength(1)
    expect(screen.getAllByText('drawer.state.inactive')).toHaveLength(1)
    expect(screen.getAllByText('drawer.state.failed')).toHaveLength(1)
    // Escape closes the drawer and removes the portal.
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
  })

  it('closes through the scrim click', async () => {
    const { props } = makeProps('ps-office')
    render(<ToolsButtonSlot {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'drawer.title' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('presentation'))
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
  })
})
