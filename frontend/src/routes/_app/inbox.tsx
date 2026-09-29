import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Inbox as InboxIcon } from 'lucide-react'
import { useMemo } from 'react'
import { EmptyState } from '@/components/empty-state'
import { Avatar } from '@/components/icons'
import { IssuePage } from '@/components/issue-page'
import { useStateIcon } from '@/components/properties'
import { timeAgo } from '@/lib/issues'
import { useCatalogMaps, useIssues } from '@/lib/queries'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app/inbox')({
  validateSearch: (search): { issue?: string } => ({ issue: typeof search.issue === 'string' ? search.issue : undefined }),
  component: Inbox,
})

// Inbox lists the latest changes to issues the viewer owns or created.
function Inbox() {
  const { issue: selected } = Route.useSearch()
  const navigate = useNavigate()
  const { catalog, states, users } = useCatalogMaps()
  const { data: issues = [] } = useIssues()
  const stateIcon = useStateIcon()
  const me = catalog?.viewer.id
  const entries = useMemo(
    () =>
      issues
        .filter((i) => i.assigneeId === me || i.creatorId === me)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 50),
    [issues, me],
  )
  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[340px] shrink-0 flex-col border-r border-border">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4 text-[13px] font-medium text-ink">
          <InboxIcon className="size-4 text-ink-2" /> Inbox
        </header>
        <div className="scrollbar-quiet flex-1 overflow-y-auto p-1.5">
          {entries.map((issue) => {
            const state = states.get(issue.stateId)
            const creator = issue.creatorId ? users.get(issue.creatorId) : null
            return (
              <button
                key={issue.id}
                onClick={() => navigate({ to: '/inbox', search: { issue: issue.identifier } })}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left outline-none transition-colors hover:bg-list-hover',
                  selected === issue.identifier && 'bg-list-active hover:bg-list-active',
                )}
              >
                <Avatar user={creator} size={22} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-ink">{issue.title}</span>
                    <span className="ml-auto shrink-0 text-[11.5px] text-ink-3">{timeAgo(issue.updatedAt)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-3">
                    {state && stateIcon(state, 'size-3')}
                    {issue.identifier} · {issue.assigneeId === me ? 'Assigned to you' : 'Created by you'}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        {selected ? (
          <IssuePage identifier={selected} />
        ) : (
          <EmptyState icon={<InboxIcon className="size-5" />} title="Inbox" body="Select an update to see the issue and its activity." />
        )}
      </div>
    </div>
  )
}
