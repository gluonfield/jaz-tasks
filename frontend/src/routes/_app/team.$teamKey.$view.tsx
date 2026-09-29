import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { TeamBadge } from '@/components/icons'
import { IssueView, Tab } from '@/components/issue-view'
import { useCatalogMaps, useIssues } from '@/lib/queries'
import type { StateType } from '@/lib/types'

const views: Record<string, { label: string; types?: StateType[] }> = {
  all: { label: 'All issues' },
  active: { label: 'Active', types: ['unstarted', 'started'] },
  backlog: { label: 'Backlog', types: ['backlog'] },
}

export const Route = createFileRoute('/_app/team/$teamKey/$view')({ component: TeamIssues })

function TeamIssues() {
  const { teamKey, view } = Route.useParams()
  const navigate = useNavigate()
  const { catalog, states } = useCatalogMaps()
  const { data: issues, isLoading } = useIssues()
  const team = catalog?.teams.find((t) => t.key.toLowerCase() === teamKey.toLowerCase())
  const types = views[view]?.types
  const teamIssues = useMemo(
    () => (issues ?? []).filter((i) => i.teamId === team?.id && (!types || types.includes(states.get(i.stateId)?.type ?? 'backlog'))),
    [issues, team, types, states],
  )
  const teamStates = useMemo(
    () => (catalog?.states ?? []).filter((s) => s.teamId === team?.id && (!types || types.includes(s.type))),
    [catalog, team, types],
  )
  if (!team) {
    return null
  }
  return (
    <IssueView
      viewKey={`team:${team.id}:${view}`}
      loading={isLoading}
      issues={teamIssues}
      teamStates={teamStates}
      createDefaults={{ teamId: team.id }}
      title={
        <>
          <TeamBadge icon={team.icon} color={team.color} />
          {team.name}
        </>
      }
      tabs={Object.entries(views).map(([key, v]) => (
        <Tab key={key} active={key === view} onClick={() => navigate({ to: '/team/$teamKey/$view', params: { teamKey, view: key } })}>
          {v.label}
        </Tab>
      ))}
    />
  )
}
