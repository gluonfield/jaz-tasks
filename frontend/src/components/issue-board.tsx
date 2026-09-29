import {
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import { type Ordering, sortOrderBetween } from '@/lib/issues'
import { useCatalogMaps, useUpdateIssue } from '@/lib/queries'
import type { Issue, IssuePatch } from '@/lib/types'
import { openCreateIssue, setUI, useUI } from '@/lib/ui'
import { cn } from '@/lib/utils'
import { EntityIcon, LabelDot } from './icons'
import { type IssueGroup, useListNavigation } from './issue-view'
import { AssigneePicker, DueDatePicker, PriorityPicker, ShortcutPicker, useStateIcon } from './properties'
import { useIssuePatch } from './issue-row'

const toColumns = (groups: IssueGroup[]): Record<string, string[]> => Object.fromEntries(groups.map((g) => [g.key, g.issues.map((i) => i.id)]))

type Drop = { column: string; index: number }

export function IssueBoard({
  groups,
  ordering,
  createDefaults,
}: {
  groups: IssueGroup[]
  ordering: Ordering
  createDefaults?: IssuePatch & { teamId?: string }
}) {
  const { catalog } = useCatalogMaps()
  const update = useUpdateIssue()
  const stateIcon = useStateIcon()
  const [activeId, setActiveId] = useState<string | null>(null)
  // drop is where a card dragged from another column would land.
  const [drop, setDrop] = useState<Drop | null>(null)
  const columns = useMemo(() => toColumns(groups), [groups])
  const issues = useMemo(() => new Map(groups.flatMap((g) => g.issues).map((i) => [i.id, i])), [groups])
  const ordered = useMemo(() => groups.flatMap((g) => g.issues), [groups])
  useListNavigation(ordered)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const columnOf = (id: string) => (id in columns ? id : Object.keys(columns).find((key) => columns[key].includes(id)))

  // target resolves a drop into a column and an index in it, without the
  // dragged card; within its own column a card takes the index it hovers.
  const target = ({ active, over }: DragMoveEvent): Drop | null => {
    const column = over && columnOf(String(over.id))
    if (!over || !column) {
      return null
    }
    const ids = columns[column].filter((id) => id !== active.id)
    if (over.id === column) {
      return { column, index: ids.length }
    }
    if (column === columnOf(String(active.id))) {
      return { column, index: columns[column].indexOf(String(over.id)) }
    }
    const translated = active.rect.current.translated
    const below = !!translated && translated.top + translated.height / 2 > over.rect.top + over.rect.height / 2
    return { column, index: ids.indexOf(String(over.id)) + (below ? 1 : 0) }
  }

  const onDragMove = (event: DragMoveEvent) => {
    const next = target(event)
    const cross = next && next.column !== columnOf(String(event.active.id)) ? next : null
    setDrop((prev) => (prev?.column === cross?.column && prev?.index === cross?.index ? prev : cross))
  }

  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    setDrop(null)
    const issue = issues.get(String(event.active.id))
    const to = target(event)
    if (!issue || !to) {
      return
    }
    const ids = columns[to.column].filter((id) => id !== issue.id)
    const group = groups.find((g) => g.key === to.column)!
    const state = catalog?.states.find((s) => s.teamId === issue.teamId && `${s.type}:${s.name}` === group.key)
    const patch: IssuePatch = {}
    if (state && state.id !== issue.stateId) {
      patch.stateId = state.id
    }
    if (ordering === 'manual') {
      const sortOrder = sortOrderBetween(issues.get(ids[to.index - 1]), issues.get(ids[to.index]))
      if (sortOrder !== issue.sortOrder && columns[to.column].indexOf(issue.id) !== to.index) {
        patch.sortOrder = sortOrder
      }
    }
    if (Object.keys(patch).length) {
      update.mutate({ id: issue.id, patch })
    }
  }

  const active = activeId ? issues.get(activeId) : undefined
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={({ active }) => setActiveId(String(active.id))}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null)
        setDrop(null)
      }}
    >
      <div className="scrollbar-quiet flex h-full gap-2.5 overflow-x-auto p-3">
        {groups.map((group) => {
          const ids = columns[group.key]
          const others = ids.filter((id) => id !== activeId)
          return (
            <Column key={group.key} id={group.key} highlighted={drop?.column === group.key}>
              <div className="flex h-9 shrink-0 items-center gap-2 px-2 text-[13px] font-medium text-ink">
                {stateIcon(group.state)}
                <span className="truncate">{group.state.name}</span>
                <span className="font-normal tabular-nums text-ink-3">{ids.length}</span>
                <button
                  aria-label={`Create issue in ${group.state.name}`}
                  onClick={() => openCreateIssue({ ...createDefaults, teamId: group.state.teamId, stateId: group.state.id })}
                  className="ml-auto flex size-6 items-center justify-center rounded-[5px] text-ink-3 outline-none hover:bg-list-hover hover:text-ink"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <div className="scrollbar-quiet flex min-h-16 flex-1 flex-col gap-1.5 overflow-y-auto px-1.5 pb-3">
                  {ids.map((id) => {
                    const issue = issues.get(id)!
                    return (
                      <div key={id} className="relative">
                        {drop?.column === group.key && others[drop.index] === id && <DropLine />}
                        <SortableCard issue={issue} />
                      </div>
                    )
                  })}
                  {drop?.column === group.key && drop.index >= others.length && <DropLine last />}
                </div>
              </SortableContext>
            </Column>
          )
        })}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' }}>
        {active && <IssueCard issue={active} lifted />}
      </DragOverlay>
    </DndContext>
  )
}

function DropLine({ last = false }: { last?: boolean }) {
  return <span className={cn('pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-primary', last ? 'relative block' : '-top-1')} />
}

function Column({ id, highlighted, children }: { id: string; highlighted: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-[330px] shrink-0 flex-col rounded-[var(--radius-card)] bg-[color-mix(in_oklab,var(--color-surface)_55%,var(--color-bg))] transition-colors duration-150',
        (isOver || highlighted) && 'bg-[color-mix(in_oklab,var(--color-surface)_85%,var(--color-bg))]',
      )}
    >
      {children}
    </div>
  )
}

function SortableCard({ issue }: { issue: Issue }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: issue.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && 'opacity-40')}
      {...attributes}
      {...listeners}
    >
      <IssueCard issue={issue} />
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
    <div
      data-issue-id={issue.id}
      onMouseMove={() => !focused && setUI({ focusedIssueId: issue.id })}
      onClick={() => navigate({ to: '/issue/$identifier', params: { identifier: issue.identifier } })}
      className={cn(
        'relative cursor-default rounded-[8px] border border-border bg-raised px-3 pb-2.5 pt-2 text-[13px] shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-[border-color,box-shadow] duration-100 hover:border-[color-mix(in_oklab,var(--color-ink)_16%,transparent)]',
        focused && 'border-[color-mix(in_oklab,var(--color-ink)_16%,transparent)]',
        lifted && 'rotate-[1.5deg] shadow-[var(--shadow-raised)]',
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
  )
})
