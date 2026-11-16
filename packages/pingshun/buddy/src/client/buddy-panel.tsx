/**
 * Buddy sidebar panel: the `sidebar.workspaces` occupant in Buddy mode.
 *
 * Lists the six business agents from the Host preset roster (`agentPresets.list`
 * via the injected `useRoster` hook) cross-checked against the presentation
 * catalog, and the session history projected from the session list's recorded
 * `agentPreset` values — both real server state, never a static roster.
 * Selecting an agent creates or reuses a blank Session bound to that preset
 * through the shared uiWorkspace service; selecting a history session opens
 * it under the preset its log recorded.
 */
import type { AgentPresetRow } from '@deepseek-ai/dsh-agent-preset-registry/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { UiWorkspace } from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect } from 'react'
import { NS } from './index.ts'
import { BUDDY_CATALOG, type BuddyCatalogEntry } from '../shared/catalog.ts'
import { modeStore } from './mode-store.ts'
import type { OcrSettingsAccess } from './settings-panel.tsx'
import css from './panel.module.css'

/** Injected share: roster observable, shared navigation, roster refresh. */
export interface BuddyPanelInjected {
  hooks: {
    /** Agent-preset roster (id → row), refreshed by the surface manager. */
    roster: HostObservable<ReadonlyMap<string, AgentPresetRow>>
  }
  /** Shared session navigation: open by id, or start bound to a preset. */
  uiWorkspace: UiWorkspace
  /** Re-read the roster from the Host remote. */
  refreshRoster: () => void
  /** OCR token settings access (the panel hosts the dialog for the More menu). */
  ocrSettings: OcrSettingsAccess
}

/** `sidebar.workspaces` occupant props: owner share plus framework and injected shares. */
export type BuddyPanelProps = PropsRuntime<'sidebar.workspaces'>
  & PropsLocale<typeof NS>
  & InjectFace<BuddyPanelInjected>

/** One agent row in display order: catalog presentation over Host health. */
interface AgentRow {
  readonly entry: BuddyCatalogEntry
  readonly preset: AgentPresetRow | undefined
}

/** One history session row projected from the session list. */
interface SessionRow {
  readonly sessionId: SessionId
  readonly preset: string | null
  readonly title: string
  readonly updatedAt: number
}

/** Recent-session cap: the panel is a picker, not a full history browser. */
const MAX_SESSION_ROWS = 50

/** Roster re-read cadence so a newly mounted preset lands without a reload. */
const ROSTER_REFRESH_MS = 30_000

/** Select the recent non-blank session rows, newest first. */
function selectSessions(state: SessionListState): SessionRow[] {
  return state.ids
    .map(id => state.byId[id])
    .filter((row): row is NonNullable<typeof row> => row !== undefined && !row.blank)
    .map(row => ({
      sessionId: row.id,
      preset: row.projectionValues?.agentPreset ?? null,
      title: row.title ?? row.displayTitle,
      updatedAt: row.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SESSION_ROWS)
}

/** Structural equality over the selected rows. */
function sessionsEqual(a: readonly SessionRow[], b: readonly SessionRow[]): boolean {
  return a.length === b.length && a.every((row, i) => row.sessionId === b[i]?.sessionId
    && row.title === b[i]?.title && row.updatedAt === b[i]?.updatedAt && row.preset === b[i]?.preset)
}

/** The `sidebar.workspaces` occupant. */
export function BuddyPanel({ useRoster, uiWorkspace, refreshRoster, t, useSessions, wide }: BuddyPanelProps) {
  const roster = useRoster(map => map)
  const sessions = useSessions(selectSessions, sessionsEqual)
  // Refresh the roster periodically so a newly mounted preset lands without a reload.
  useEffect(() => {
    if (modeStore.getSnapshot() !== 'buddy') return
    const timer = window.setInterval(refreshRoster, ROSTER_REFRESH_MS)
    return () => { window.clearInterval(timer) }
  }, [refreshRoster])

  if (modeStore.getSnapshot() !== 'buddy') return null


  const agentRows: AgentRow[] = BUDDY_CATALOG.map(entry => ({
    entry,
    preset: roster.get(entry.presetId),
  }))
  return (
    <div className={wide ? css.panel : css.panelRail}>
      {wide && <div className={css.sectionLabel}>{t('panel.agents')}</div>}
      {agentRows.map(({ entry, preset }) => {
        const unavailable = preset === undefined || preset.broken !== undefined
        const button = (
          <button
            key={entry.presetId}
            type="button"
            className={wide ? css.agentRow : css.agentRowRail}
            disabled={unavailable}
            onClick={() => { uiWorkspace.startSession(undefined, { agentPreset: entry.presetId }) }}
          >
            <span className={css.avatar} style={{ background: entry.color }}>{entry.name.slice(0, 1)}</span>
            {wide && (
              <span className={css.agentMeta}>
                <span className={css.agentName}>{entry.name}</span>
                <span className={css.agentIntro}>{unavailable ? t('panel.agentUnavailable') : entry.intro}</span>
              </span>
            )}
          </button>
        )
        if (wide) return button
        // Rail: the host Tooltip supplies the hover label, matching the
        // sidebar's own collapsed buttons.
        return (
          <Tooltip key={entry.presetId} label={entry.name} side="right" delayMs={500}>
            {button}
          </Tooltip>
        )
      })}
      {wide && (
        <>
          <div className={css.sectionLabel}>{t('panel.sessions')}</div>
          {sessions.length === 0 && <div className={css.empty}>{t('panel.empty')}</div>}
          {sessions.map(session => {
            const catalog = BUDDY_CATALOG.find(entry => entry.presetId === session.preset)
            const title = session.title !== '' ? session.title : catalog?.name ?? t('panel.newSession')
            const sameDay = new Date(session.updatedAt)
            const now = new Date()
            const time = sameDay.toDateString() === now.toDateString()
              ? sameDay.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : sameDay.toLocaleDateString([], { month: 'numeric', day: 'numeric' })
            return (
              <button
                key={session.sessionId}
                type="button"
                className={css.sessionRow}
                onClick={() => { uiWorkspace.openSession(session.sessionId) }}
              >
                <span className={css.sessionTitle}>{title}</span>
                <span className={css.sessionTime}>{time}</span>
              </button>
            )
          })}
        </>
      )}
    </div>
  )
}
