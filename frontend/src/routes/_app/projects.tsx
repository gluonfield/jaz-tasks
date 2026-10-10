import { Link, createFileRoute } from '@tanstack/react-router'
import { Box, ChartGantt, List, type LucideIcon } from 'lucide-react'
import { CreateProjectButton } from '@/components/create-project'
import { DisplayMenu, DisplaySelect } from '@/components/display-menu'
import { ViewHeader } from '@/components/issue-view'
import { Avatar, EntityIcon, ProgressRing } from '@/components/icons'
import { ProjectStatusIcon } from '@/components/project-status'
import { ProjectTimeline } from '@/components/project-timeline'
import { formatDay } from '@/lib/issues'
import { useCatalogMaps } from '@/lib/queries'
import type { Zoom } from '@/lib/timeline'
import type { Project } from '@/lib/types'
import { usePreference } from '@/lib/ui'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app/projects')({ component: Projects })

const layouts: ['list' | 'timeline', LucideIcon][] = [
  ['list', List],
  ['timeline', ChartGantt],
]

const zoomOptions: [Zoom, string][] = [
  ['week', 'Week'],
  ['month', 'Month'],
  ['quarter', 'Quarter'],
  ['year', 'Year'],
]

function Projects() {
  const { catalog } = useCatalogMaps()
  const projects = catalog?.projects ?? []
  const [layout, setLayout] = usePreference<'list' | 'timeline'>('layout:projects', 'timeline')
  const [zoom, setZoom] = usePreference<Zoom>('zoom:projects', 'month')
  return (
    <div className="flex h-full flex-col">
      <ViewHeader
        title={
          <>
            <Box className="size-4 text-ink-2" /> Projects
          </>
        }
      >
        <CreateProjectButton />
        <DisplayMenu layouts={layouts} layout={layout} setLayout={setLayout}>
          {layout === 'timeline' && <DisplaySelect label="Zoom" value={zoom} options={zoomOptions} onChange={setZoom} />}
        </DisplayMenu>
      </ViewHeader>
      <div className="min-h-0 flex-1">
        {layout === 'list' ? (
          <ProjectList projects={projects} />
        ) : (
          // Mounting with its data keeps the router's scroll restoration on the scale it was saved under.
          catalog && <ProjectTimeline projects={catalog.projects} zoom={zoom} onZoom={setZoom} />
        )}
      </div>
    </div>
  )
}

const columns = 'grid grid-cols-[minmax(0,1fr)_110px_64px] md:grid-cols-[minmax(0,1fr)_140px_120px_110px_110px_90px]'

function ProjectList({ projects }: { projects: Project[] }) {
  const { users, teams } = useCatalogMaps()
  return (
    <div className="flex h-full flex-col">
      <div className={cn(columns, 'items-center border-b border-border px-5 py-2 text-[12px] text-ink-3')}>
        <span>Name</span>
        <span>Status</span>
        <span className="max-md:hidden">Lead</span>
        <span className="max-md:hidden">Target date</span>
        <span className="max-md:hidden">Teams</span>
        <span className="text-right">Progress</span>
      </div>
      <div className="scrollbar-quiet flex-1 overflow-y-auto pb-[var(--safe-area-bottom)]">
        {projects.map((project) => {
          const lead = project.leadId ? users.get(project.leadId) : null
          return (
            <Link
              key={project.id}
              to="/project/$slugId"
              params={{ slugId: project.slugId }}
              className={cn(columns, 'h-11 items-center border-b border-border/60 px-5 text-[13px] outline-none transition-colors hover:bg-list-hover')}
            >
              <span className="flex min-w-0 items-center gap-2.5 font-medium text-ink">
                <EntityIcon icon={project.icon} color={project.color} className="size-4" />
                <span className="truncate">{project.name}</span>
              </span>
              <span className="flex items-center gap-2 text-ink-2">
                <ProjectStatusIcon type={project.status.type} color={project.status.color} />
                {project.status.name}
              </span>
              <span className="flex min-w-0 items-center gap-2 text-ink-2 max-md:hidden">
                <Avatar user={lead} size={16} />
                <span className="truncate">{lead?.name.split(' ')[0] ?? 'No lead'}</span>
              </span>
              <span className="text-[12.5px] text-ink-2 max-md:hidden">{project.targetDate ? formatDay(project.targetDate) : <span className="text-ink-3">—</span>}</span>
              <span className="truncate text-[12.5px] text-ink-3 max-md:hidden">{project.teamIds.map((id) => teams.get(id)?.key).join(', ')}</span>
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
