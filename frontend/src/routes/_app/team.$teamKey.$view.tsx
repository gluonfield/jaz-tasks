import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { TeamBadge } from '@/components/icons'
import { ScopedIssues, scopeView } from '@/components/scoped-issues'
import { useCatalog } from '@/lib/queries'

export const Route = createFileRoute('/_app/team/$teamKey/$view')({ component: TeamIssues })

function TeamIssues() {
  const { teamKey, view } = Route.useParams()
  const navigate = useNavigate()
  const { data: catalog } = useCatalog()
  const team = catalog?.teams.find((t) => t.key.toLowerCase() === teamKey.toLowerCase())
  if (!team) {
    return null
  }
  return (
    <ScopedIssues
      team={team}
      view={scopeView(view)}
      onView={(next) => navigate({ to: '/team/$teamKey/$view', params: { teamKey, view: next } })}
      title={
        <>
          <TeamBadge icon={team.icon} color={team.color} />
          {team.name}
        </>
      }
    />
  )
}
