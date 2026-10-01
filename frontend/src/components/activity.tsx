import { Button } from '@jaz/ui/button'
import { ArrowUp, Trash2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { formatDay, priorities, timeAgo } from '@/lib/issues'
import { useCatalogMaps, useCreateComment, useDeleteComment, useIssues } from '@/lib/queries'
import type { Comment, HistoryEntry, IssueDetail } from '@/lib/types'
import { Avatar, EntityIcon, LabelDot, PriorityIcon } from './icons'
import { Markdown } from './markdown'
import { cycleName, useStateIcon } from './properties'

type Entry = { kind: 'created'; at: string } | { kind: 'history'; at: string; entry: HistoryEntry } | { kind: 'comment'; at: string; comment: Comment }

export function Activity({ issue }: { issue: IssueDetail }) {
  const entries: Entry[] = [
    { kind: 'created' as const, at: issue.createdAt },
    ...issue.history.map((entry) => ({ kind: 'history' as const, at: entry.createdAt, entry })),
    ...issue.comments.map((comment) => ({ kind: 'comment' as const, at: comment.createdAt, comment })),
  ].sort((a, b) => a.at.localeCompare(b.at))
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-[14px] font-semibold text-ink">Activity</h2>
      <ol className="relative flex flex-col gap-3.5 before:absolute before:bottom-2 before:left-[9px] before:top-2 before:w-px before:bg-border">
        {entries.map((entry) =>
          entry.kind === 'comment' ? (
            <CommentItem key={entry.comment.id} comment={entry.comment} identifier={issue.identifier} />
          ) : entry.kind === 'history' ? (
            <HistoryItem key={entry.entry.id} entry={entry.entry} />
          ) : (
            <Line key="created" actorId={issue.creatorId} at={issue.createdAt}>
              created the issue
            </Line>
          ),
        )}
      </ol>
      <Composer identifier={issue.identifier} />
    </section>
  )
}

function Line({ actorId, at, icon, children }: { actorId: string | null; at: string; icon?: ReactNode; children: ReactNode }) {
  const { users } = useCatalogMaps()
  const actor = actorId ? users.get(actorId) : null
  return (
    <li className="relative flex min-h-5 items-center gap-2.5 text-[12.5px] text-ink-3">
      <span className="relative z-10 flex size-[19px] shrink-0 items-center justify-center rounded-full bg-bg">{icon ?? <Avatar user={actor} size={16} />}</span>
      <span className="min-w-0 leading-5">
        <span className="font-medium text-ink-2">{actor?.name ?? 'Someone'}</span> {children}
        <span className="mx-1.5">·</span>
        <time title={new Date(at).toLocaleString()}>{timeAgo(at)}</time>
      </span>
    </li>
  )
}

function Strong({ children }: { children: ReactNode }) {
  return <span className="font-medium text-ink-2">{children}</span>
}

function HistoryItem({ entry }: { entry: HistoryEntry }) {
  const { states, users, labels, projects, cycles, teams } = useCatalogMaps()
  const { data: issues = [] } = useIssues()
  const stateIcon = useStateIcon()
  const lines: { icon?: ReactNode; text: ReactNode }[] = []
  const state = (id: string | null) => (id ? states.get(id) : undefined)
  if (entry.toStateId) {
    const to = state(entry.toStateId)
    lines.push({
      icon: to && stateIcon(to),
      text: (
        <>
          changed status from <Strong>{state(entry.fromStateId)?.name ?? 'none'}</Strong> to <Strong>{to?.name}</Strong>
        </>
      ),
    })
  }
  if (entry.fromAssigneeId !== entry.toAssigneeId) {
    const to = entry.toAssigneeId ? users.get(entry.toAssigneeId) : null
    const from = entry.fromAssigneeId ? users.get(entry.fromAssigneeId) : null
    lines.push({
      text: to ? (
        entry.toAssigneeId === entry.actorId ? (
          'self-assigned the issue'
        ) : (
          <>
            assigned the issue to <Strong>{to.name}</Strong>
          </>
        )
      ) : (
        <>
          removed assignee <Strong>{from?.name}</Strong>
        </>
      ),
    })
  }
  if (entry.toPriority !== null && entry.fromPriority !== entry.toPriority) {
    lines.push({
      icon: <PriorityIcon priority={entry.toPriority} className="size-3" />,
      text: entry.toPriority ? (
        <>
          set priority to <Strong>{priorities[entry.toPriority].label}</Strong>
        </>
      ) : (
        'removed priority'
      ),
    })
  }
  if (entry.toTitle && entry.fromTitle) {
    lines.push({
      text: (
        <>
          changed the title from <Strong>{entry.fromTitle}</Strong> to <Strong>{entry.toTitle}</Strong>
        </>
      ),
    })
  }
  for (const id of entry.addedLabelIds ?? []) {
    const label = labels.get(id)
    lines.push({
      icon: label && <LabelDot color={label.color} />,
      text: (
        <>
          added label <Strong>{label?.name}</Strong>
        </>
      ),
    })
  }
  for (const id of entry.removedLabelIds ?? []) {
    lines.push({
      text: (
        <>
          removed label <Strong>{labels.get(id)?.name}</Strong>
        </>
      ),
    })
  }
  if (entry.fromProjectId !== entry.toProjectId) {
    const project = projects.get((entry.toProjectId ?? entry.fromProjectId)!)
    lines.push({
      icon: project && <EntityIcon icon={project.icon} color={project.color} className="size-3" />,
      text: (
        <>
          {entry.toProjectId ? 'added the issue to project' : 'removed the issue from project'} <Strong>{project?.name}</Strong>
        </>
      ),
    })
  }
  if (entry.fromCycleId !== entry.toCycleId) {
    const cycle = cycles.get((entry.toCycleId ?? entry.fromCycleId)!)
    lines.push({
      text: (
        <>
          {entry.toCycleId ? 'added the issue to' : 'removed the issue from'} <Strong>{cycle ? cycleName(cycle) : 'a cycle'}</Strong>
        </>
      ),
    })
  }
  if (entry.fromEstimate !== entry.toEstimate) {
    lines.push({ text: entry.toEstimate === null ? 'removed the estimate' : <>set estimate to <Strong>{entry.toEstimate} points</Strong></> })
  }
  if (entry.fromDueDate !== entry.toDueDate) {
    lines.push({ text: entry.toDueDate ? <>set due date to <Strong>{formatDay(entry.toDueDate)}</Strong></> : 'removed the due date' })
  }
  if (entry.fromParentId !== entry.toParentId) {
    const parent = issues.find((i) => i.id === (entry.toParentId ?? entry.fromParentId))?.identifier
    lines.push({
      text: entry.toParentId ? (
        <>made this a sub-issue{parent && <> of <Strong>{parent}</Strong></>}</>
      ) : (
        <>removed the parent issue {parent && <Strong>{parent}</Strong>}</>
      ),
    })
  }
  if (entry.toTeamId) {
    lines.push({
      text: (
        <>
          moved the issue from <Strong>{teams.get(entry.fromTeamId ?? '')?.name}</Strong> to <Strong>{teams.get(entry.toTeamId)?.name}</Strong>
        </>
      ),
    })
  }
  if (entry.updatedDescription) {
    lines.push({ text: 'updated the description' })
  }
  if (entry.archived !== null) {
    lines.push({ text: entry.archived ? 'archived the issue' : 'restored the issue' })
  }
  return lines.map((line, i) => (
    <Line key={`${entry.id}-${i}`} actorId={entry.actorId} at={entry.createdAt} icon={line.icon}>
      {line.text}
    </Line>
  ))
}

function CommentItem({ comment, identifier }: { comment: Comment; identifier: string }) {
  const { users, catalog } = useCatalogMaps()
  const remove = useDeleteComment(identifier)
  const author = comment.userId ? users.get(comment.userId) : null
  const mine = comment.userId === catalog?.viewer.id
  return (
    <li className="group relative ml-7 animate-rise rounded-[var(--radius-card)] border border-border bg-raised px-3.5 py-3 shadow-[0_1px_2px_rgb(0_0_0/0.03)]">
      <div className="mb-1.5 flex items-center gap-2 text-[12.5px]">
        <Avatar user={author} size={18} />
        <span className="font-medium text-ink">{author?.name ?? 'Someone'}</span>
        <time className="text-ink-3" title={new Date(comment.createdAt).toLocaleString()}>
          {timeAgo(comment.createdAt)}
          {comment.editedAt && ' (edited)'}
        </time>
        {mine && (
          <Button
            aria-label="Delete comment"
            onClick={() => remove.mutate(comment.id)}
            variant="ghost" size="icon-sm" className="ml-auto opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
      <Markdown className="text-[13.5px]">{comment.body}</Markdown>
    </li>
  )
}

function Composer({ identifier }: { identifier: string }) {
  const [body, setBody] = useState('')
  const create = useCreateComment(identifier)
  const submit = () => {
    if (body.trim()) {
      create.mutate(body.trim(), { onSuccess: () => setBody('') })
    }
  }
  return (
    <div className="ml-7 mt-4 rounded-[var(--radius-card)] border border-border bg-raised px-3.5 pb-2.5 pt-3 shadow-[0_1px_2px_rgb(0_0_0/0.03)] transition-[border-color] focus-within:border-[color-mix(in_oklab,var(--color-ink)_20%,transparent)]">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            submit()
          }
        }}
        placeholder="Leave a comment..."
        className="field-sizing-content min-h-10 w-full resize-none bg-transparent text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-ink-3"
      />
      <div className="flex justify-end">
        <Button
          aria-label="Comment"
          disabled={!body.trim() || create.isPending}
          onClick={submit}
          variant="primary" size="icon"
        >
          <ArrowUp className="size-4" />
        </Button>
      </div>
    </div>
  )
}
