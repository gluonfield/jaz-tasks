import { dueStatus } from './issues'
import { matchesIssueDisplay } from './issue-filters'
import type { Issue, IssueDisplay, SavedView, WorkflowState } from './types'

type Context = { states: Map<string, WorkflowState>; viewerId?: string; now: number }
type View = { id: string; name: string; description: string; defaultCompletedFilter?: IssueDisplay['completedFilter']; match: (issue: Issue, context: Context) => boolean }

// Built-in views are saved filters evaluated over the local issue set.
export const views: View[] = [
  {
    id: 'urgent',
    name: 'Urgent & high priority',
    description: 'Open issues marked urgent or high',
    match: (i: Issue, c: Context) => open(i, c) && (i.priority === 1 || i.priority === 2),
  },
  {
    id: 'due-soon',
    name: 'Due soon',
    description: 'Open issues overdue or due within two days',
    match: (i: Issue, c: Context) => open(i, c) && ['overdue', 'soon'].includes(dueStatus(i.dueDate, false) ?? ''),
  },
  {
    id: 'unassigned',
    name: 'Unassigned',
    description: 'Open issues nobody owns yet',
    match: (i: Issue, c: Context) => open(i, c) && !i.assigneeId,
  },
  {
    id: 'in-progress',
    name: 'In progress',
    description: 'Everything being worked on across teams',
    match: (i: Issue, c: Context) => c.states.get(i.stateId)?.type === 'started',
  },
  {
    id: 'completed',
    name: 'Recently completed',
    description: 'Issues completed in the last 14 days',
    defaultCompletedFilter: 'all',
    match: (i: Issue, c: Context) => !!i.completedAt && c.now - new Date(i.completedAt).getTime() < 14 * 86_400_000,
  },
]

function open(issue: Issue, { states }: Context) {
  return !['completed', 'canceled'].includes(states.get(issue.stateId)?.type ?? '')
}

export function savedViewDefinition(view: SavedView): View {
  return {
    id: view.id,
    name: view.name,
    description: `${view.layout === 'board' ? 'Board' : 'List'} · Grouped by ${view.grouping === 'label' ? 'label' : 'status'}`,
    match: (issue: Issue, context: Context) =>
      (!view.teamId || issue.teamId === view.teamId) &&
      (!view.labelIds.length || issue.labelIds.some((id) => view.labelIds.includes(id))) &&
      matchesIssueDisplay(issue, context.states, view, context.now),
  }
}
