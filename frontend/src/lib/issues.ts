import type { Issue, StateType, WorkflowState } from './types'

export const priorities = [
  { value: 0, label: 'No priority' },
  { value: 1, label: 'Urgent' },
  { value: 2, label: 'High' },
  { value: 3, label: 'Medium' },
  { value: 4, label: 'Low' },
] as const

// Linear lists work in flight first and finished work last.
const stateTypeOrder: StateType[] = ['triage', 'started', 'unstarted', 'backlog', 'completed', 'canceled']

export function compareStates(a: WorkflowState, b: WorkflowState) {
  return stateTypeOrder.indexOf(a.type) - stateTypeOrder.indexOf(b.type) || b.position - a.position
}

// Workflow order is the team's own order, Backlog to Canceled, used by pickers and boards.
export function workflowOrder(a: WorkflowState, b: WorkflowState) {
  return a.position - b.position
}

export type Ordering = 'manual' | 'priority' | 'updated' | 'created'

const priorityRank = (p: number) => (p === 0 ? 5 : p)

export function compareIssues(ordering: Ordering) {
  return (a: Issue, b: Issue) => {
    switch (ordering) {
      case 'priority':
        return priorityRank(a.priority) - priorityRank(b.priority) || a.sortOrder - b.sortOrder
      case 'updated':
        return b.updatedAt.localeCompare(a.updatedAt)
      case 'created':
        return b.createdAt.localeCompare(a.createdAt)
      default:
        return a.sortOrder - b.sortOrder
    }
  }
}

// sortOrderBetween picks a manual sort order that lands between two neighbours.
export function sortOrderBetween(before?: Issue, after?: Issue) {
  if (before && after) {
    return (before.sortOrder + after.sortOrder) / 2
  }
  if (before) {
    return before.sortOrder + 1
  }
  if (after) {
    return after.sortOrder - 1
  }
  return 0
}

const day = 24 * 60 * 60 * 1000

export function parseDay(date: string) {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function dueStatus(date: string | null, done: boolean): 'overdue' | 'soon' | 'later' | null {
  if (!date || done) {
    return date ? 'later' : null
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = (parseDay(date).getTime() - today.getTime()) / day
  return diff < 0 ? 'overdue' : diff <= 2 ? 'soon' : 'later'
}

const shortDate = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })
const longDate = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' })

export function formatDay(date: string) {
  const parsed = parseDay(date)
  return (parsed.getFullYear() === new Date().getFullYear() ? shortDate : longDate).format(parsed)
}

export function formatDate(iso: string) {
  const parsed = new Date(iso)
  return (parsed.getFullYear() === new Date().getFullYear() ? shortDate : longDate).format(parsed)
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'narrow' })

export function timeAgo(iso: string) {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return relative.format(Math.round(seconds / size), unit)
    }
  }
  return 'just now'
}

export function toDateInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
