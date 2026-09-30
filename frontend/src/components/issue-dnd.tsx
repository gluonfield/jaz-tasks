import {
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { type ReactNode, useMemo, useState } from 'react'
import { type Ordering, sortOrderBetween } from '@/lib/issues'
import { useCatalogMaps, useUpdateIssue } from '@/lib/queries'
import type { IssuePatch } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { IssueGroup } from './issue-view'

type Groups = Record<string, string[]>

const toGroups = (groups: IssueGroup[]): Groups => Object.fromEntries(groups.map((g) => [g.key, g.issues.map((i) => i.id)]))

// A dropped issue settles into its slot as its lift shadow fades, so the
// overlay ends exactly as the resting issue looks.
export const dropAnimation: DropAnimation = {
  duration: 200,
  easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
  keyframes: ({ transform }) => [
    { transform: CSS.Transform.toString(transform.initial), boxShadow: getComputedStyle(document.documentElement).getPropertyValue('--shadow-raised') },
    { transform: CSS.Transform.toString(transform.final), boxShadow: 'none' },
  ],
}

// useGroupDrag moves issues between status groups, as board columns or list
// sections: a drop sets the status of the group it lands in and, under manual
// ordering, the sort order of its slot.
export function useGroupDrag(groups: IssueGroup[], ordering: Ordering) {
  const { catalog } = useCatalogMaps()
  const update = useUpdateIssue()
  const [activeId, setActiveId] = useState<string | null>(null)
  // arranged is the layout as the drag left it. It holds a dropped issue where
  // it landed until the issue list it was made from changes.
  const [arranged, setArranged] = useState<{ from: IssueGroup[]; groups: Groups } | null>(null)
  const saved = useMemo(() => toGroups(groups), [groups])
  const ids = arranged?.from === groups ? arranged.groups : saved
  const issues = useMemo(() => new Map(groups.flatMap((g) => g.issues).map((i) => [i.id, i])), [groups])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const groupOf = (id: string) => (id in ids ? id : Object.keys(ids).find((key) => ids[key].includes(id)))

  // The group under the pointer takes the issue, even an empty one beside a
  // full one, and its nearest issue sets the slot. The keyboard, which has no
  // pointer, falls back to nearest corners.
  const collisionDetection: CollisionDetection = (args) => {
    const group = pointerWithin(args)
      .map(({ id }) => groupOf(String(id)))
      .find((key) => key !== undefined)
    if (!group) {
      return closestCorners(args)
    }
    const items = args.droppableContainers.filter((c) => ids[group].includes(String(c.id)))
    return items.length ? closestCenter({ ...args, droppableContainers: items }) : [{ id: group }]
  }

  // Crossing into another group moves the issue there, above or below the
  // issue it hovers, so the view shows where it will land.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    const id = String(active.id)
    const from = groupOf(id)
    const to = over && groupOf(String(over.id))
    if (!over || !from || !to || from === to) {
      return
    }
    const target = ids[to]
    const translated = active.rect.current.translated
    const below = !!translated && translated.top + translated.height / 2 > over.rect.top + over.rect.height / 2
    const index = over.id === to ? target.length : target.indexOf(String(over.id)) + (below ? 1 : 0)
    setArranged({
      from: groups,
      groups: { ...ids, [from]: ids[from].filter((c) => c !== id), [to]: [...target.slice(0, index), id, ...target.slice(index)] },
    })
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null)
    const id = String(active.id)
    const issue = issues.get(id)
    const group = groupOf(id)
    const state = catalog?.states.find((s) => s.teamId === issue?.teamId && `${s.type}:${s.name}` === group)
    if (!issue || !group || !over || !state) {
      setArranged(null)
      return
    }
    const overIndex = ids[group].indexOf(String(over.id))
    const order = overIndex < 0 ? ids[group] : arrayMove(ids[group], ids[group].indexOf(id), overIndex)
    setArranged({ from: groups, groups: { ...ids, [group]: order } })
    const index = order.indexOf(id)
    const patch: IssuePatch = {}
    if (state.id !== issue.stateId) {
      patch.stateId = state.id
    }
    if (ordering === 'manual' && saved[group]?.indexOf(id) !== index) {
      patch.sortOrder = sortOrderBetween(issues.get(order[index - 1]), issues.get(order[index + 1]))
    }
    if (Object.keys(patch).length) {
      update.mutate({ id, patch })
    }
  }

  const activeIssue = activeId ? issues.get(activeId) : undefined
  // The lifted issue shows the status of the group it is over.
  const activeState = activeId ? groups.find((g) => g.key === groupOf(activeId))?.state : undefined
  return {
    ids,
    issues,
    active: activeIssue && activeState ? { ...activeIssue, stateId: activeState.id } : activeIssue,
    context: {
      sensors,
      collisionDetection,
      onDragStart: ({ active }: DragStartEvent) => setActiveId(String(active.id)),
      onDragOver,
      onDragEnd,
      onDragCancel: () => {
        setActiveId(null)
        setArranged(null)
      },
    },
  }
}

export function SortableIssue({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn(isDragging && 'opacity-40')} {...attributes} {...listeners}>
      {children}
    </div>
  )
}
