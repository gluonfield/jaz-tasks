import { useNavigate } from '@tanstack/react-router'
import { memo } from 'react'
import { formatDate } from '@/lib/issues'
import { useCatalogMaps, useIssuePatch } from '@/lib/queries'
import type { Issue } from '@/lib/types'
import { setUI } from '@/lib/ui'
import { cn } from '@/lib/utils'
import { EntityIcon, LabelDot } from './icons'
import { IssueContextMenu } from './issue-menu'
import { AssigneePicker, DueDatePicker, PriorityPicker, ShortcutPicker, StatusPicker, SubIssueCount } from './properties'

export const IssueRow = memo(function IssueRow({ issue, focused }: { issue: Issue; focused: boolean }) {
  const navigate = useNavigate()
  const { labels, projects, states } = useCatalogMaps()
  const patch = useIssuePatch(issue)
  const state = states.get(issue.stateId)
  const done = state?.type === 'completed' || state?.type === 'canceled'
  const project = issue.projectId ? projects.get(issue.projectId) : null
  const issueLabels = issue.labelIds.map((id) => labels.get(id)).filter((l) => l !== undefined)
  return (
    <IssueContextMenu issue={issue}>
      <div
        role="row"
        data-issue-id={issue.id}
        onMouseMove={() => !focused && setUI({ focusedIssueId: issue.id })}
        onClick={() => navigate({ to: '/issue/$identifier', params: { identifier: issue.identifier } })}
        className={cn(
          'group relative flex min-h-9 cursor-default items-center gap-2 pl-[18px] pr-4 text-[13px] transition-colors duration-75 pointer-coarse:min-h-11 max-md:flex-wrap max-md:gap-x-1.5 max-md:gap-y-0.5 max-md:py-2',
          focused && 'bg-list-hover',
        )}
      >
        {focused && <span className="absolute inset-y-0 left-0 w-[2px] bg-primary/70" />}
        <ShortcutPicker issue={issue} visible={issue.dueDate ? ['priority', 'status', 'assignee', 'dueDate'] : ['priority', 'status', 'assignee']} />
        <PriorityPicker variant="icon" value={issue.priority} onChange={(priority) => patch({ priority })} teamId={issue.teamId} issueId={issue.id} />
        <span className="w-[62px] shrink-0 truncate text-[12.5px] text-ink-3 max-md:w-auto">{issue.identifier}</span>
        <StatusPicker variant="icon" value={issue.stateId} onChange={(stateId) => patch({ stateId })} teamId={issue.teamId} issueId={issue.id} className="-ml-1 max-md:-order-1" />
        <span className="flex min-w-0 flex-1 items-center gap-2 max-md:contents">
          <span className={cn('truncate font-medium text-ink max-md:order-first max-md:line-clamp-2 max-md:basis-full max-md:whitespace-normal', done && 'text-ink-2')}>{issue.title}</span>
          <SubIssueCount issueId={issue.id} />
        </span>
        <div className="flex shrink-0 items-center gap-1.5 max-md:flex-1">
          {issueLabels.slice(0, 3).map((label) => (
            <span key={label.id} className="hidden h-[22px] items-center gap-1.5 rounded-full border border-border px-2 text-[12px] text-ink-2 md:inline-flex">
              <LabelDot color={label.color} />
              {label.name}
            </span>
          ))}
          {project && (
            <span className="hidden h-[22px] max-w-40 items-center gap-1.5 rounded-full border border-border px-2 text-[12px] text-ink-2 lg:inline-flex">
              <EntityIcon icon={project.icon} color={project.color} className="size-3" />
              <span className="truncate">{project.name}</span>
            </span>
          )}
          {issue.dueDate && (
            <DueDatePicker
              variant="chip"
              value={issue.dueDate}
              onChange={(dueDate) => patch({ dueDate })}
              teamId={issue.teamId}
              issueId={issue.id}
              done={done}
              className="h-[22px] rounded-full max-md:border-transparent max-md:bg-transparent max-md:px-1"
            />
          )}
          {issueLabels.length > 0 && (
            <span className="flex -space-x-0.5 md:hidden">
              {issueLabels.map((label) => (
                <LabelDot key={label.id} color={label.color} className="ring-2 ring-bg" />
              ))}
            </span>
          )}
          <span className="w-14 text-right text-[12px] tabular-nums text-ink-3 max-md:hidden">{formatDate(issue.createdAt)}</span>
          <AssigneePicker variant="icon" value={issue.assigneeId} onChange={(assigneeId) => patch({ assigneeId })} teamId={issue.teamId} issueId={issue.id} className="max-md:ml-auto" />
        </div>
      </div>
    </IssueContextMenu>
  )
})
