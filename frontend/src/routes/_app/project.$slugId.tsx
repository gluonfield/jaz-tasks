import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { EditableLine, EditableMarkdown } from '@/components/editable'
import { EntityIcon, ProgressRing } from '@/components/icons'
import { IssueView, Tab, ViewHeader } from '@/components/issue-view'
import { ProjectProperties } from '@/components/project-properties'
import { type ProjectPatch, useCatalogMaps, useIssues, useProjectContent, useUpdateProject } from '@/lib/queries'
import type { Project } from '@/lib/types'
import { usePreference } from '@/lib/ui'

export const Route = createFileRoute('/_app/project/$slugId')({ component: ProjectPage })

function ProjectPage() {
  const { slugId } = Route.useParams()
  const { catalog } = useCatalogMaps()
  const { data: issues, isLoading } = useIssues()
  const [tab, setTab] = usePreference<'overview' | 'issues'>('project:tab', 'overview')
  const project = catalog?.projects.find((p) => p.slugId === slugId)
  const projectIssues = useMemo(() => (issues ?? []).filter((i) => i.projectId === project?.id), [issues, project])
  if (!project) {
    return null
  }
  const title = (
    <>
      <Link to="/projects" className="text-ink-2 outline-none hover:text-ink">
        Projects
      </Link>
      <ChevronRight className="size-3 text-ink-3" />
      <EntityIcon icon={project.icon} color={project.color} />
      {project.name}
    </>
  )
  const tabs = (
    <>
      <Tab active={tab === 'overview'} onClick={() => setTab('overview')}>
        Overview
      </Tab>
      <Tab active={tab === 'issues'} onClick={() => setTab('issues')}>
        Issues
      </Tab>
    </>
  )
  if (tab === 'issues') {
    return (
      <IssueView
        viewKey={`project:${project.id}`}
        loading={isLoading}
        issues={projectIssues}
        createDefaults={{ projectId: project.id, teamId: project.teamIds[0] }}
        title={title}
        tabs={tabs}
      />
    )
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader title={title} tabs={tabs} />
      <Overview key={project.id} project={project} />
    </div>
  )
}

// Overview is Linear's project page: the summary, the properties and the brief.
function Overview({ project }: { project: Project }) {
  const update = useUpdateProject()
  const patch = (value: ProjectPatch) => update.mutate({ id: project.id, patch: value })
  const content = useProjectContent(project.id)
  return (
    <div className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[760px] px-8 pb-24 pt-10">
        <span className="flex size-10 items-center justify-center rounded-[10px]" style={{ background: `color-mix(in oklab, ${project.color} 16%, transparent)` }}>
          <EntityIcon icon={project.icon} color={project.color} className="size-5" />
        </span>
        <EditableLine
          key={project.name}
          value={project.name}
          placeholder="Project name"
          required
          onSave={(name) => patch({ name })}
          className="mt-4 text-[24px] font-semibold tracking-[-0.01em]"
        />
        <EditableLine
          key={project.description}
          value={project.description}
          placeholder="Add a short summary..."
          onSave={(description) => patch({ description })}
          className="mt-1 text-[15px] text-ink-2"
        />
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <ProjectProperties
            value={{ statusId: project.status.id, leadId: project.leadId, teamIds: project.teamIds, startDate: project.startDate, targetDate: project.targetDate }}
            onChange={patch}
          />
          <span className="flex items-center gap-1.5 text-[12.5px] tabular-nums text-ink-2">
            <ProgressRing value={project.progress} />
            {Math.round(project.progress * 100)}% complete
          </span>
        </div>
        <div className="mt-6 border-t border-border" />
        {content.isSuccess && (
          <EditableMarkdown
            key={content.data ?? ''}
            value={content.data}
            placeholder="Write a description, a project brief, or collect ideas..."
            onSave={(text) => patch({ content: text })}
            className="mt-6"
          />
        )}
      </div>
    </div>
  )
}
