import { Copy, Hexagon, Link2, Tag } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { useCatalogMaps, useIssuePatch } from '@/lib/queries'
import type { Issue } from '@/lib/types'
import { Avatar, EntityIcon, PriorityIcon } from './icons'
import type { PickerOption } from './picker'
import { priorityOptions, useAssigneeOptions, useLabelOptions, useProjectOptions, useStateIcon, useStatusOptions } from './properties'

// Right-clicking an issue offers Linear's quick edits without opening it.
export function IssueContextMenu({ issue, children }: { issue: Issue; children: ReactNode }) {
  const patch = useIssuePatch(issue)
  const { projects, states, users } = useCatalogMaps()
  const stateIcon = useStateIcon()
  const state = states.get(issue.stateId)
  const project = issue.projectId ? projects.get(issue.projectId) : null
  const statusOptions = useStatusOptions(issue.teamId)
  const assigneeOptions = useAssigneeOptions()
  const labelOptions = useLabelOptions(issue.teamId)
  const projectOptions = useProjectOptions(issue.teamId)
  const toggleLabel = (id: string) =>
    patch({ labelIds: issue.labelIds.includes(id) ? issue.labelIds.filter((l) => l !== id) : [...issue.labelIds, id] })
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <Choice
          label="Status"
          icon={state && stateIcon(state)}
          options={statusOptions}
          value={issue.stateId}
          onChange={(stateId) => patch({ stateId })}
        />
        <Choice
          label="Priority"
          icon={<PriorityIcon priority={issue.priority} />}
          options={priorityOptions}
          value={String(issue.priority)}
          onChange={(priority) => patch({ priority: Number(priority) })}
        />
        <Choice
          label="Assignee"
          icon={<Avatar user={issue.assigneeId ? (users.get(issue.assigneeId) ?? null) : null} size={16} />}
          options={assigneeOptions}
          value={issue.assigneeId ?? ''}
          onChange={(assigneeId) => patch({ assigneeId: assigneeId || null })}
        />
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2">
            <Tag className="size-3.5 text-ink-3" />
            Labels
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-52">
            {labelOptions.map((option) => (
              <ContextMenuCheckboxItem
                key={option.value}
                checked={issue.labelIds.includes(option.value)}
                onCheckedChange={() => toggleLabel(option.value)}
                onSelect={(event) => event.preventDefault()}
              >
                {option.icon}
                <span className="truncate">{option.label}</span>
              </ContextMenuCheckboxItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <Choice
          label="Project"
          icon={project ? <EntityIcon icon={project.icon} color={project.color} /> : <Hexagon className="size-3.5 text-ink-3" />}
          options={projectOptions}
          value={issue.projectId ?? ''}
          onChange={(projectId) => patch({ projectId: projectId || null })}
        />
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => void navigator.clipboard.writeText(issue.identifier)}>
          <Copy className="size-3.5 text-ink-3" />
          Copy ID
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void navigator.clipboard.writeText(issue.url)}>
          <Link2 className="size-3.5 text-ink-3" />
          Copy link
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

// Choice is a single-select property submenu over the pickers' option list.
function Choice({
  label,
  icon,
  options,
  value,
  onChange,
}: {
  label: string
  icon: ReactNode
  options: PickerOption[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger className="gap-2">
        {icon}
        {label}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-52">
        <ContextMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((option) => (
            <ContextMenuRadioItem key={option.value} value={option.value}>
              {option.icon}
              <span className="truncate">{option.label}</span>
            </ContextMenuRadioItem>
          ))}
        </ContextMenuRadioGroup>
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}
