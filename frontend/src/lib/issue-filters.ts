import { parseDay } from './issues'
import type { Issue, IssueDisplay, WorkflowState } from './types'

function thisWeek(date: Date, now: number) {
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7)
  const nextMonday = new Date(monday)
  nextMonday.setDate(nextMonday.getDate() + 7)
  return date >= monday && date < nextMonday
}

export function matchesIssueDisplay(issue: Issue, states: Map<string, WorkflowState>, display: IssueDisplay, now: number) {
  if (display.dueDateFilter === 'week' && (!issue.dueDate || !thisWeek(parseDay(issue.dueDate), now))) {
    return false
  }
  const type = states.get(issue.stateId)?.type
  if (type !== 'completed' && type !== 'canceled') {
    return true
  }
  if (display.completedFilter === 'all') {
    return true
  }
  const finishedAt = type === 'completed' ? issue.completedAt : issue.canceledAt
  if (display.completedFilter === 'hidden' || !finishedAt) {
    return false
  }
  const finished = new Date(finishedAt)
  return display.completedFilter === 'week'
    ? thisWeek(finished, now)
    : finished.getTime() >= now - (display.completedFilter === '30d' ? 30 : 7) * 86_400_000
}
