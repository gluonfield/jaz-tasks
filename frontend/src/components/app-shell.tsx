import { useNavigate, useRouterState } from '@tanstack/react-router'
import { type ReactNode } from 'react'
import { Toaster } from 'sonner'
import { host } from '@/lib/host'
import { useCatalog } from '@/lib/queries'
import { openCreateIssue, setUI, writePreference } from '@/lib/ui'
import { embedded } from '@/lib/api'
import { signOut } from '@/lib/auth'
import { ShortcutProvider, useShortcutActions } from '@/lib/shortcuts'
import type { ShortcutActions, ShortcutId } from '@/lib/shortcut-definitions'
import { cn } from '@/lib/utils'
import { CommandPalette } from './command-palette'
import { CreateIssueDialog } from './create-issue'
import { DeleteIssueDialog } from './delete-issue'
import { ShortcutsHelp } from './shortcuts-help'
import { NavDrawer } from './nav-drawer'
import { Sidebar } from './sidebar'

// useTeamFromRoute finds the team the current page belongs to, for defaults.
export function useRouteTeamId() {
  const { data: catalog } = useCatalog()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const key = path.match(/^\/team\/([^/]+)/)?.[1] ?? path.match(/^\/issue\/([A-Za-z0-9]+)-/)?.[1]
  return catalog?.teams.find((t) => t.key.toLowerCase() === key?.toLowerCase())?.id
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ShortcutProvider>
      <NavDrawer>
        <AppCommands />
        <div className="flex h-full min-h-0">
          {!host.minimal && <Sidebar className="max-md:hidden" />}
          <main className={cn('flex min-w-0 flex-1 flex-col overflow-hidden bg-bg', !host.minimal && 'md:my-2 md:mr-2 md:rounded-[var(--radius-card)]')}>
            {children}
          </main>
          <CreateIssueDialog />
          <CommandPalette />
          <ShortcutsHelp />
          <DeleteIssueDialog />
          <Toaster
            position="bottom-left"
            mobileOffset={{ bottom: 'calc(16px + var(--safe-area-bottom))' }}
            toastOptions={{
              unstyled: true,
              classNames: {
                toast:
                  'flex w-[340px] items-center gap-2.5 rounded-[var(--radius-card)] border border-border bg-raised px-3.5 py-3 text-[13px] text-ink shadow-[var(--shadow-raised)]',
                title: 'font-medium',
                description: 'text-ink-3',
                actionButton: 'ml-auto rounded-[5px] px-2 py-1 text-[12px] font-medium text-primary hover:bg-list-hover',
              },
            }}
          />
        </div>
      </NavDrawer>
    </ShortcutProvider>
  )
}

function AppCommands() {
  const navigate = useNavigate()
  const teamId = useRouteTeamId()
  const { data: catalog } = useCatalog()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const team = catalog?.teams.find((t) => t.id === teamId)
  const go = (to: string) => { void navigate({ to }) }
  const scope = team ? `/team/${team.key}` : '/issues'
  const openPalette = (palettePage: 'commands' | 'issues' | 'projects' | 'teams') => setUI({ paletteOpen: true, palettePage })
  const actions: ShortcutActions = {
    palette: () => openPalette('commands'),
    search: () => openPalette('issues'),
    openProject: () => openPalette('projects'),
    openTeam: () => openPalette('teams'),
    help: () => setUI({ helpOpen: true }),
    create: () => openCreateIssue({
      teamId,
      ...(path === '/my-issues' && { assigneeId: catalog?.viewer.id }),
      ...(path.startsWith('/project/') && { projectId: catalog?.projects.find((p) => path.endsWith(p.slugId))?.id }),
    }),
    inbox: () => go('/inbox'),
    mine: () => go('/my-issues'),
    all: () => go(team ? `${scope}/all` : scope),
    backlog: () => {
      void navigate({ to: team ? `${scope}/backlog` : '/issues', search: team ? {} : { view: 'backlog' } })
    },
    board: () => {
      writePreference(`layout:${team ? `team:${team.id}:all` : 'all:all'}`, 'board')
      go(team ? `${scope}/all` : scope)
    },
    projects: () => go('/projects'),
    views: () => go('/views'),
    settings: () => go('/settings'),
    ...(!embedded() && { signOut }),
  }
  catalog?.teams.slice(0, 9).forEach((team, index) => {
    actions[`team${index + 1}` as ShortcutId] = () => go(`/team/${team.key}/all`)
  })
  useShortcutActions(actions)
  return null
}
