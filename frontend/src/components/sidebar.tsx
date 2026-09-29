import { Link, useRouterState } from '@tanstack/react-router'
import {
  Box,
  Check,
  ChevronDown,
  CircleDot,
  Inbox,
  Layers,
  LogOut,
  Monitor,
  Moon,
  Search,
  Settings,
  SquarePen,
  Sun,
  Target,
  UserRoundCheck,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { switchWorkspace, useWorkspaces } from '@/lib/account'
import { signOut } from '@/lib/auth'
import { useCatalog } from '@/lib/queries'
import { setSchemePreference } from '@/lib/theme'
import { openCreateIssue, setUI } from '@/lib/ui'
import { cn } from '@/lib/utils'
import { TeamBadge } from './icons'
import { Kbd } from './kbd'

export function Sidebar() {
  const { data: catalog } = useCatalog()
  return (
    <aside className="flex w-[232px] shrink-0 flex-col gap-px px-2.5 pb-3 pt-2.5 text-[13px]">
      <div className="mb-2 flex items-center gap-1">
        <WorkspaceMenu name={catalog?.organization.name ?? 'Jaz'} email={catalog?.viewer.email} />
        <IconButton label="Search" shortcut="⌘K" onClick={() => setUI({ paletteOpen: true })}>
          <Search className="size-4" />
        </IconButton>
        <IconButton label="New issue" shortcut="C" onClick={() => openCreateIssue()} className="bg-raised shadow-xs ring-1 ring-border">
          <SquarePen className="size-4" />
        </IconButton>
      </div>
      <NavItem to="/inbox" icon={<Inbox />}>
        Inbox
      </NavItem>
      <NavItem to="/my-issues" icon={<UserRoundCheck />}>
        My issues
      </NavItem>
      <Section title="Workspace">
        <NavItem to="/projects" icon={<Box />}>
          Projects
        </NavItem>
        <NavItem to="/views" icon={<Layers />}>
          Views
        </NavItem>
      </Section>
      <Section title="Your teams">
        {catalog?.teams.map((team) => <TeamNav key={team.id} team={team} />)}
      </Section>
    </aside>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-4 flex flex-col gap-px">
      <div className="flex h-7 items-center px-2 text-[12px] font-medium text-ink-3">{title}</div>
      {children}
    </div>
  )
}

function NavItem({ to, icon, children, indent = false }: { to: string; icon?: ReactNode; children: ReactNode; indent?: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname })
  const active = path === to || (to !== '/' && path.startsWith(to + '/'))
  return (
    <Link
      to={to}
      className={cn(
        'flex h-7 items-center gap-2.5 rounded-[var(--radius-control)] px-2 font-medium text-ink-2 outline-none transition-colors duration-100 hover:bg-list-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0',
        active && 'bg-list-active text-ink hover:bg-list-active',
        indent && 'pl-[30px]',
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </Link>
  )
}

function TeamNav({ team }: { team: { id: string; key: string; name: string; icon: string | null; color: string | null } }) {
  const [open, setOpen] = useState(true)
  const base = `/team/${team.key}`
  return (
    <div className="flex flex-col gap-px">
      <button
        onClick={() => setOpen(!open)}
        className="group flex h-7 items-center gap-2 rounded-[var(--radius-control)] px-2 font-medium text-ink-2 outline-none hover:bg-list-hover hover:text-ink"
      >
        <TeamBadge icon={team.icon} color={team.color} />
        <span className="truncate">{team.name}</span>
        <ChevronDown className={cn('size-3 text-ink-3 transition-transform duration-150', !open && '-rotate-90')} />
      </button>
      {open && (
        <div className="flex flex-col gap-px">
          <NavItem to={`${base}/all`} indent icon={<CircleDot />}>
            Issues
          </NavItem>
          <NavItem to={`${base}/active`} indent icon={<Target />}>
            Active
          </NavItem>
          <NavItem to={`${base}/backlog`} indent icon={<Layers />}>
            Backlog
          </NavItem>
        </div>
      )}
    </div>
  )
}

function IconButton({
  label,
  shortcut,
  onClick,
  className,
  children,
}: {
  label: string
  shortcut: string
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-label={label}
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-ink-2 outline-none transition-colors hover:bg-list-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label} <Kbd>{shortcut}</Kbd>
      </TooltipContent>
    </Tooltip>
  )
}

function WorkspaceMenu({ name, email }: { name: string; email?: string }) {
  const { data: workspaces = [] } = useWorkspaces()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-control)] px-1.5 font-semibold text-ink outline-none hover:bg-list-hover data-[state=open]:bg-list-active">
        <span className="flex size-[18px] shrink-0 items-center justify-center rounded-[5px] bg-primary text-[10px] font-bold text-on-primary">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="truncate">{name}</span>
        <ChevronDown className="size-3 shrink-0 text-ink-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {email && <DropdownMenuLabel className="truncate text-[12px] font-normal text-ink-3">{email}</DropdownMenuLabel>}
        {workspaces.map((workspace) => (
          <DropdownMenuItem key={workspace.id} onSelect={() => !workspace.current && switchWorkspace(workspace.id)}>
            <span className="flex size-4 items-center justify-center rounded-[4px] bg-primary text-[9px] font-bold text-on-primary">
              {workspace.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
            {workspace.current && <Check className="text-ink-2" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Sun /> Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={() => setSchemePreference('light')}>
              <Sun /> Light
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setSchemePreference('dark')}>
              <Moon /> Dark
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setSchemePreference('system')}>
              <Monitor /> System
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings /> Settings
            <DropdownMenuShortcut>G S</DropdownMenuShortcut>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
