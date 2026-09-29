import { Link, createFileRoute } from '@tanstack/react-router'
import { Box } from 'lucide-react'
import { CreateProjectButton } from '@/components/create-project'
import { Avatar, EntityIcon, ProgressRing } from '@/components/icons'
import { ProjectStatusIcon } from '@/components/project-status'
import { formatDay } from '@/lib/issues'
import { useCatalogMaps } from '@/lib/queries'

export const Route = createFileRoute('/_app/projects')({ component: Projects })

function Projects() {
  const { catalog, users, teams } = useCatalogMaps()
  const projects = catalog?.projects ?? []
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4 text-[13px] font-medium text-ink">
        <Box className="size-4 text-ink-2" /> Projects
        <CreateProjectButton />
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)_140px_120px_110px_110px_90px] items-center border-b border-border px-5 py-2 text-[12px] text-ink-3">
        <span>Name</span>
        <span>Status</span>
        <span>Lead</span>
        <span>Target date</span>
        <span>Teams</span>
        <span className="text-right">Progress</span>
      </div>
      <div className="scrollbar-quiet flex-1 overflow-y-auto">
        {projects.map((project) => {
          const lead = project.leadId ? users.get(project.leadId) : null
          return (
            <Link
              key={project.id}
              to="/project/$slugId"
              params={{ slugId: project.slugId }}
              className="grid h-11 grid-cols-[minmax(0,1fr)_140px_120px_110px_110px_90px] items-center border-b border-border/60 px-5 text-[13px] outline-none transition-colors hover:bg-list-hover"
            >
              <span className="flex min-w-0 items-center gap-2.5 font-medium text-ink">
                <EntityIcon icon={project.icon} color={project.color} className="size-4" />
                <span className="truncate">{project.name}</span>
              </span>
              <span className="flex items-center gap-2 text-ink-2">
                <ProjectStatusIcon type={project.status.type} color={project.status.color} />
                {project.status.name}
              </span>
              <span className="flex min-w-0 items-center gap-2 text-ink-2">
                <Avatar user={lead} size={16} />
                <span className="truncate">{lead?.name.split(' ')[0] ?? 'No lead'}</span>
              </span>
              <span className="text-[12.5px] text-ink-2">{project.targetDate ? formatDay(project.targetDate) : <span className="text-ink-3">—</span>}</span>
              <span className="truncate text-[12.5px] text-ink-3">{project.teamIds.map((id) => teams.get(id)?.key).join(', ')}</span>
              <span className="flex items-center justify-end gap-2 text-[12.5px] tabular-nums text-ink-2">
                <ProgressRing value={project.progress} />
                {Math.round(project.progress * 100)}%
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
