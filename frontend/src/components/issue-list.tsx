import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ChevronRight, Plus } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import type { Ordering } from '@/lib/issues'
import type { IssuePatch } from '@/lib/types'
import { openCreateIssue, useUI } from '@/lib/ui'
import { cn } from '@/lib/utils'
import { SortableIssue, dropAnimation, useGroupDrag } from './issue-dnd'
import { IssueRow } from './issue-row'
import { type IssueGroup, useListNavigation } from './issue-view'
import { useStateIcon } from './properties'

export function IssueList({
  groups,
  ordering,
  createDefaults,
}: {
  groups: IssueGroup[]
  ordering: Ordering
  createDefaults?: IssuePatch & { teamId?: string }
}) {
  const focusedIssueId = useUI((s) => s.focusedIssueId)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const stateIcon = useStateIcon()
  const { ids, issues, active, context } = useGroupDrag(groups, ordering)
  const ordered = useMemo(() => groups.filter((g) => !collapsed.has(g.key)).flatMap((g) => g.issues), [groups, collapsed])
  useListNavigation(ordered)

  return (
    <DndContext {...context}>
      <div className="scrollbar-quiet h-full overflow-y-auto pb-24" role="grid">
        {groups.map((group) => (
          <Section key={group.key} id={group.key}>
            <div className="sticky top-0 z-10 flex h-9 items-center gap-2 bg-column pl-3 pr-3">
              <button
                onClick={() => {
                  const next = new Set(collapsed)
                  if (!next.delete(group.key)) {
                    next.add(group.key)
                  }
                  setCollapsed(next)
                }}
                className="flex items-center gap-2 rounded-[5px] px-1.5 py-1 text-[13px] font-medium text-ink outline-none hover:bg-list-hover"
              >
                <ChevronRight className={cn('size-3 text-ink-3 transition-transform duration-150', !collapsed.has(group.key) && 'rotate-90')} />
                {stateIcon(group.state)}
                {group.state.name}
                <span className="font-normal tabular-nums text-ink-3">{ids[group.key].length}</span>
              </button>
              <button
                aria-label={`Create issue in ${group.state.name}`}
                onClick={() => openCreateIssue({ ...createDefaults, teamId: group.state.teamId, stateId: group.state.id })}
                className="ml-auto flex size-6 items-center justify-center rounded-[5px] text-ink-3 outline-none hover:bg-list-hover hover:text-ink"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
            {!collapsed.has(group.key) && (
              <SortableContext items={ids[group.key]} strategy={verticalListSortingStrategy}>
                {ids[group.key].map((id) => (
                  <SortableIssue key={id} id={id}>
                    <IssueRow issue={issues.get(id)!} focused={id === focusedIssueId} />
                  </SortableIssue>
                ))}
              </SortableContext>
            )}
          </Section>
        ))}
      </div>
      <DragOverlay dropAnimation={dropAnimation} className="rounded-[var(--radius-control)] bg-raised shadow-[var(--shadow-raised)]">
        {active && <IssueRow issue={active} focused={false} />}
      </DragOverlay>
    </DndContext>
  )
}

// A section takes drops on its header too, so a collapsed group still accepts issues.
function Section({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id })
  return <section ref={setNodeRef}>{children}</section>
}
