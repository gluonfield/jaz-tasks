import { CalendarDays, CircleDashed, CircleSlash, GitFork, Hexagon, RefreshCcw, Tag, Triangle } from 'lucide-react'
import { type ReactNode, forwardRef, useState } from 'react'
import { dueStatus, entityColors, formatDay, priorities, toDateInput, workflowOrder } from '@/lib/issues'
import { useCatalogMaps, useCreateLabel, useIssues, useSubIssueProgress, useUpdateIssue } from '@/lib/queries'
import type { Issue, IssuePatch, WorkflowState } from '@/lib/types'
import { type PickerKind, setUI, useUI } from '@/lib/ui'
import { cn } from '@/lib/utils'
import { Avatar, EntityIcon, LabelDot, PriorityIcon, StatusIcon, startedProgress } from './icons'
import { Picker, type PickerOption } from './picker'

export type Variant = 'icon' | 'chip' | 'row'

type Props<T> = {
  value: T
  onChange: (value: T) => void
  teamId: string
  variant: Variant
  // issueId lets keyboard shortcuts open this picker for a focused issue.
  issueId?: string
  className?: string
}

// usePickerOpen merges local clicks with shortcut-driven opening.
function usePickerOpen(kind: PickerKind, issueId?: string) {
  const [local, setLocal] = useState(false)
  const remote = useUI((s) => s.picker?.kind === kind && s.picker.issueId === issueId && issueId !== undefined)
  return [
    local || remote,
    (open: boolean) => {
      setLocal(open)
      if (!open && remote) {
        setUI({ picker: null })
      }
    },
  ] as const
}

export const PropertyButton = forwardRef<
  HTMLButtonElement,
  { variant: Variant; icon: ReactNode; label?: ReactNode; muted?: boolean; className?: string; title?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function PropertyButton({ variant, icon, label, muted, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      onClick={(e) => {
        e.stopPropagation()
        props.onClick?.(e)
      }}
      className={cn(
        'inline-flex shrink-0 items-center outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-ring',
        variant === 'icon' && 'size-6 justify-center rounded-[5px] hover:bg-list-active',
        variant === 'chip' &&
          'h-6 max-w-48 gap-1.5 rounded-[var(--radius-control)] border border-border px-2 text-[12px] text-ink-2 hover:bg-list-hover hover:text-ink',
        variant === 'row' &&
          'h-8 w-full min-w-0 gap-2.5 rounded-[var(--radius-control)] px-2 text-left text-[13px] text-ink hover:bg-list-hover',
        muted && variant === 'row' && 'text-ink-3',
        className,
      )}
    >
      {icon}
      {variant !== 'icon' && label && <span className="min-w-0 truncate">{label}</span>}
    </button>
  )
})

export function useStateIcon() {
  const { catalog } = useCatalogMaps()
  return (state: WorkflowState, className?: string) => {
    const started = (catalog?.states ?? [])
      .filter((s) => s.teamId === state.teamId && s.type === 'started')
      .sort(workflowOrder)
    return (
      <StatusIcon
        type={state.type}
        color={state.color}
        progress={startedProgress(started.findIndex((s) => s.id === state.id))}
        className={className}
      />
    )
  }
}

// The option lists below feed both the property pickers and the issue context
// menu, so every surface offers the same choices in the same order.
export function useStatusOptions(teamId: string): PickerOption[] {
  const { catalog } = useCatalogMaps()
  const stateIcon = useStateIcon()
  return (catalog?.states ?? [])
    .filter((s) => s.teamId === teamId)
    .sort(workflowOrder)
    .map((s) => ({ value: s.id, label: s.name, icon: stateIcon(s) }))
}

export const priorityOptions: PickerOption[] = priorities.map((p) => ({
  value: String(p.value),
  label: p.label,
  icon: <PriorityIcon priority={p.value} />,
}))

// An empty value means no assignee.
export function useAssigneeOptions(): PickerOption[] {
  const { catalog } = useCatalogMaps()
  const people = [...(catalog?.users ?? [])].filter((u) => u.active).sort((a, b) => Number(b.isMe) - Number(a.isMe))
  return [
    { value: '', label: 'No assignee', icon: <Avatar user={null} size={16} /> },
    ...people.map((u) => ({
      value: u.id,
      label: u.name,
      keywords: [u.displayName, u.email],
      icon: <Avatar user={u} size={16} />,
      detail: u.isMe ? <span className="text-[12px] text-ink-3">You</span> : undefined,
    })),
  ]
}

export function useLabelOptions(teamId: string): PickerOption[] {
  const { catalog } = useCatalogMaps()
  return (catalog?.labels ?? [])
    .filter((l) => !l.isGroup && (!l.teamId || l.teamId === teamId))
    .map((l) => ({ value: l.id, label: l.name, icon: <LabelDot color={l.color} /> }))
}

// An empty value means no project; the issue's team's projects come first.
export function useProjectOptions(teamId: string): PickerOption[] {
  const { catalog } = useCatalogMaps()
  const projects = [...(catalog?.projects ?? [])].sort((a, b) => Number(b.teamIds.includes(teamId)) - Number(a.teamIds.includes(teamId)))
  return [
    { value: '', label: 'No project', icon: <Hexagon className="size-3.5 text-ink-3" /> },
    ...projects.map((p) => ({ value: p.id, label: p.name, icon: <EntityIcon icon={p.icon} color={p.color} /> })),
  ]
}

export function StatusPicker({ value, onChange, teamId, variant, issueId, className }: Props<string>) {
  const { states } = useCatalogMaps()
  const [open, setOpen] = usePickerOpen('status', issueId)
  const stateIcon = useStateIcon()
  const current = states.get(value)
  const options = useStatusOptions(teamId)
  return (
    <Picker
      open={open}
      onOpenChange={setOpen}
      placeholder="Change status..."
      options={options}
      selected={[value]}
      onSelect={onChange}
      trigger={
        <PropertyButton
          variant={variant}
          className={className}
          title="Change status (S)"
          icon={current ? stateIcon(current) : <CircleDashed className="size-3.5" />}
          label={current?.name}
        />
      }
    />
  )
}

export function PriorityPicker({ value, onChange, variant, issueId, className }: Props<number>) {
  const [open, setOpen] = usePickerOpen('priority', issueId)
  const current = priorities.find((p) => p.value === value) ?? priorities[0]
  return (
    <Picker
      open={open}
      onOpenChange={setOpen}
      placeholder="Set priority to..."
      options={priorityOptions}
      selected={[String(value)]}
      onSelect={(v) => onChange(Number(v))}
      trigger={
        <PropertyButton
          variant={variant}
          className={className}
          title="Set priority (P)"
          icon={<PriorityIcon priority={value} />}
          label={variant === 'chip' && value === 0 ? 'Priority' : current.label}
          muted={value === 0}
        />
      }
    />
  )
}

export function AssigneePicker({ value, onChange, variant, issueId, className }: Props<string | null>) {
  const { users } = useCatalogMaps()
  const [open, setOpen] = usePickerOpen('assignee', issueId)
  const current = value ? users.get(value) : null
  const options = useAssigneeOptions()
  return (
    <Picker
      open={open}
      onOpenChange={setOpen}
      placeholder="Assign to..."
      options={options}
      selected={[value ?? '']}
      onSelect={(v) => onChange(v || null)}
      trigger={
        <PropertyButton
          variant={variant}
          className={className}
          title="Assign (A)"
          icon={<Avatar user={current} size={variant === 'row' ? 18 : 16} />}
          label={current?.name ?? (variant === 'chip' ? 'Assignee' : 'Unassigned')}
          muted={!current}
        />
      }
    />
  )
}

export function LabelsPicker({ value, onChange, teamId, variant, issueId, className, children }: Props<string[]> & { children?: ReactNode }) {
  const { labels } = useCatalogMaps()
  const createLabel = useCreateLabel()
  const [open, setOpen] = usePickerOpen('labels', issueId)
  const options = useLabelOptions(teamId)
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  const chosen = value.map((id) => labels.get(id)).filter((l) => l !== undefined)
  return (
    <Picker
      open={open}
      onOpenChange={setOpen}
      multiple
      placeholder="Change labels..."
      options={options}
      selected={value}
      onSelect={toggle}
      onCreate={{
        label: 'Create label',
        create: (name) => createLabel.mutate({ name, color: entityColors[name.length % entityColors.length] }, { onSuccess: (id) => onChange([...value, id]) }),
      }}
      trigger={
        children ? (
          <span>{children}</span>
        ) : (
          <PropertyButton
            variant={variant}
            className={className}
            title="Change labels (L)"
            icon={
              chosen.length ? (
                <span className="flex -space-x-0.5">
                  {chosen.slice(0, 3).map((l) => (
                    <LabelDot key={l.id} color={l.color} className="ring-2 ring-[var(--color-raised)]" />
                  ))}
                </span>
              ) : (
                <Tag className="size-3.5 text-ink-3" />
              )
            }
            label={chosen.length === 1 ? chosen[0].name : chosen.length ? `${chosen.length} labels` : 'Labels'}
            muted={!chosen.length}
          />
        )
      }
    />
  )
}

export function ProjectPicker({ value, onChange, teamId, variant, issueId, className }: Props<string | null>) {
  const { projects } = useCatalogMaps()
  const [open, setOpen] = usePickerOpen('project', issueId)
  const current = value ? projects.get(value) : null
  const options = useProjectOptions(teamId)
  return (
    <Picker
      open={open}
      onOpenChange={setOpen}
      placeholder="Add to project..."
      options={options}
      selected={[value ?? '']}
      onSelect={(v) => onChange(v || null)}
      trigger={
        <PropertyButton
          variant={variant}
          className={className}
          title="Set project"
          icon={current ? <EntityIcon icon={current.icon} color={current.color} /> : <Hexagon className="size-3.5 text-ink-3" />}
          label={current?.name ?? (variant === 'row' ? 'Add to project' : 'Project')}
          muted={!current}
        />
      }
    />
  )
}

// ParentPicker makes the issue a sub-issue of another. It leaves out the issue
// itself and everything below it, which the server would reject as a loop.
export function ParentPicker({ value, onChange, variant, issueId, className }: Props<string | null>) {
  const { data: issues = [] } = useIssues()
  const [open, setOpen] = usePickerOpen('parent', issueId)
  const current = value ? issues.find((i) => i.id === value) : null
  const below = new Set(issueId ? [issueId] : [])
  for (let grew = true; grew; ) {
    grew = false
    for (const issue of issues) {
      if (issue.parentId && below.has(issue.parentId) && !below.has(issue.id)) {
        below.add(issue.id)
        grew = true
      }
    }
  }
  const options: PickerOption[] = [
    { value: '', label: 'No parent', icon: <CircleSlash className="size-3.5 text-ink-3" /> },
    ...issues
      .filter((i) => !below.has(i.id))
      .map((i) => ({
        value: i.id,
        label: i.title,
        keywords: [i.identifier],
        icon: <span className="w-12 shrink-0 text-[12px] tabular-nums text-ink-3">{i.identifier}</span>,
      })),
  ]
  return (
    <Picker
      open={open}
      onOpenChange={setOpen}
      placeholder="Set parent issue..."
      options={options}
      selected={[value ?? '']}
      onSelect={(v) => onChange(v || null)}
      trigger={
        <PropertyButton
          variant={variant}
          className={className}
          title="Set parent issue"
          icon={<GitFork className="size-3.5 text-ink-3" />}
          label={current ? `${current.identifier} ${current.title}` : 'Set parent'}
          muted={!current}
        />
      }
    />
  )
}

// SubIssueCount shows a parent's progress through its sub-issues.
export function SubIssueCount({ issueId, className }: { issueId: string; className?: string }) {
  const progress = useSubIssueProgress(issueId)
  if (!progress) {
    return null
  }
  const type = progress.done === progress.total ? 'completed' : progress.done ? 'started' : 'unstarted'
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 text-[12px] tabular-nums text-ink-3', className)} title="Sub-issues done">
      <StatusIcon type={type} color="var(--color-ink-3)" progress={progress.done / progress.total} className="size-3" />
      {progress.done}/{progress.total}
    </span>
  )
}

export function cycleName(cycle: { number: number; name: string | null }) {
  return cycle.name ?? `Cycle ${cycle.number}`
}

export function CyclePicker({ value, onChange, teamId, variant, issueId, className }: Props<string | null>) {
  const { catalog, cycles } = useCatalogMaps()
  const [open, setOpen] = usePickerOpen('cycle', issueId)
  const current = value ? cycles.get(value) : null
  const now = new Date().toISOString()
  const options = (catalog?.cycles ?? []).filter((c) => c.teamId === teamId && (c.endsAt > now || c.id === value))
  if (!options.length && !current) {
    return null
  }
  return (
    <Picker
      open={open}
      onOpenChange={setOpen}
      placeholder="Add to cycle..."
      options={[
        { value: '', label: 'No cycle', icon: <RefreshCcw className="size-3.5 text-ink-3" /> },
        ...options.map((c) => ({
          value: c.id,
          label: cycleName(c),
          icon: <RefreshCcw className={cn('size-3.5', c.isActive ? 'text-primary' : 'text-ink-3')} />,
          detail: c.isActive ? <span className="text-[11px] text-ink-3">Current</span> : undefined,
        })),
      ]}
      selected={[value ?? '']}
      onSelect={(v) => onChange(v || null)}
      trigger={
        <PropertyButton
          variant={variant}
          className={className}
          title="Set cycle"
          icon={<RefreshCcw className={cn('size-3.5', current?.isActive ? 'text-primary' : 'text-ink-3')} />}
          label={current ? cycleName(current) : variant === 'row' ? 'Add to cycle' : 'Cycle'}
          muted={!current}
        />
      }
    />
  )
}

const estimates = [1, 2, 3, 5, 8]

export function EstimatePicker({ value, onChange, variant, issueId, className }: Props<number | null>) {
  const [open, setOpen] = usePickerOpen('estimate', issueId)
  return (
    <Picker
      open={open}
      onOpenChange={setOpen}
      placeholder="Set estimate..."
      options={[
        { value: '', label: 'No estimate', icon: <Triangle className="size-3.5 text-ink-3" /> },
        ...estimates.map((e) => ({ value: String(e), label: `${e} ${e === 1 ? 'point' : 'points'}`, icon: <Triangle className="size-3.5 text-ink-2" /> })),
      ]}
      selected={[value === null ? '' : String(value)]}
      onSelect={(v) => onChange(v ? Number(v) : null)}
      trigger={
        <PropertyButton
          variant={variant}
          className={className}
          title="Set estimate"
          icon={<Triangle className={cn('size-3.5', value === null ? 'text-ink-3' : 'text-ink-2')} />}
          label={value === null ? (variant === 'row' ? 'Add estimate' : 'Estimate') : `${value} ${value === 1 ? 'point' : 'points'}`}
          muted={value === null}
        />
      }
    />
  )
}

function addDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return toDateInput(date)
}

export function DueDatePicker({ value, onChange, variant, issueId, className, done = false }: Props<string | null> & { done?: boolean }) {
  const [open, setOpen] = usePickerOpen('dueDate', issueId)
  const status = dueStatus(value, done)
  const tone = status === 'overdue' ? 'text-danger' : status === 'soon' ? 'text-running' : 'text-ink-3'
  const endOfWeek = 5 - new Date().getDay()
  const options: PickerOption[] = [
    { value: addDays(0), label: 'Today' },
    { value: addDays(1), label: 'Tomorrow' },
    { value: addDays(endOfWeek >= 0 ? endOfWeek : endOfWeek + 7), label: 'End of this week' },
    { value: addDays(7), label: 'In one week' },
    ...(value ? [{ value: '', label: 'Remove due date' }] : []),
  ].map((o) => ({ ...o, icon: <CalendarDays className="size-3.5 text-ink-3" />, detail: o.value && <span className="text-[11px] text-ink-3">{formatDay(o.value)}</span> }))
  return (
    <Picker
      open={open}
      onOpenChange={setOpen}
      placeholder="Try: tomorrow, end of week"
      options={options}
      selected={[value ?? '']}
      onSelect={(v) => onChange(v || null)}
      footer={
        <div className="flex items-center gap-2 border-t border-border px-3 py-2">
          <span className="text-[12px] text-ink-3">Custom</span>
          <input
            type="date"
            defaultValue={value ?? ''}
            onChange={(e) => {
              if (e.target.value) {
                onChange(e.target.value)
                setOpen(false)
              }
            }}
            className="h-7 flex-1 rounded-[5px] border border-border bg-transparent px-2 text-[12px] text-ink outline-none"
          />
        </div>
      }
      trigger={
        <PropertyButton
          variant={variant}
          className={className}
          title="Set due date"
          icon={<CalendarDays className={cn('size-3.5', value ? tone : 'text-ink-3')} />}
          label={value ? <span className={variant === 'row' ? undefined : tone}>{formatDay(value)}</span> : variant === 'row' ? 'Add due date' : 'Due date'}
          muted={!value}
        />
      }
    />
  )
}

// ShortcutPicker hosts, invisibly, whichever picker a keyboard shortcut asks
// for when the surface (a row or card) does not show that property itself.
export function ShortcutPicker({ issue, visible }: { issue: Issue; visible: PickerKind[] }) {
  const kind = useUI((s) => (s.picker?.issueId === issue.id ? s.picker.kind : null))
  const update = useUpdateIssue()
  if (!kind || visible.includes(kind)) {
    return null
  }
  const patch = (value: IssuePatch) => update.mutate({ id: issue.id, patch: value })
  const shared = { teamId: issue.teamId, issueId: issue.id, variant: 'icon' as const, className: 'pointer-events-none absolute left-1/3 top-1/2 size-0 opacity-0' }
  switch (kind) {
    case 'status':
      return <StatusPicker {...shared} value={issue.stateId} onChange={(stateId) => patch({ stateId })} />
    case 'priority':
      return <PriorityPicker {...shared} value={issue.priority} onChange={(priority) => patch({ priority })} />
    case 'assignee':
      return <AssigneePicker {...shared} value={issue.assigneeId} onChange={(assigneeId) => patch({ assigneeId })} />
    case 'labels':
      return <LabelsPicker {...shared} value={issue.labelIds} onChange={(labelIds) => patch({ labelIds })} />
    case 'project':
      return <ProjectPicker {...shared} value={issue.projectId} onChange={(projectId) => patch({ projectId })} />
    case 'parent':
      return <ParentPicker {...shared} value={issue.parentId} onChange={(parentId) => patch({ parentId })} />
    case 'cycle':
      return <CyclePicker {...shared} value={issue.cycleId} onChange={(cycleId) => patch({ cycleId })} />
    case 'estimate':
      return <EstimatePicker {...shared} value={issue.estimate} onChange={(estimate) => patch({ estimate })} />
    case 'dueDate':
      return <DueDatePicker {...shared} value={issue.dueDate} onChange={(dueDate) => patch({ dueDate })} />
  }
}
