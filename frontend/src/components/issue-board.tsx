import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DropAnimation,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import { type Ordering, sortOrderBetween, workflowOrder } from '@/lib/issues'
import { useCatalogMaps, useIssuePatch, useUpdateIssue } from '@/lib/queries'
import type { Issue, IssuePatch } from '@/lib/types'
import { openCreateIssue, setUI, useUI } from '@/lib/ui'
import { cn } from '@/lib/utils'
import { EntityIcon, LabelDot } from './icons'
import { type IssueGroup, useListNavigation } from './issue-view'
import { AssigneePicker, DueDatePicker, PriorityPicker, ShortcutPicker, SubIssueCount, useStateIcon } from './properties'
import { IssueContextMenu } from './issue-menu'

type Columns = Record<string, string[]>

const toColumns = (groups: IssueGroup[]): Columns => Object.fromEntries(groups.map((g) => [g.key, g.issues.map((i) => i.id)]))

// A dropped card settles into its slot as its lift shadow fades, so the
// overlay ends exactly as the resting card looks.
const dropAnimation: DropAnimation = {
  duration: 200,
  easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
  keyframes: ({ transform }) => [
    { transform: CSS.Transform.toString(transform.initial), boxShadow: getComputedStyle(document.documentElement).getPropertyValue('--shadow-raised') },
    { transform: CSS.Transform.toString(transform.final), boxShadow: 'none' },
  ],
}

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
  // arranged is the board as the drag left it. It holds a dropped card where it
  // landed until the issue list it was made from changes.
  const [arranged, setArranged] = useState<{ from: IssueGroup[]; columns: Columns } | null>(null)
  const board = useMemo(() => [...groups].sort((a, b) => workflowOrder(a.state, b.state)), [groups])
  const saved = useMemo(() => toColumns(board), [board])
  const columns = arranged?.from === groups ? arranged.columns : saved
  const issues = useMemo(() => new Map(groups.flatMap((g) => g.issues).map((i) => [i.id, i])), [groups])
  const ordered = useMemo(() => board.flatMap((g) => g.issues), [board])
  useListNavigation(ordered)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const columnOf = (id: string) => (id in columns ? id : Object.keys(columns).find((key) => columns[key].includes(id)))

  // The column under the pointer takes the card, even an empty one beside a
  // full column, and its nearest card sets the slot. The keyboard, which has
  // no pointer, falls back to nearest corners.
  const collisionDetection: CollisionDetection = (args) => {
    const column = pointerWithin(args)
      .map(({ id }) => columnOf(String(id)))
      .find((key) => key !== undefined)
    if (!column) {
      return closestCorners(args)
    }
    const cards = args.droppableContainers.filter((c) => columns[column].includes(String(c.id)))
    return cards.length ? closestCenter({ ...args, droppableContainers: cards }) : [{ id: column }]
  }

  // Crossing into another column moves the card there, above or below the
  // card it hovers, so the board shows where it will land.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    const id = String(active.id)
    const from = columnOf(id)
    const to = over && columnOf(String(over.id))
    if (!over || !from || !to || from === to) {
      return
    }
    const target = columns[to]
    const translated = active.rect.current.translated
    const below = !!translated && translated.top + translated.height / 2 > over.rect.top + over.rect.height / 2
    const index = over.id === to ? target.length : target.indexOf(String(over.id)) + (below ? 1 : 0)
    setArranged({
      from: groups,
      columns: { ...columns, [from]: columns[from].filter((c) => c !== id), [to]: [...target.slice(0, index), id, ...target.slice(index)] },
    })
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null)
    const id = String(active.id)
    const issue = issues.get(id)
    const column = columnOf(id)
    const state = catalog?.states.find((s) => s.teamId === issue?.teamId && `${s.type}:${s.name}` === column)
    if (!issue || !column || !over || !state) {
      setArranged(null)
      return
    }
    const overIndex = columns[column].indexOf(String(over.id))
    const ids = overIndex < 0 ? columns[column] : arrayMove(columns[column], columns[column].indexOf(id), overIndex)
    setArranged({ from: groups, columns: { ...columns, [column]: ids } })
    const index = ids.indexOf(id)
    const patch: IssuePatch = {}
    if (state.id !== issue.stateId) {
      patch.stateId = state.id
    }
    if (ordering === 'manual' && saved[column]?.indexOf(id) !== index) {
      patch.sortOrder = sortOrderBetween(issues.get(ids[index - 1]), issues.get(ids[index + 1]))
    }
    if (Object.keys(patch).length) {
      update.mutate({ id, patch })
    }
  }

  const active = activeId ? issues.get(activeId) : undefined
  // The lifted card shows the status of the column it is over.
  const activeState = activeId ? board.find((g) => g.key === columnOf(activeId))?.state : undefined
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      // Scroll only from the board's outer edge; the default 20% band scrolled
      // columns out from under the pointer.
      autoScroll={{ threshold: { x: 0.05, y: 0.1 } }}
      onDragStart={({ active }) => setActiveId(String(active.id))}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null)
        setArranged(null)
      }}
    >
      <div className="scrollbar-quiet flex h-full gap-2.5 overflow-x-auto p-3">
        {board.map((group) => {
          const ids = columns[group.key]
          return (
            <Column key={group.key} id={group.key}>
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
                  {ids.map((id) => (
                    <SortableCard key={id} issue={issues.get(id)!} />
                  ))}
                </div>
              </SortableContext>
            </Column>
          )
        })}
      </div>
      <DragOverlay dropAnimation={dropAnimation} className="rounded-[8px] shadow-[var(--shadow-raised)]">
        {active && <IssueCard issue={activeState ? { ...active, stateId: activeState.id } : active} lifted />}
      </DragOverlay>
    </DndContext>
  )
}

function Column({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className="flex w-[330px] shrink-0 flex-col rounded-[var(--radius-card)] bg-[color-mix(in_oklab,var(--color-surface)_55%,var(--color-bg))]"
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
    <IssueContextMenu issue={issue}>
      <div
        data-issue-id={issue.id}
        onMouseMove={() => !focused && setUI({ focusedIssueId: issue.id })}
        onClick={() => navigate({ to: '/issue/$identifier', params: { identifier: issue.identifier } })}
        className={cn(
          'relative cursor-default rounded-[8px] border border-border bg-raised px-3 pb-2.5 pt-2 text-[13px] shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-[border-color,box-shadow] duration-100 hover:border-[color-mix(in_oklab,var(--color-ink)_16%,transparent)]',
          focused && 'border-[color-mix(in_oklab,var(--color-ink)_16%,transparent)]',
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
