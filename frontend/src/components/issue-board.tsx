import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { memo, useMemo } from 'react'
import { type Ordering, workflowOrder } from '@/lib/issues'
import { useCatalogMaps, useIssuePatch } from '@/lib/queries'
import type { Issue, IssuePatch } from '@/lib/types'
import { openCreateIssue, setUI, useUI } from '@/lib/ui'
import { cn } from '@/lib/utils'
import { EntityIcon, LabelDot } from './icons'
import { SortableIssue, dropAnimation, useGroupDrag } from './issue-dnd'
import { type IssueGroup, useListNavigation } from './issue-view'
import { AssigneePicker, DueDatePicker, PriorityPicker, ShortcutPicker, SubIssueCount, useStateIcon } from './properties'
import { IssueContextMenu } from './issue-menu'

export function IssueBoard({
  groups,
  ordering,
  createDefaults,
}: {
  groups: IssueGroup[]
  ordering: Ordering
  createDefaults?: IssuePatch & { teamId?: string }
}) {
  const stateIcon = useStateIcon()
  const board = useMemo(() => [...groups].sort((a, b) => workflowOrder(a.state, b.state)), [groups])
  const { ids, issues, active, context } = useGroupDrag(board, ordering)
  const ordered = useMemo(() => board.flatMap((g) => g.issues), [board])
  useListNavigation(ordered)

  return (
    // Scroll only from the board's outer edge; the default 20% band scrolled
    // columns out from under the pointer.
    <DndContext {...context} autoScroll={{ threshold: { x: 0.05, y: 0.1 } }}>
      <div className="scrollbar-quiet flex h-full gap-2.5 overflow-x-auto p-3">
        {board.map((group) => {
          const create = () => openCreateIssue({ ...createDefaults, teamId: group.state.teamId, stateId: group.state.id })
          return (
            <Column key={group.key} id={group.key}>
              <div className="flex h-9 shrink-0 items-center gap-2 px-2 text-[13px] font-medium text-ink">
                {stateIcon(group.state)}
                <span className="truncate">{group.state.name}</span>
                <span className="font-normal tabular-nums text-ink-3">{ids[group.key].length}</span>
                <button
                  aria-label={`Create issue in ${group.state.name}`}
                  onClick={create}
                  className="ml-auto flex size-6 items-center justify-center rounded-[5px] text-ink-3 outline-none hover:bg-list-hover hover:text-ink"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
              <SortableContext items={ids[group.key]} strategy={verticalListSortingStrategy}>
                <div className="scrollbar-quiet flex min-h-16 flex-1 flex-col gap-1.5 overflow-y-auto px-1.5 pb-3">
                  {ids[group.key].map((id) => (
                    <SortableIssue key={id} id={id}>
                      <IssueCard issue={issues.get(id)!} />
                    </SortableIssue>
                  ))}
                  {!active && (
                    <button
                      aria-label={`Create issue in ${group.state.name}`}
                      onClick={create}
                      className="flex h-8 shrink-0 items-center justify-center rounded-[8px] bg-tile text-ink-3 opacity-0 outline-none transition-[opacity,background-color,color] duration-100 hover:bg-tile-hover hover:text-ink focus-visible:opacity-100 group-hover/column:opacity-100"
                    >
                      <Plus className="size-4" />
                    </button>
                  )}
                </div>
              </SortableContext>
            </Column>
          )
        })}
      </div>
      <DragOverlay dropAnimation={dropAnimation} className="rounded-[8px] shadow-[var(--shadow-raised)]">
        {active && <IssueCard issue={active} lifted />}
      </DragOverlay>
    </DndContext>
  )
}

function Column({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className="group/column flex w-[330px] shrink-0 flex-col rounded-[var(--radius-card)] bg-column"
    >
      {children}
    </div>
  )
}

const IssueCard = memo(function IssueCard({ issue, lifted = false }: { issue: Issue; lifted?: boolean }) {
  const navigate = useNavigate()
  const { labels, projects, states } = useCatalogMaps()
  const focused = useUI((s) => s.focusedIssueId === issue.id)
  const patch = useIssuePatch(issue)
  const stateIcon = useStateIcon()
  const state = states.get(issue.stateId)
  const project = issue.projectId ? projects.get(issue.projectId) : null
  const issueLabels = issue.labelIds.map((id) => labels.get(id)).filter((l) => l !== undefined)
  const done = state?.type === 'completed' || state?.type === 'canceled'
  return (
    <IssueContextMenu issue={issue}>
      <div
        data-issue-id={issue.id}
        onMouseMove={() => !focused && setUI({ focusedIssueId: issue.id })}
        onClick={() => navigate({ to: '/issue/$identifier', params: { identifier: issue.identifier } })}
        className={cn(
          'relative cursor-default rounded-[8px] bg-tile px-3 pb-2.5 pt-2 text-[13px] shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-colors duration-100 hover:bg-tile-hover',
          focused && 'bg-tile-hover',
        )}
      >
        {!lifted && <ShortcutPicker issue={issue} visible={['assignee', 'priority']} />}
        <div className="flex h-5 items-center justify-between">
          <span className="text-[12px] text-ink-3">{issue.identifier}</span>
          <AssigneePicker variant="icon" value={issue.assigneeId} onChange={(assigneeId) => patch({ assigneeId })} teamId={issue.teamId} className="-mr-1.5 size-5" />
        </div>
        <div className="mt-0.5 flex gap-2">
          {state && <span className="mt-[3px]">{stateIcon(state)}</span>}
          <span className={cn('line-clamp-2 font-medium leading-[19px] text-ink', done && 'text-ink-2')}>{issue.title}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <PriorityPicker variant="icon" value={issue.priority} onChange={(priority) => patch({ priority })} teamId={issue.teamId} className="size-[22px] rounded-[5px] border border-border" />
          <SubIssueCount issueId={issue.id} className="h-[22px] rounded-full border border-border px-2" />
          {issueLabels.map((label) => (
            <span key={label.id} className="inline-flex h-[22px] items-center gap-1.5 rounded-full border border-border px-2 text-[12px] text-ink-2">
              <LabelDot color={label.color} />
              {label.name}
            </span>
          ))}
          {project && (
            <span className="inline-flex h-[22px] max-w-44 items-center gap-1.5 rounded-full border border-border px-2 text-[12px] text-ink-2">
              <EntityIcon icon={project.icon} color={project.color} className="size-3" />
              <span className="truncate">{project.name}</span>
            </span>
          )}
          {issue.dueDate && (
            <DueDatePicker variant="chip" value={issue.dueDate} onChange={(dueDate) => patch({ dueDate })} teamId={issue.teamId} done={done} className="h-[22px] rounded-full" />
          )}
        </div>
      </div>
    </IssueContextMenu>
  )
})
