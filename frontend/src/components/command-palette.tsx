import { useNavigate } from '@tanstack/react-router'
import { Command as CommandPrimitive } from 'cmdk'
import { ArrowRight, Box, CircleDot, Copy, Inbox, Layers, Monitor, Moon, SquarePen, Sun, Tag, UserRound, UserRoundCheck } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { priorities, workflowOrder } from '@/lib/issues'
import { useCatalogMaps, useIssues, useUpdateIssue } from '@/lib/queries'
import { setSchemePreference } from '@/lib/theme'
import type { IssuePatch } from '@/lib/types'
import { getUI, openCreateIssue, setUI, useUI } from '@/lib/ui'
import { Avatar, LabelDot, PriorityIcon } from './icons'
import { Kbd } from './kbd'
import { useStateIcon } from './properties'

type Page = 'root' | 'status' | 'priority' | 'assignee' | 'labels'

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen)
  return (
    <Dialog open={open} onOpenChange={(next) => setUI({ paletteOpen: next })}>
      <DialogContent
        showCloseButton={false}
        className="top-[14%] w-[640px] max-w-[calc(100vw-2rem)] translate-y-0 gap-0 overflow-hidden rounded-[12px] border-border bg-raised p-0 shadow-[var(--shadow-raised)] sm:max-w-[640px]"
      >
        <DialogTitle className="sr-only">Command menu</DialogTitle>
        {open && <Palette />}
      </DialogContent>
    </Dialog>
  )
}

function Palette() {
  const navigate = useNavigate()
  const { catalog, states } = useCatalogMaps()
  const { data: issues = [] } = useIssues()
  const update = useUpdateIssue()
  const stateIcon = useStateIcon()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState<Page>('root')
  const focused = useMemo(() => issues.find((i) => i.id === getUI().focusedIssueId), [issues])
  const close = () => setUI({ paletteOpen: false })
  const go = (to: string) => {
    close()
    navigate({ to })
  }
  const patch = (value: IssuePatch) => {
    if (focused) {
      update.mutate({ id: focused.id, patch: value })
    }
    close()
  }
  const open = (next: Page) => {
    setPage(next)
    setSearch('')
  }

  return (
    <CommandPrimitive
      loop
      onKeyDown={(e) => {
        if (e.key === 'Backspace' && !search && page !== 'root') {
          e.preventDefault()
          setPage('root')
        }
      }}
    >
      {focused && (
        <div className="flex items-center gap-2 px-4 pt-3">
          <span className="inline-flex h-[22px] items-center rounded-[5px] bg-list-active px-1.5 text-[12px] font-medium text-ink-2">
            {focused.identifier} <span className="ml-1.5 max-w-80 truncate font-normal">{focused.title}</span>
          </span>
        </div>
      )}
      <CommandPrimitive.Input
        autoFocus
        value={search}
        onValueChange={setSearch}
        placeholder={page === 'root' ? 'Type a command or search...' : `Change ${page}...`}
        className="h-12 w-full border-b border-border bg-transparent px-4 text-[15px] text-ink outline-none placeholder:text-ink-3"
      />
      <CommandPrimitive.List className="scrollbar-quiet max-h-[min(420px,60vh)] overflow-y-auto p-1.5 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11.5px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-3">
        <CommandPrimitive.Empty className="py-8 text-center text-[13px] text-ink-3">No results</CommandPrimitive.Empty>
        {page === 'status' && focused &&
          (catalog?.states ?? [])
            .filter((s) => s.teamId === focused.teamId)
            .sort(workflowOrder)
            .map((s) => (
              <Item key={s.id} icon={stateIcon(s)} onSelect={() => patch({ stateId: s.id })}>
                {s.name}
              </Item>
            ))}
        {page === 'priority' &&
          priorities.map((p) => (
            <Item key={p.value} icon={<PriorityIcon priority={p.value} />} onSelect={() => patch({ priority: p.value })}>
              {p.label}
            </Item>
          ))}
        {page === 'assignee' && (
          <>
            <Item icon={<Avatar user={null} size={16} />} onSelect={() => patch({ assigneeId: null })}>
              No assignee
            </Item>
            {catalog?.users.map((u) => (
              <Item key={u.id} icon={<Avatar user={u} size={16} />} onSelect={() => patch({ assigneeId: u.id })}>
                {u.name}
              </Item>
            ))}
          </>
        )}
        {page === 'labels' &&
          focused &&
          catalog?.labels
            .filter((l) => !l.isGroup && (!l.teamId || l.teamId === focused.teamId))
            .map((l) => (
              <Item
                key={l.id}
                icon={<LabelDot color={l.color} />}
                onSelect={() =>
                  patch({ labelIds: focused.labelIds.includes(l.id) ? focused.labelIds.filter((id) => id !== l.id) : [...focused.labelIds, l.id] })
                }
              >
                {focused.labelIds.includes(l.id) ? `Remove ${l.name}` : `Add ${l.name}`}
              </Item>
            ))}
        {page === 'root' && (
          <>
            {focused && (
              <CommandPrimitive.Group heading="Issue">
                <Item icon={stateIcon(states.get(focused.stateId)!)} shortcut="S" onSelect={() => open('status')}>
                  Change status...
                </Item>
                <Item icon={<PriorityIcon priority={focused.priority} />} shortcut="P" onSelect={() => open('priority')}>
                  Change priority...
                </Item>
                <Item icon={<UserRound />} shortcut="A" onSelect={() => open('assignee')}>
                  Assign to...
                </Item>
                <Item icon={<Tag />} shortcut="L" onSelect={() => open('labels')}>
                  Change labels...
                </Item>
                <Item icon={<ArrowRight />} onSelect={() => go(`/issue/${focused.identifier}`)}>
                  Open issue
                </Item>
                <Item icon={<Copy />} onSelect={() => navigator.clipboard.writeText(focused.url).then(close)}>
                  Copy issue URL
                </Item>
              </CommandPrimitive.Group>
            )}
            <CommandPrimitive.Group heading="Actions">
              <Item
                icon={<SquarePen />}
                shortcut="C"
                onSelect={() => {
                  close()
                  openCreateIssue()
                }}
              >
                Create new issue
              </Item>
              <Item icon={<Sun />} onSelect={() => (setSchemePreference('light'), close())}>
                Switch to light theme
              </Item>
              <Item icon={<Moon />} onSelect={() => (setSchemePreference('dark'), close())}>
                Switch to dark theme
              </Item>
              <Item icon={<Monitor />} onSelect={() => (setSchemePreference('system'), close())}>
                Use system theme
              </Item>
            </CommandPrimitive.Group>
            <CommandPrimitive.Group heading="Navigation">
              <Item icon={<Inbox />} shortcut="G I" onSelect={() => go('/inbox')}>
                Go to Inbox
              </Item>
              <Item icon={<UserRoundCheck />} shortcut="G M" onSelect={() => go('/my-issues')}>
                Go to My issues
              </Item>
              <Item icon={<Box />} shortcut="G P" onSelect={() => go('/projects')}>
                Go to Projects
              </Item>
              <Item icon={<Layers />} shortcut="G V" onSelect={() => go('/views')}>
                Go to Views
              </Item>
              {catalog?.teams.map((t) => (
                <Item key={t.id} icon={<CircleDot />} onSelect={() => go(`/team/${t.key}/all`)}>
                  Go to {t.name} issues
                </Item>
              ))}
            </CommandPrimitive.Group>
            {search && (
              <CommandPrimitive.Group heading="Issues">
                {issues.map((issue) => (
                  <Item
                    key={issue.id}
                    value={`${issue.identifier} ${issue.title}`}
                    icon={states.get(issue.stateId) && stateIcon(states.get(issue.stateId)!)}
                    onSelect={() => go(`/issue/${issue.identifier}`)}
                  >
                    <span className="mr-2 text-ink-3 tabular-nums">{issue.identifier}</span>
                    {issue.title}
                  </Item>
                ))}
              </CommandPrimitive.Group>
            )}
          </>
        )}
      </CommandPrimitive.List>
    </CommandPrimitive>
  )
}

function Item({
  icon,
  shortcut,
  value,
  onSelect,
  children,
}: {
  icon?: ReactNode
  shortcut?: string
  value?: string
  onSelect: () => void
  children: ReactNode
}) {
  return (
    <CommandPrimitive.Item
      value={value}
      onSelect={onSelect}
      className="flex h-10 cursor-default items-center gap-3 rounded-[7px] px-2.5 text-[13.5px] text-ink outline-none data-[selected=true]:bg-list-active [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-2"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut && (
        <span className="flex gap-0.5">
          {shortcut.split(' ').map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </span>
      )}
    </CommandPrimitive.Item>
  )
}
