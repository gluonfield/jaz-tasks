import { useNavigate } from '@tanstack/react-router'
import { memo } from 'react'
import { formatDate } from '@/lib/issues'
import { useCatalogMaps, useUpdateIssue } from '@/lib/queries'
import type { Issue, IssuePatch } from '@/lib/types'
import { setUI } from '@/lib/ui'
import { cn } from '@/lib/utils'
import { EntityIcon, LabelDot } from './icons'
import { AssigneePicker, DueDatePicker, PriorityPicker, ShortcutPicker, StatusPicker } from './properties'

export function useIssuePatch(issue: Issue) {
  const update = useUpdateIssue()
  return (patch: IssuePatch) => update.mutate({ id: issue.id, patch })
}

export const IssueRow = memo(function IssueRow({ issue, focused }: { issue: Issue; focused: boolean }) {
  const navigate = useNavigate()
  const { labels, projects, states } = useCatalogMaps()
  const patch = useIssuePatch(issue)
  const state = states.get(issue.stateId)
  const done = state?.type === 'completed' || state?.type === 'canceled'
  const project = issue.projectId ? projects.get(issue.projectId) : null
  const issueLabels = issue.labelIds.map((id) => labels.get(id)).filter((l) => l !== undefined)
  return (
    <div
      role="row"
      data-issue-id={issue.id}
      onMouseMove={() => !focused && setUI({ focusedIssueId: issue.id })}
      onClick={() => navigate({ to: '/issue/$identifier', params: { identifier: issue.identifier } })}
      className={cn(
        'group relative flex h-9 cursor-default items-center gap-2 border-b border-border/60 pl-[18px] pr-4 text-[13px] transition-colors duration-75',
        focused && 'bg-list-hover',
      )}
    >
      {focused && <span className="absolute inset-y-0 left-0 w-[2px] bg-primary/70" />}
      <ShortcutPicker issue={issue} visible={issue.dueDate ? ['priority', 'status', 'assignee', 'dueDate'] : ['priority', 'status', 'assignee']} />
      <PriorityPicker variant="icon" value={issue.priority} onChange={(priority) => patch({ priority })} teamId={issue.teamId} issueId={issue.id} />
      <span className="w-[62px] shrink-0 truncate text-[12.5px] text-ink-3">{issue.identifier}</span>
      <StatusPicker variant="icon" value={issue.stateId} onChange={(stateId) => patch({ stateId })} teamId={issue.teamId} issueId={issue.id} className="-ml-1" />
      <span className={cn('min-w-0 flex-1 truncate font-medium text-ink', done && 'text-ink-2')}>{issue.title}</span>
      <div className="flex shrink-0 items-center gap-1.5">
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
            className="h-[22px] rounded-full"
          />
        )}
        <span className="w-14 text-right text-[12px] tabular-nums text-ink-3">{formatDate(issue.createdAt)}</span>
        <AssigneePicker variant="icon" value={issue.assigneeId} onChange={(assigneeId) => patch({ assigneeId })} teamId={issue.teamId} issueId={issue.id} />
      </div>
    </div>
  )
})
