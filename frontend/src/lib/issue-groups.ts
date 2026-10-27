import { type Ordering, compareIssues, compareStates, workflowOrder } from './issues'
import type { Issue, IssueDisplay, IssuePatch, Label, WorkflowState } from './types'

export type Grouping = IssueDisplay['grouping']

type Group = { key: string; name: string; issues: Issue[] }
type StateGroup = Group & { kind: 'state'; state: WorkflowState }
export type IssueGroup = StateGroup | (Group & { kind: 'label'; label: Label | null })

export function groupByState(issues: Issue[], states: Map<string, WorkflowState>, ordering: Ordering, teamStates: WorkflowState[], layout: 'list' | 'board', columns?: string[]) {
  const groups = new Map<string, StateGroup>()
  const add = (state: WorkflowState) => {
    const key = `${state.type}:${state.name}`
    if (!groups.has(key)) {
      groups.set(key, { key, name: state.name, kind: 'state', state, issues: [] })
    }
    return groups.get(key)!
  }
  for (const state of teamStates) {
    add(state)
  }
  for (const issue of issues) {
    const state = states.get(issue.stateId)
    if (state) {
      add(state).issues.push(issue)
    }
  }
  groups.forEach((group) => group.issues.sort(compareIssues(ordering)))
  const names = columns?.map((name) => name.toLowerCase())
  if (names) {
    const rank = (group: StateGroup) => names.indexOf(group.name.toLowerCase())
    return [...groups.values()].filter((group) => rank(group) >= 0).sort((a, b) => rank(a) - rank(b))
  }
  return [...groups.values()].sort((a, b) => (layout === 'board' ? workflowOrder(a.state, b.state) : 0) || compareStates(a.state, b.state))
}

export function groupByLabel(issues: Issue[], labels: Label[], ordering: Ordering, teamId?: string): IssueGroup[] {
  const groups = new Map<string, IssueGroup>(labels
    .filter((label) => !label.isGroup && (!teamId || !label.teamId || label.teamId === teamId))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((label) => [label.id, { key: label.id, name: label.name, kind: 'label', label, issues: [] }]))
  const unlabelled: IssueGroup = { key: 'no-label', name: 'No label', kind: 'label', label: null, issues: [] }
  for (const issue of issues) {
    const matching = issue.labelIds.map((id) => groups.get(id)).filter((group) => group !== undefined)
    for (const group of matching.length ? matching : [unlabelled]) {
      group.issues.push(issue)
    }
  }
  groups.set(unlabelled.key, unlabelled)
  groups.forEach((group) => group.issues.sort(compareIssues(ordering)))
  return [...groups.values()]
}

export function groupDefaults(group: IssueGroup): IssuePatch {
  return group.kind === 'state'
    ? { teamId: group.state.teamId, stateId: group.state.id }
    : { ...(group.label?.teamId && { teamId: group.label.teamId }), labelIds: group.label ? [group.label.id] : [] }
}

export function groupPatch(issue: Issue, from: IssueGroup, to: IssueGroup, states: WorkflowState[]): IssuePatch | null {
  if (to.kind === 'state') {
    const state = states.find((state) => state.teamId === issue.teamId && state.type === to.state.type && state.name === to.state.name)
    return state ? state.id === issue.stateId ? {} : { stateId: state.id } : null
  }
  if (to.label?.teamId && to.label.teamId !== issue.teamId) {
    return null
  }
  if (from.key === to.key) {
    return {}
  }
  const labelIds = to.label
    ? [...new Set([...issue.labelIds.filter((id) => from.kind !== 'label' || id !== from.label?.id), to.label.id])]
    : []
  return { labelIds }
}

export const issueGroupId = (group: IssueGroup, issue: Issue) => `${group.key}/${issue.id}`
