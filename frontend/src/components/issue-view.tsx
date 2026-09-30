import { LayoutGrid, List, type LucideIcon } from 'lucide-react'
import { type ReactNode, useEffect, useMemo } from 'react'
import { type Ordering, compareIssues, compareStates } from '@/lib/issues'
import { useCatalogMaps } from '@/lib/queries'
import type { Issue, IssuePatch, WorkflowState } from '@/lib/types'
import { getUI, setUI, usePreference } from '@/lib/ui'
import { cn } from '@/lib/utils'
import { DisplayMenu, DisplaySelect } from './display-menu'
import { EmptyState } from './empty-state'
import { IssueBoard } from './issue-board'
import { IssueList } from './issue-list'

const layouts: ['list' | 'board', LucideIcon][] = [
  ['list', List],
  ['board', LayoutGrid],
]

const orderings: [Ordering, string][] = [
  ['manual', 'Manual'],
  ['priority', 'Priority'],
  ['updated', 'Last updated'],
  ['created', 'Last created'],
]

export type IssueGroup = { key: string; state: WorkflowState; issues: Issue[] }

// groupByState merges same-named states across teams, like Linear's
// cross-team views, and keeps empty groups for the given team's workflow.
export function groupByState(issues: Issue[], states: Map<string, WorkflowState>, ordering: Ordering, teamStates: WorkflowState[] = []) {
  const groups = new Map<string, IssueGroup>()
  const key = (s: WorkflowState) => `${s.type}:${s.name}`
  for (const state of teamStates) {
    groups.set(key(state), { key: key(state), state, issues: [] })
  }
  for (const issue of issues) {
    const state = states.get(issue.stateId)
    if (!state) {
      continue
    }
    const group = groups.get(key(state)) ?? { key: key(state), state, issues: [] }
    group.issues.push(issue)
    groups.set(key(state), group)
  }
  const sorted = [...groups.values()].sort((a, b) => compareStates(a.state, b.state))
  sorted.forEach((g) => g.issues.sort(compareIssues(ordering)))
  return sorted
}

export function IssueView({
  viewKey,
  title,
  tabs,
  issues,
  loading,
  teamStates,
  createDefaults,
  empty,
}: {
  viewKey: string
  title: ReactNode
  tabs?: ReactNode
  issues: Issue[]
  loading: boolean
  teamStates?: WorkflowState[]
  createDefaults?: IssuePatch & { teamId?: string }
  empty?: ReactNode
}) {
  const [layout, setLayout] = usePreference<'list' | 'board'>(`layout:${viewKey}`, 'list')
  const [ordering, setOrdering] = usePreference<Ordering>(`ordering:${viewKey}`, 'manual')
  const [showCompleted, setShowCompleted] = usePreference<'yes' | 'no'>(`completed:${viewKey}`, 'yes')
  const { states } = useCatalogMaps()
  const visible = useMemo(
    () =>
      showCompleted === 'yes'
        ? issues
        : issues.filter((i) => !['completed', 'canceled'].includes(states.get(i.stateId)?.type ?? '')),
    [issues, showCompleted, states],
  )
  const groups = useMemo(
    () => groupByState(visible, states, ordering, layout === 'board' ? teamStates : []),
    [visible, states, ordering, layout, teamStates],
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader title={title} tabs={tabs}>
        <DisplayMenu layouts={layouts} layout={layout} setLayout={setLayout}>
          <DisplaySelect label="Ordering" value={ordering} options={orderings} onChange={setOrdering} />
          <label className="mt-2.5 flex items-center justify-between text-[12.5px] text-ink-2">
            Show completed issues
            <input
              type="checkbox"
              checked={showCompleted === 'yes'}
              onChange={(e) => setShowCompleted(e.target.checked ? 'yes' : 'no')}
              className="accent-[var(--color-primary)]"
            />
          </label>
        </DisplayMenu>
      </ViewHeader>
      <div className="min-h-0 flex-1">
        {loading ? null : !visible.length ? (
          (empty ?? <EmptyState title="No issues" body="Issues that match this view will show up here." createDefaults={createDefaults} />)
        ) : layout === 'board' ? (
          <IssueBoard groups={groups} ordering={ordering} createDefaults={createDefaults} />
        ) : (
          <IssueList groups={groups} ordering={ordering} createDefaults={createDefaults} />
        )}
      </div>
    </div>
  )
}

export function ViewHeader({ title, tabs, children }: { title: ReactNode; tabs?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-4">
      <div className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-ink">{title}</div>
      {tabs && <div className="flex items-center gap-1">{tabs}</div>}
      <div className="ml-auto flex items-center gap-1.5">{children}</div>
    </header>
  )
}

export function Tab({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-[26px] rounded-[var(--radius-control)] border px-2.5 text-[12.5px] font-medium outline-none transition-colors duration-100',
        active ? 'border-border bg-list-active text-ink' : 'border-transparent text-ink-2 hover:bg-list-hover hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

export function isTyping(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || !!target.closest('[role=dialog],[role=menu],[data-radix-popper-content-wrapper]')
}

// useListNavigation gives j/k/arrows/enter over the rendered issue order.
export function useListNavigation(issues: Issue[]) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) {
        return
      }
      const current = issues.findIndex((i) => i.id === getUI().focusedIssueId)
      const move = (delta: number) => {
        e.preventDefault()
        const next = issues[Math.max(0, Math.min(issues.length - 1, current < 0 ? 0 : current + delta))]
        if (next) {
          setUI({ focusedIssueId: next.id })
          document.querySelector(`[data-issue-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' })
        }
      }
      if (e.key === 'j' || e.key === 'ArrowDown') {
        move(1)
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        move(-1)
      } else if ((e.key === 'Enter' || e.key === 'o') && current >= 0) {
        e.preventDefault()
        ;(document.querySelector(`[data-issue-id="${issues[current].id}"]`) as HTMLElement | null)?.click()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [issues])
}
