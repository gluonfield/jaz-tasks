import { Link, createFileRoute } from '@tanstack/react-router'
import { CalendarDays, ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { Avatar, EntityIcon, ProgressRing, TeamBadge } from '@/components/icons'
import { IssueView } from '@/components/issue-view'
import { ProjectStatusIcon } from '@/components/project-status'
import { formatDay } from '@/lib/issues'
import { useCatalogMaps, useIssues } from '@/lib/queries'

export const Route = createFileRoute('/_app/project/$slugId')({ component: ProjectPage })

function ProjectPage() {
  const { slugId } = Route.useParams()
  const { catalog, users, teams } = useCatalogMaps()
  const { data: issues, isLoading } = useIssues()
  const project = catalog?.projects.find((p) => p.slugId === slugId)
  const projectIssues = useMemo(() => (issues ?? []).filter((i) => i.projectId === project?.id), [issues, project])
  if (!project) {
    return null
  }
  const lead = project.leadId ? users.get(project.leadId) : null
  return (
    <IssueView
      viewKey={`project:${project.id}`}
      loading={isLoading}
      issues={projectIssues}
      createDefaults={{ projectId: project.id, teamId: project.teamIds[0] }}
      title={
        <>
          <Link to="/projects" className="text-ink-2 outline-none hover:text-ink">
            Projects
          </Link>
          <ChevronRight className="size-3 text-ink-3" />
          <EntityIcon icon={project.icon} color={project.color} />
          {project.name}
        </>
      }
      summary={
        <div className="shrink-0 border-b border-border px-6 pb-4 pt-5">
          <div className="flex items-center gap-3">
            <span
              className="flex size-8 items-center justify-center rounded-[8px]"
              style={{ background: `color-mix(in oklab, ${project.color} 16%, transparent)` }}
            >
              <EntityIcon icon={project.icon} color={project.color} className="size-4" />
            </span>
            <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">{project.name}</h1>
          </div>
          {project.description && <p className="mt-2 max-w-[720px] text-[13.5px] text-ink-2">{project.description}</p>}
          <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-ink-2">
            <span className="flex items-center gap-1.5">
              <ProjectStatusIcon type={project.status.type} color={project.status.color} />
              {project.status.name}
            </span>
            <span className="flex items-center gap-1.5">
              <Avatar user={lead} size={16} />
              {lead?.name ?? 'No lead'}
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5 text-ink-3" />
              {project.startDate ? formatDay(project.startDate) : 'No start'} → {project.targetDate ? formatDay(project.targetDate) : 'No target'}
            </span>
            <span className="flex items-center gap-1.5">
              {project.teamIds.map((id) => {
                const team = teams.get(id)
                return team && <TeamBadge key={id} icon={team.icon} color={team.color} />
              })}
            </span>
            <span className="flex items-center gap-1.5 tabular-nums">
              <ProgressRing value={project.progress} />
              {Math.round(project.progress * 100)}% complete
            </span>
          </div>
        </div>
      }
    />
  )
}
