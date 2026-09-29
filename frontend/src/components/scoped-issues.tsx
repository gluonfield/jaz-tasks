import { type ReactNode, useMemo } from 'react'
import { useCatalogMaps, useIssues } from '@/lib/queries'
import type { StateType, Team } from '@/lib/types'
import { IssueView, Tab } from './issue-view'

export type ScopeView = 'all' | 'active' | 'backlog'

const views: Record<ScopeView, { label: string; types?: StateType[] }> = {
  all: { label: 'All issues' },
  active: { label: 'Active', types: ['unstarted', 'started'] },
  backlog: { label: 'Backlog', types: ['backlog'] },
}

export const scopeView = (view: unknown): ScopeView => (view === 'active' || view === 'backlog' ? view : 'all')

// ScopedIssues lists one team's issues, or the whole workspace's without a
// team, under the All, Active and Backlog tabs.
export function ScopedIssues({
  team,
  view,
  title,
  onView,
}: {
  team?: Team
  view: ScopeView
  title: ReactNode
  onView: (view: ScopeView) => void
}) {
  const { catalog, states } = useCatalogMaps()
  const { data: issues, isLoading } = useIssues()
  const types = views[view].types
  const teamId = team?.id
  const scoped = useMemo(
    () =>
      (issues ?? []).filter(
        (i) => (!teamId || i.teamId === teamId) && (!types || types.includes(states.get(i.stateId)?.type ?? 'backlog')),
      ),
    [issues, teamId, types, states],
  )
  const scopeStates = useMemo(
    () => (catalog?.states ?? []).filter((s) => (!teamId || s.teamId === teamId) && (!types || types.includes(s.type))),
    [catalog, teamId, types],
  )
  return (
    <IssueView
      viewKey={teamId ? `team:${teamId}:${view}` : `all:${view}`}
      loading={isLoading || !catalog}
      issues={scoped}
      teamStates={scopeStates}
      createDefaults={teamId ? { teamId } : undefined}
      title={title}
      tabs={Object.entries(views).map(([key, v]) => (
        <Tab key={key} active={key === view} onClick={() => onView(key as ScopeView)}>
          {v.label}
        </Tab>
      ))}
    />
  )
}
