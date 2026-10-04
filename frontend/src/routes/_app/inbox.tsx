import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button } from '@jaz/ui/button'
import { Check, CheckCheck, Inbox as InboxIcon, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/empty-state'
import { Avatar } from '@/components/icons'
import { IssuePage } from '@/components/issue-page'
import { useStateIcon } from '@/components/properties'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { timeAgo } from '@/lib/issues'
import { useCatalogMaps, useDismissInbox, useInbox } from '@/lib/queries'
import type { InboxUpdate } from '@/lib/types'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app/inbox')({
  validateSearch: (search): { issue?: string } => ({ issue: typeof search.issue === 'string' ? search.issue : undefined }),
  component: Inbox,
})

function Inbox() {
  const { issue: selected } = Route.useSearch()
  const navigate = useNavigate()
  const { catalog, states, users } = useCatalogMaps()
  const { data: entries = [], isPending, isError } = useInbox()
  const dismiss = useDismissInbox()
  const stateIcon = useStateIcon()
  const me = catalog?.viewer.id
  const selectedUpdate = entries.find(({ issue }) => issue.identifier === selected)
  const completed = entries.filter(({ issue }) => {
    const type = states.get(issue.stateId)?.type
    return type === 'completed' || type === 'canceled'
  })
  const dismissUpdates = (updates: InboxUpdate[]) => {
    dismiss.mutate(updates, { onError: () => toast.error('Could not dismiss updates') })
  }
  return (
    <div
      className="flex h-full min-h-0"
      onKeyDown={(event) => {
        if (event.key !== 'Backspace' || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || dismiss.isPending || !selectedUpdate) {
          return
        }
        if ((event.target as HTMLElement).closest('input, textarea, [contenteditable="true"], [role="dialog"], [role="menu"]')) {
          return
        }
        event.preventDefault()
        dismissUpdates([selectedUpdate])
      }}
    >
      <div className={cn('flex w-[340px] shrink-0 flex-col border-r border-border', selected ? 'hidden md:flex' : 'max-w-full')}>
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4 text-[13px] font-medium text-ink">
          <InboxIcon className="size-4 text-ink-2" /> Inbox
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="ml-auto" aria-label="Inbox actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={!selectedUpdate || dismiss.isPending} onSelect={() => selectedUpdate && dismissUpdates([selectedUpdate])}>
                <Check /> Dismiss update <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!completed.length || dismiss.isPending} onSelect={() => dismissUpdates(completed)}>
                <CheckCheck /> Dismiss completed updates
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!entries.length || dismiss.isPending} onSelect={() => dismissUpdates(entries)}>
                <CheckCheck /> Dismiss all updates
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <div className="scrollbar-quiet flex-1 overflow-y-auto p-1.5">
          {(isPending || isError || !entries.length) && (
            <p className="px-2.5 py-4 text-[12px] text-ink-3">{isPending ? 'Loading updates…' : isError ? 'Could not load updates' : 'No new updates'}</p>
          )}
          {entries.map((update) => {
            const { issue } = update
            const state = states.get(issue.stateId)
            const creator = issue.creatorId ? users.get(issue.creatorId) : null
            return (
              <div
                key={issue.id}
                className={cn(
                  'group flex items-center rounded-[var(--radius-control)] pr-1 transition-colors hover:bg-list-hover',
                  selected === issue.identifier && 'bg-list-active hover:bg-list-active',
                )}
              >
                <button
                  onClick={() => navigate({ to: '/inbox', search: { issue: issue.identifier } })}
                  className="flex min-w-0 flex-1 items-start gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Avatar user={creator} size={22} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-ink">{issue.title}</span>
                      <span className="ml-auto shrink-0 text-[11.5px] text-ink-3">{timeAgo(update.updatedAt)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-3">
                      {state && stateIcon(state, 'size-3')}
                      {issue.identifier} · {issue.assigneeId === me ? 'Assigned to you' : 'Created by you'}
                    </span>
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Dismiss update for ${issue.identifier}`}
                  title="Dismiss update"
                  disabled={dismiss.isPending}
                  onClick={() => dismissUpdates([update])}
                  className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                >
                  <Check />
                </Button>
              </div>
            )
          })}
        </div>
      </div>
      <div className={cn('min-w-0 flex-1', !selected && 'hidden md:block')}>
        {selected ? (
          <div className="flex h-full min-h-0 flex-col">
            <Button variant="ghost" size="sm" className="m-2 self-start md:hidden" onClick={() => navigate({ to: '/inbox', search: {} })}>
              <InboxIcon /> Inbox
            </Button>
            <div className="min-h-0 flex-1"><IssuePage identifier={selected} /></div>
          </div>
        ) : (
          <EmptyState
            icon={<InboxIcon className="size-5" />}
            title={!isPending && !isError && !entries.length ? 'All caught up' : 'Inbox'}
            body={!isPending && !isError && !entries.length ? 'New updates will appear here.' : 'Select an update to see the issue and its activity.'}
          />
        )}
      </div>
    </div>
  )
}
