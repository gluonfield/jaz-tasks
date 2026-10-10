import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { type ReactNode, useEffect } from 'react'
import { Toaster } from 'sonner'
import { useCatalog } from '@/lib/queries'
import type { Issue } from '@/lib/types'
import { type PickerKind, getUI, openCreateIssue, openCreateRelated, setUI } from '@/lib/ui'
import { CommandPalette } from './command-palette'
import { CreateIssueDialog } from './create-issue'
import { isTyping } from './issue-view'
import { NavDrawer } from './nav-drawer'
import { Sidebar } from './sidebar'

const pickerKeys: Record<string, PickerKind> = { s: 'status', p: 'priority', a: 'assignee', l: 'labels', e: 'estimate', D: 'dueDate' }
const goKeys: Record<string, string> = { i: '/inbox', m: '/my-issues', p: '/projects', v: '/views', s: '/settings' }

// useTeamFromRoute finds the team the current page belongs to, for defaults.
export function useRouteTeamId() {
  const { data: catalog } = useCatalog()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const key = path.match(/^\/team\/([^/]+)/)?.[1] ?? path.match(/^\/issue\/([A-Za-z0-9]+)-/)?.[1]
  return catalog?.teams.find((t) => t.key.toLowerCase() === key?.toLowerCase())?.id
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const teamId = useRouteTeamId()
  const client = useQueryClient()

  useEffect(() => {
    let pendingG = false
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setUI({ paletteOpen: !getUI().paletteOpen })
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'o' && !getUI().createOpen && !getUI().paletteOpen) {
        const issue = client.getQueryData<Issue[]>(['issues'])?.find((i) => i.id === getUI().focusedIssueId)
        if (issue) {
          e.preventDefault()
          openCreateRelated(issue, { parentId: issue.id })
        }
        return
      }
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || getUI().createOpen || getUI().paletteOpen) {
        return
      }
      if (pendingG) {
        pendingG = false
        if (goKeys[e.key]) {
          e.preventDefault()
          navigate({ to: goKeys[e.key] })
        }
        return
      }
      const focused = getUI().focusedIssueId
      if (e.key === 'g') {
        pendingG = true
        window.setTimeout(() => (pendingG = false), 1200)
      } else if (e.key === 'c') {
        e.preventDefault()
        openCreateIssue({ teamId })
      } else if (e.key === '/') {
        e.preventDefault()
        setUI({ paletteOpen: true })
      } else if (focused && pickerKeys[e.key]) {
        e.preventDefault()
        setUI({ picker: { kind: pickerKeys[e.key], issueId: focused } })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [client, navigate, teamId])

  return (
    <NavDrawer>
      <div className="flex h-full min-h-0">
        <Sidebar className="max-md:hidden" />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-bg md:my-2 md:mr-2 md:rounded-[var(--radius-card)]">
          {children}
        </main>
        <CreateIssueDialog />
        <CommandPalette />
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
  )
}
