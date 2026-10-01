import { Box, ChartNoAxesColumnIncreasing, CircleDot, Contrast, Copy, CornerDownRight, CornerLeftUp, GitFork, Link2, SquarePlus, Tag, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuOptions,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { useIssuePatch } from '@/lib/queries'
import type { Issue } from '@/lib/types'
import { openCreateRelated, setUI } from '@/lib/ui'
import { priorityOptions, useAssigneeOptions, useProjectOptions, useStatusOptions } from './properties'

// Right-clicking an issue offers Linear's quick edits without opening it.
export function IssueContextMenu({ issue, children }: { issue: Issue; children: ReactNode }) {
  const patch = useIssuePatch(issue)
  const statusOptions = useStatusOptions(issue.teamId)
  const assigneeOptions = useAssigneeOptions()
  const projectOptions = useProjectOptions(issue.teamId)
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      {/* Focus returning to the row as the menu closes would dismiss the pickers the Labels and parent items open. */}
      <ContextMenuContent className="w-56" onCloseAutoFocus={(e) => e.preventDefault()}>
        <ContextMenuOptions
          icon={<Contrast />}
          label="Status"
          shortcut="S"
          options={statusOptions}
          selected={[issue.stateId]}
          onSelect={(stateId) => patch({ stateId })}
        />
        <ContextMenuOptions
          icon={<ChartNoAxesColumnIncreasing />}
          label="Priority"
          shortcut="P"
          options={priorityOptions}
          selected={[String(issue.priority)]}
          onSelect={(priority) => patch({ priority: Number(priority) })}
        />
        <ContextMenuOptions
          icon={<UserRound />}
          label="Assignee"
          shortcut="A"
          placeholder="Assign to…"
          options={assigneeOptions}
          selected={[issue.assigneeId ?? '']}
          onSelect={(assigneeId) => patch({ assigneeId: assigneeId || null })}
        />
        <ContextMenuItem onSelect={() => setUI({ picker: { kind: 'labels', issueId: issue.id } })}>
          <Tag />
          Labels…
          <ContextMenuShortcut>L</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuOptions
          icon={<Box />}
          label="Project"
          placeholder="Move to project…"
          options={projectOptions}
          selected={[issue.projectId ?? '']}
          onSelect={(projectId) => patch({ projectId: projectId || null })}
        />
        <ContextMenuItem onSelect={() => setUI({ picker: { kind: 'parent', issueId: issue.id } })}>
          <GitFork />
          Set parent issue…
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <SquarePlus />
            Create related
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-52">
            <ContextMenuItem onSelect={() => openCreateRelated(issue)}>
              <CircleDot />
              Issue…
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => openCreateRelated(issue, { parentId: issue.id })}>
              <CornerDownRight />
              Sub-issue…
              <ContextMenuShortcut>⌘ ⇧ O</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => openCreateRelated(issue, { childId: issue.id })}>
              <CornerLeftUp />
              Parent issue…
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => void navigator.clipboard.writeText(issue.identifier)}>
          <Copy />
          Copy ID
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void navigator.clipboard.writeText(issue.url)}>
          <Link2 />
          Copy link
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
