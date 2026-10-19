import { Button } from '@jaz/ui/button'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { Archive, ArchiveRestore, Trash2, ChevronLeft, ChevronRight, Copy, GitBranch, Link2, MoreHorizontal, PanelRight, Plus } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { host } from '@/lib/host'
import { useArchiveIssue, useCatalogMaps, useIssueDetail, useIssuePatch, useIssues, useRestoreIssue } from '@/lib/queries'
import type { Issue, IssueDetail } from '@/lib/types'
import { getUI, openCreateRelated, setUI, useWide } from '@/lib/ui'
import { cn } from '@/lib/utils'
import { Activity } from './activity'
import { Avatar, LabelDot, TeamBadge } from './icons'
import { ViewHeader } from './issue-view'
import { useIssueShortcuts } from '@/lib/issue-shortcuts'
import { copyIssue } from '@/lib/issue-copy'
import { shortcutLabel, shortcuts } from '@/lib/shortcut-definitions'
import { useShortcutActions } from '@/lib/shortcuts'
import { EditableMarkdown } from './editable'
import {
  AssigneePicker,
  CyclePicker,
  DueDatePicker,
  EstimatePicker,
  LabelsPicker,
  ParentPicker,
  PriorityPicker,
  ProjectPicker,
  ShortcutPicker,
  StatusPicker,
  useStateIcon,
} from './properties'

export function IssuePage({ identifier, back }: { identifier: string; back?: () => void }) {
  const { data: issue, error } = useIssueDetail(identifier)
  const navigate = useNavigate()
  const minimal = host.minimal
  const wide = useWide() && !minimal
  const [detailsOpen, setDetailsOpen] = useState(true)
  const { teams } = useCatalogMaps()
  const team = issue && teams.get(issue.teamId)
  const edit = useRouterState({ select: (state) => state.location.search.edit })
  useIssueShortcuts(issue)
  useShortcutActions({
    ...(wide && { details: () => setDetailsOpen(!detailsOpen) }),
    back: back ?? (team ? () => { void navigate({ to: '/team/$teamKey/$view', params: { teamKey: team.key, view: 'all' } }) } : undefined),
  })

  useEffect(() => {
    if (issue) {
      setUI({ focusedIssueId: issue.id })
    }
  }, [issue?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!edit || !issue) {
      return
    }
    const element = document.querySelector<HTMLElement>(`[data-issue-edit="${edit}"]`)
    element?.click()
    element?.focus()
    void navigate({ to: '/issue/$identifier', params: { identifier }, search: {}, replace: true })
  }, [edit, issue, identifier, navigate])

  if (error) {
    return <p className="p-8 text-[13px] text-ink-3">{error.message}</p>
  }
  if (!issue) {
    return null
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader
        leading={back && <Button variant="ghost" size="icon" aria-label="Back" className="-ml-1.5 md:hidden" onClick={back}><ChevronLeft /></Button>}
        title={
          <>
            {team && (
              <Link
                to="/team/$teamKey/$view"
                params={{ teamKey: team.key, view: 'all' }}
                className="flex items-center gap-2 rounded-[5px] px-1 py-0.5 text-ink-2 outline-none hover:text-ink"
              >
                <TeamBadge icon={team.icon} color={team.color} />
                {team.name}
              </Link>
            )}
            <ChevronRight className="size-3 text-ink-3" />
            {issue.identifier}
          </>
        }
      >
        {wide && <Button variant="ghost" size="icon" aria-label="Toggle issue details" aria-pressed={detailsOpen} onClick={() => setDetailsOpen(!detailsOpen)}><PanelRight /></Button>}
        {!minimal && <IssueMenu issue={issue} />}
      </ViewHeader>
      <div className="flex min-h-0 flex-1">
        <div className="scrollbar-quiet min-w-0 flex-1 overflow-y-auto">
          <div key={issue.id} className="mx-auto max-w-[780px] animate-rise px-4 pb-24 pt-5 md:px-10 md:pt-9">
            <ParentLink issue={issue} />
            <Title key={issue.title} issue={issue} />
            {!wide && <Properties issue={issue} wide={false} />}
            <Description key={issue.description} issue={issue} />
            {!minimal && (
              <>
                <SubIssues issue={issue} />
                <Activity issue={issue} />
              </>
            )}
          </div>
        </div>
        {wide && detailsOpen && <Properties issue={issue} wide />}
        {wide && !detailsOpen && <ShortcutPicker issue={issue} visible={[]} />}
      </div>
    </div>
  )
}

function IssueMenu({ issue }: { issue: Issue }) {
  const navigate = useNavigate()
  const archive = useArchiveIssue()
  const restore = useRestoreIssue()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="ml-auto flex size-7 items-center justify-center rounded-[var(--radius-control)] text-ink-2 outline-none hover:bg-list-hover hover:text-ink data-[state=open]:bg-list-active">
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72" onCloseAutoFocus={(event) => {
        if (getUI().picker) {
          event.preventDefault()
        }
      }}>
        <DropdownMenuItem onSelect={() => setUI({ picker: { kind: 'team', issueId: issue.id } })}>
          Move to team… <DropdownMenuShortcut>{shortcutLabel(shortcuts.team.keys[0])}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => copyIssue(issue, 'copyUrl')}>
          <Link2 /> Copy issue URL<DropdownMenuShortcut>{shortcutLabel(shortcuts.copyUrl.keys[0])}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => copyIssue(issue, 'copyId')}>
          <Copy /> Copy issue ID<DropdownMenuShortcut>{shortcutLabel(shortcuts.copyId.keys[0])}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => copyIssue(issue, 'branch')}>
          <GitBranch /> Copy git branch name<DropdownMenuShortcut>{shortcutLabel(shortcuts.branch.keys[0])}</DropdownMenuShortcut>
        </DropdownMenuItem>
        {issue.archivedAt ? <DropdownMenuItem onSelect={() => restore.mutate(issue, {
          onSuccess: () => toast(`${issue.identifier} restored`),
          onError: (error) => toast.error(error.message),
        })}>
          <ArchiveRestore /> Restore issue <DropdownMenuShortcut>#</DropdownMenuShortcut>
        </DropdownMenuItem> : <DropdownMenuItem
          onSelect={() =>
            archive.mutate(issue.id, {
              onSuccess: () => {
                toast(`${issue.identifier} archived`)
                navigate({ to: '/my-issues' })
              },
            })
          }
        >
          <Archive /> Archive
        </DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setUI({ deleteIssue: issue })}>
          <Trash2 /> Delete issue… <DropdownMenuShortcut>{shortcutLabel(shortcuts.deleteIssue.keys[0])}</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ParentLink({ issue }: { issue: Issue }) {
  const { data: issues = [] } = useIssues()
  const parent = issues.find((i) => i.id === issue.parentId)
  if (!parent) {
    return null
  }
  return (
    <Link
      to="/issue/$identifier"
      params={{ identifier: parent.identifier }}
      className="mb-2 inline-flex items-center gap-1.5 text-[12.5px] text-ink-3 outline-none hover:text-ink-2"
    >
      Sub-issue of <span className="font-medium text-ink-2">{parent.identifier}</span>
      <span className="max-w-80 truncate">{parent.title}</span>
    </Link>
  )
}

function Title({ issue }: { issue: Issue }) {
  const patch = useIssuePatch(issue)
  const [title, setTitle] = useState(issue.title)
  const save = () => {
    const next = title.trim()
    if (next && next !== issue.title) {
      patch({ title: next })
    } else {
      setTitle(issue.title)
    }
  }
  return (
    <textarea
      data-issue-edit="title"
      aria-label="Issue title"
      rows={1}
      value={title}
      onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
      className="field-sizing-content w-full resize-none bg-transparent text-[24px] font-semibold leading-tight tracking-[-0.01em] text-ink outline-none"
    />
  )
}

function Description({ issue }: { issue: IssueDetail }) {
  const patch = useIssuePatch(issue)
  return (
    <EditableMarkdown
      editTarget="description"
      value={issue.description}
      placeholder="Add description..."
      onSave={(description) => patch({ description })}
      className="mt-4"
    />
  )
}

function SubIssues({ issue }: { issue: Issue }) {
  const { data: issues = [] } = useIssues()
  const { states, users } = useCatalogMaps()
  const stateIcon = useStateIcon()
  const children = issues.filter((i) => i.parentId === issue.id).sort((a, b) => a.number - b.number)
  const done = children.filter((c) => ['completed', 'canceled'].includes(states.get(c.stateId)?.type ?? '')).length
  return (
    <section className="mt-8">
      <div className="mb-1.5 flex items-center gap-2 text-[13px]">
        <span className="font-medium text-ink-2">Sub-issues</span>
        {children.length > 0 && (
          <span className="tabular-nums text-ink-3">
            {done}/{children.length}
          </span>
        )}
        <Button
          onClick={() => openCreateRelated(issue, { parentId: issue.id })}
          variant="ghost" size="sm" className="ml-auto"
        >
          <Plus className="size-3.5" /> Add sub-issue
        </Button>
      </div>
      {children.length > 0 && (
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-border">
          {children.map((child) => {
            const state = states.get(child.stateId)
            return (
              <Link
                key={child.id}
                to="/issue/$identifier"
                params={{ identifier: child.identifier }}
                className="flex h-9 items-center gap-2.5 border-b border-border/60 px-3 text-[13px] outline-none last:border-b-0 hover:bg-list-hover pointer-coarse:h-11"
              >
                {state && stateIcon(state)}
                <span className="w-14 shrink-0 text-[12.5px] tabular-nums text-ink-3">{child.identifier}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{child.title}</span>
                <Avatar user={child.assigneeId ? users.get(child.assigneeId) : null} size={16} />
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-start gap-2">
      <span className="w-[76px] shrink-0 pt-[7px] text-[12.5px] text-ink-3">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function Chip({ children }: { label: string; children: ReactNode }) {
  return children
}

// Properties is the labelled sidebar on wide screens and a row of chips
// under the title on narrow ones.
function Properties({ issue, wide }: { issue: Issue; wide: boolean }) {
  const patch = useIssuePatch(issue)
  const { catalog, labels, states } = useCatalogMaps()
  const done = ['completed', 'canceled'].includes(states.get(issue.stateId)?.type ?? '')
  const hasCycles = !!issue.cycleId || !!catalog?.cycles.some((c) => c.teamId === issue.teamId)
  const shared = { teamId: issue.teamId, issueId: issue.id, variant: wide ? 'row' : 'chip' } as const
  const Field = wide ? Row : Chip
  const status = (
    <Field label="Status">
      <StatusPicker {...shared} value={issue.stateId} onChange={(stateId) => patch({ stateId })} />
    </Field>
  )
  const assignee = (
    <Field label="Assignee">
      <AssigneePicker {...shared} value={issue.assigneeId} onChange={(assigneeId) => patch({ assigneeId })} />
    </Field>
  )
  const fields = host.minimal ? (
    <>
      {status}
      {assignee}
      <ShortcutPicker issue={issue} visible={['status', 'assignee']} />
    </>
  ) : (
    <>
      <ShortcutPicker issue={issue} visible={['status', 'priority', 'assignee', 'labels', 'project', 'parent', 'cycle', 'estimate', 'dueDate']} />
      {status}
      <Field label="Priority">
        <PriorityPicker {...shared} value={issue.priority} onChange={(priority) => patch({ priority })} />
      </Field>
      {assignee}
      <Field label="Labels">
        <LabelsPicker {...shared} value={issue.labelIds} onChange={(labelIds) => patch({ labelIds })}>
          {wide && (
            <span className="flex min-h-8 flex-wrap items-center gap-1 rounded-[var(--radius-control)] px-1 py-1 hover:bg-list-hover">
              {issue.labelIds.map((id) => labels.get(id)).filter((l) => l !== undefined).map((label) => (
                <span key={label.id} className="inline-flex h-[22px] items-center gap-1.5 rounded-full border border-border bg-raised px-2 text-[12px] text-ink-2">
                  <LabelDot color={label.color} />
                  {label.name}
                </span>
              ))}
              <span className={cn('inline-flex h-[22px] items-center gap-1 px-1 text-[12.5px] text-ink-3', issue.labelIds.length && 'w-[22px] justify-center')}>
                <Plus className="size-3.5" />
                {!issue.labelIds.length && 'Add label'}
              </span>
            </span>
          )}
        </LabelsPicker>
      </Field>
      <Field label="Project">
        <ProjectPicker {...shared} value={issue.projectId} onChange={(projectId) => patch({ projectId })} />
      </Field>
      <Field label="Parent">
        <ParentPicker {...shared} issueId={issue.id} value={issue.parentId} onChange={(parentId) => patch({ parentId })} />
      </Field>
      {hasCycles && (
        <Field label="Cycle">
          <CyclePicker {...shared} value={issue.cycleId} onChange={(cycleId) => patch({ cycleId })} />
        </Field>
      )}
      <Field label="Estimate">
        <EstimatePicker {...shared} value={issue.estimate} onChange={(estimate) => patch({ estimate })} />
      </Field>
      <Field label="Due date">
        <DueDatePicker {...shared} done={done} value={issue.dueDate} onChange={(dueDate) => patch({ dueDate })} />
      </Field>
    </>
  )
  if (!wide) {
    return <div className="mt-3 flex flex-wrap gap-1.5">{fields}</div>
  }
  return (
    <aside className="scrollbar-quiet w-[296px] shrink-0 overflow-y-auto border-l border-border px-3 py-4">
      <div className="flex flex-col gap-0.5">{fields}</div>
    </aside>
  )
}
