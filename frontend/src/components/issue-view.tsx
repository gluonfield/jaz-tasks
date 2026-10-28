import { Button } from '@jaz/ui/button'
import { type ReactNode, useMemo } from 'react'
import { host } from '@/lib/host'
import { type Grouping, groupByLabel, groupByState } from '@/lib/issue-groups'
import { matchesIssueDisplay } from '@/lib/issue-filters'
import type { Ordering } from '@/lib/issues'
import { useCatalogMaps } from '@/lib/queries'
import type { Issue, IssueDisplay, IssuePatch, WorkflowState } from '@/lib/types'
import { usePreference } from '@/lib/ui'
import { useNow } from '@/lib/use-now'
import { IssueDisplayMenu } from './issue-display'
import { EmptyState } from './empty-state'
import { IssueBoard } from './issue-board'
import { IssueList } from './issue-list'
import { NavButton } from './nav-drawer'

type IssueViewProps = {
  viewKey: string
  title: ReactNode
  tabs?: ReactNode
  actions?: ReactNode
  issues: Issue[]
  loading: boolean
  teamStates?: WorkflowState[]
  labelIds?: string[]
  createDefaults?: IssuePatch & { teamId?: string }
  empty?: ReactNode
  defaultCompletedFilter?: IssueDisplay['completedFilter']
}

export function IssueView(props: IssueViewProps & { settings?: { value: IssueDisplay; onChange: (patch: Partial<IssueDisplay>) => void } }) {
  return props.settings
    ? <ConfiguredIssueView {...props} display={props.settings.value} onDisplayChange={props.settings.onChange} />
    : <LocalIssueView {...props} />
}

function LocalIssueView(props: IssueViewProps) {
  const { viewKey } = props
  const [layout, setLayout] = usePreference<'list' | 'board'>(`layout:${viewKey}`, host.view ?? 'list')
  const [ordering, setOrdering] = usePreference<Ordering>(`ordering:${viewKey}`, 'manual')
  const [grouping, setGrouping] = usePreference<Grouping>(`grouping:${viewKey}`, 'state')
  const [completed, setCompleted] = usePreference<IssueDisplay['completedFilter'] | 'yes' | 'no'>(`completed:${viewKey}`, props.defaultCompletedFilter ?? (host.minimal ? 'all' : '7d'))
  const completedFilter = completed === 'yes' ? 'all' : completed === 'no' ? 'hidden' : completed
  const [dueDateFilter, setDueDateFilter] = usePreference<IssueDisplay['dueDateFilter']>(`due:${viewKey}`, 'any')
  const [showEmpty, setShowEmpty] = usePreference<'yes' | 'no'>(`empty:${viewKey}`, 'yes')
  return <ConfiguredIssueView {...props} display={{ layout, grouping, ordering, completedFilter, dueDateFilter, showEmpty: showEmpty === 'yes' }} onDisplayChange={(patch) => {
    if (patch.layout) setLayout(patch.layout)
    if (patch.grouping) setGrouping(patch.grouping)
    if (patch.ordering) setOrdering(patch.ordering)
    if (patch.completedFilter) setCompleted(patch.completedFilter)
    if (patch.dueDateFilter) setDueDateFilter(patch.dueDateFilter)
    if (patch.showEmpty !== undefined) setShowEmpty(patch.showEmpty ? 'yes' : 'no')
  }} />
}

function ConfiguredIssueView({ title, tabs, actions, issues, loading, teamStates, labelIds, createDefaults, empty, display, onDisplayChange }: IssueViewProps & { display: IssueDisplay; onDisplayChange: (patch: Partial<IssueDisplay>) => void }) {
  const { layout, grouping, ordering, showEmpty } = display
  const { catalog, states } = useCatalogMaps()
  const now = useNow()
  const visible = useMemo(
    () => issues.filter((issue) => matchesIssueDisplay(issue, states, display, now)),
    [issues, display, states, now],
  )
  const groups = useMemo(
    () => {
      const grouped = grouping === 'label' && !host.columns
        ? groupByLabel(visible, (catalog?.labels ?? []).filter((label) => !labelIds?.length || labelIds.includes(label.id)), ordering, createDefaults?.teamId)
        : groupByState(visible, states, ordering, layout === 'board' ? teamStates ?? [] : [], layout, host.columns)
      return showEmpty ? grouped : grouped.filter((group) => group.issues.length)
    },
    [visible, catalog, states, ordering, grouping, layout, teamStates, createDefaults?.teamId, showEmpty, labelIds],
  )
  const minimal = host.minimal

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader title={title} tabs={!minimal && tabs}>
        {!minimal && <>{actions}<IssueDisplayMenu value={display} onChange={onDisplayChange} /></>}
      </ViewHeader>
      <div className="min-h-0 flex-1">
        {loading || !catalog ? null : !groups.length ? (
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
