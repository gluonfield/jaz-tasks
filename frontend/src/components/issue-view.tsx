import { Button } from '@jaz/ui/button'
import { LayoutGrid, List, type LucideIcon } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { host } from '@/lib/host'
import { type Ordering, compareIssues, compareStates, workflowOrder } from '@/lib/issues'
import { useCatalogMaps } from '@/lib/queries'
import type { Issue, IssuePatch, WorkflowState } from '@/lib/types'
import { usePreference } from '@/lib/ui'
import { DisplayMenu, DisplaySelect } from './display-menu'
import { EmptyState } from './empty-state'
import { IssueBoard } from './issue-board'
import { IssueList } from './issue-list'
import { NavButton } from './nav-drawer'

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
  groups.forEach((g) => g.issues.sort(compareIssues(ordering)))
  return [...groups.values()]
}

// orderGroups puts rows in state order and boards in workflow order. Columns
// the host names replace both: only those states, in the named order.
function orderGroups(groups: IssueGroup[], layout: 'list' | 'board') {
  const names = host.columns?.map((name) => name.toLowerCase())
  if (names) {
    const rank = (g: IssueGroup) => names.indexOf(g.state.name.toLowerCase())
    return groups.filter((g) => rank(g) >= 0).sort((a, b) => rank(a) - rank(b))
  }
  if (layout === 'board') {
    return groups.sort((a, b) => workflowOrder(a.state, b.state) || compareStates(a.state, b.state))
  }
  return groups.sort((a, b) => compareStates(a.state, b.state))
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
  const [layout, setLayout] = usePreference<'list' | 'board'>(`layout:${viewKey}`, host.view ?? 'list')
  const [ordering, setOrdering] = usePreference<Ordering>(`ordering:${viewKey}`, 'manual')
  const [showCompleted, setShowCompleted] = usePreference<'yes' | 'no'>(`completed:${viewKey}`, 'yes')
  const { catalog, states } = useCatalogMaps()
  const visible = useMemo(
    () =>
      showCompleted === 'yes'
        ? issues
        : issues.filter((i) => !['completed', 'canceled'].includes(states.get(i.stateId)?.type ?? '')),
    [issues, showCompleted, states],
  )
  const groups = useMemo(
    () => orderGroups(groupByState(visible, states, ordering, layout === 'board' ? teamStates : []), layout),
    [visible, states, ordering, layout, teamStates],
  )
  const minimal = host.minimal

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader title={title} tabs={!minimal && tabs}>
        {!minimal && (
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
        )}
      </ViewHeader>
      <div className="min-h-0 flex-1">
        {loading || !catalog ? null : !groups.some((g) => g.issues.length) ? (
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

export function ViewHeader({ title, tabs, leading = <NavButton />, children }: { title: ReactNode; tabs?: ReactNode; leading?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-4">
      {leading}
      <div className="flex max-w-[60%] shrink-0 items-center gap-2 overflow-hidden whitespace-nowrap text-[13px] font-medium text-ink">{title}</div>
      {tabs && <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">{tabs}</div>}
      <div className="ml-auto flex items-center gap-1.5">{children}</div>
    </header>
  )
}

export function Tab({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <Button aria-pressed={active} onClick={onClick} className={active ? 'bg-list-active' : undefined}>
      {children}
    </Button>
  )
}
