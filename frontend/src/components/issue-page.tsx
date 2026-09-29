import { Link, useNavigate } from '@tanstack/react-router'
import { Archive, ChevronRight, Copy, GitBranch, Link2, MoreHorizontal, Plus } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useArchiveIssue, useCatalogMaps, useIssueDetail, useIssues } from '@/lib/queries'
import type { Issue, IssueDetail } from '@/lib/types'
import { openCreateIssue, setUI } from '@/lib/ui'
import { cn } from '@/lib/utils'
import { Activity } from './activity'
import { Avatar, LabelDot, TeamBadge } from './icons'
import { useIssuePatch } from './issue-row'
import { isTyping } from './issue-view'
import { Markdown } from './markdown'
import {
  AssigneePicker,
  CyclePicker,
  DueDatePicker,
  EstimatePicker,
  LabelsPicker,
  PriorityPicker,
  ProjectPicker,
  StatusPicker,
  useStateIcon,
} from './properties'

export function IssuePage({ identifier }: { identifier: string }) {
  const { data: issue, error } = useIssueDetail(identifier)
  const navigate = useNavigate()
  const { teams } = useCatalogMaps()
  const team = issue && teams.get(issue.teamId)

  useEffect(() => {
    if (issue) {
      setUI({ focusedIssueId: issue.id })
    }
  }, [issue?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isTyping(e) && team) {
        navigate({ to: '/team/$teamKey/$view', params: { teamKey: team.key, view: 'all' } })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, team])

  if (error) {
    return <p className="p-8 text-[13px] text-ink-3">{error.message}</p>
  }
  if (!issue) {
    return null
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4 text-[13px]">
        {team && (
          <Link
            to="/team/$teamKey/$view"
            params={{ teamKey: team.key, view: 'all' }}
            className="flex items-center gap-2 rounded-[5px] px-1 py-0.5 font-medium text-ink-2 outline-none hover:text-ink"
          >
            <TeamBadge icon={team.icon} color={team.color} />
            {team.name}
          </Link>
        )}
        <ChevronRight className="size-3 text-ink-3" />
        <span className="font-medium text-ink">{issue.identifier}</span>
        <IssueMenu issue={issue} />
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="scrollbar-quiet min-w-0 flex-1 overflow-y-auto">
          <div key={issue.id} className="mx-auto max-w-[780px] animate-rise px-10 pb-24 pt-9">
            <ParentLink issue={issue} />
            <Title key={issue.title} issue={issue} />
            <Description key={issue.description} issue={issue} />
            <SubIssues issue={issue} />
            <Activity issue={issue} />
          </div>
        </div>
        <Properties issue={issue} />
      </div>
    </div>
  )
}

function IssueMenu({ issue }: { issue: Issue }) {
  const navigate = useNavigate()
  const archive = useArchiveIssue()
  const copy = (text: string, what: string) => navigator.clipboard.writeText(text).then(() => toast(`${what} copied`))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="ml-auto flex size-7 items-center justify-center rounded-[var(--radius-control)] text-ink-2 outline-none hover:bg-list-hover hover:text-ink data-[state=open]:bg-list-active">
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => copy(issue.url, 'Issue URL')}>
          <Link2 /> Copy issue URL
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => copy(issue.identifier, 'Issue ID')}>
          <Copy /> Copy issue ID
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => copy(`${issue.identifier.toLowerCase()}-${slug(issue.title)}`, 'Branch name')}>
          <GitBranch /> Copy git branch name
        </DropdownMenuItem>
        <DropdownMenuItem
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
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function slug(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
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
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(issue.description ?? '')
  const save = () => {
    setEditing(false)
    if (text !== (issue.description ?? '')) {
      patch({ description: text.trim() ? text : null })
    }
  }
  if (editing) {
    return (
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
        placeholder="Add description..."
        className="field-sizing-content mt-4 min-h-24 w-full resize-none bg-transparent text-[14px] leading-[1.6] text-ink outline-none placeholder:text-ink-3"
      />
    )
  }
  return (
    <div onClick={() => setEditing(true)} className="mt-4 min-h-8 cursor-text">
      {issue.description ? <Markdown>{issue.description}</Markdown> : <p className="text-[14px] text-ink-3">Add description...</p>}
    </div>
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
        <button
          onClick={() => openCreateIssue({ teamId: issue.teamId, parentId: issue.id, projectId: issue.projectId, cycleId: issue.cycleId })}
          className="ml-auto flex h-6 items-center gap-1 rounded-[5px] px-1.5 text-[12.5px] text-ink-3 outline-none hover:bg-list-hover hover:text-ink"
        >
          <Plus className="size-3.5" /> Add sub-issue
        </button>
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
                className="flex h-9 items-center gap-2.5 border-b border-border/60 px-3 text-[13px] outline-none last:border-b-0 hover:bg-list-hover"
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

function Properties({ issue }: { issue: Issue }) {
  const patch = useIssuePatch(issue)
  const { catalog, labels, states } = useCatalogMaps()
  const done = ['completed', 'canceled'].includes(states.get(issue.stateId)?.type ?? '')
  const hasCycles = !!issue.cycleId || !!catalog?.cycles.some((c) => c.teamId === issue.teamId)
  const shared = { teamId: issue.teamId, issueId: issue.id, variant: 'row' as const }
  return (
    <aside className="scrollbar-quiet w-[296px] shrink-0 overflow-y-auto border-l border-border px-3 py-4">
      <div className="flex flex-col gap-0.5">
        <Row label="Status">
          <StatusPicker {...shared} value={issue.stateId} onChange={(stateId) => patch({ stateId })} />
        </Row>
        <Row label="Priority">
          <PriorityPicker {...shared} value={issue.priority} onChange={(priority) => patch({ priority })} />
        </Row>
        <Row label="Assignee">
          <AssigneePicker {...shared} value={issue.assigneeId} onChange={(assigneeId) => patch({ assigneeId })} />
        </Row>
        <Row label="Labels">
          <LabelsPicker {...shared} value={issue.labelIds} onChange={(labelIds) => patch({ labelIds })}>
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
          </LabelsPicker>
        </Row>
        <Row label="Project">
          <ProjectPicker {...shared} value={issue.projectId} onChange={(projectId) => patch({ projectId })} />
        </Row>
        {hasCycles && (
          <Row label="Cycle">
            <CyclePicker {...shared} value={issue.cycleId} onChange={(cycleId) => patch({ cycleId })} />
          </Row>
        )}
        <Row label="Estimate">
          <EstimatePicker {...shared} value={issue.estimate} onChange={(estimate) => patch({ estimate })} />
        </Row>
        <Row label="Due date">
          <DueDatePicker {...shared} done={done} value={issue.dueDate} onChange={(dueDate) => patch({ dueDate })} />
        </Row>
      </div>
    </aside>
  )
}
