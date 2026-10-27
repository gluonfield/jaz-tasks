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
import { sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { type ReactNode, useMemo, useState } from 'react'
import { type Ordering, sortOrderBetween } from '@/lib/issues'
import { type IssueGroup, groupPatch, issueGroupId } from '@/lib/issue-groups'
import { useCatalogMaps, useUpdateIssue } from '@/lib/queries'
import { cn } from '@/lib/utils'

type Groups = Record<string, string[]>

const toGroups = (groups: IssueGroup[]): Groups => Object.fromEntries(groups.map((g) => [g.key, g.issues.map((i) => issueGroupId(g, i))]))

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

export function useGroupDrag(groups: IssueGroup[], ordering: Ordering) {
  const { catalog } = useCatalogMaps()
  const update = useUpdateIssue()
  const [activeId, setActiveId] = useState<string | null>(null)
  const ids = useMemo(() => toGroups(groups), [groups])
  const [overGroup, setOverGroup] = useState<string | null>(null)
  const issues = useMemo(() => new Map(groups.flatMap((g) => g.issues.map((issue) => [issueGroupId(g, issue), issue] as const))), [groups])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const groupOf = (id: string) => (id in ids ? id : Object.keys(ids).find((key) => ids[key].includes(id)))
  const sourceOf = (id: string) => groups.find((group) => ids[group.key].includes(id))

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

  const onDragOver = ({ over }: DragOverEvent) => setOverGroup(over ? groupOf(String(over.id)) ?? null : null)

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null)
    setOverGroup(null)
    const id = String(active.id)
    const issue = issues.get(id)
    const source = sourceOf(id)
    const destination = over && groups.find((group) => group.key === groupOf(String(over.id)))
    const patch = issue && source && destination && groupPatch(issue, source, destination, catalog?.states ?? [])
    if (!issue || !source || !destination || !over || !patch) {
      return
    }
    const group = destination.key
    const target = ids[group].filter((key) => issues.get(key)?.id !== issue.id)
    const overIndex = source.key === group ? ids[group].indexOf(String(over.id)) : target.indexOf(String(over.id))
    const index = overIndex < 0 ? target.length : overIndex
    if (ordering === 'manual' && (source.key !== group || ids[group].indexOf(id) !== index)) {
      patch.sortOrder = sortOrderBetween(issues.get(target[index - 1]), issues.get(target[index]))
    }
    if (Object.keys(patch).length) {
      update.mutate({ id: issue.id, patch })
    }
  }

  const activeIssue = activeId ? issues.get(activeId) : undefined
  const activeSource = activeId ? sourceOf(activeId) : undefined
  const activeDestination = activeId ? groups.find((group) => group.key === (overGroup ?? groupOf(activeId))) : undefined
  const activePatch = activeIssue && activeSource && activeDestination && groupPatch(activeIssue, activeSource, activeDestination, catalog?.states ?? [])
  return {
    ids,
    issues,
    active: activeIssue && activePatch ? { ...activeIssue, ...activePatch } : activeIssue,
    context: {
      sensors,
      collisionDetection,
      onDragStart: ({ active }: DragStartEvent) => setActiveId(String(active.id)),
      onDragOver,
      onDragEnd,
      onDragCancel: () => {
        setActiveId(null)
        setOverGroup(null)
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
