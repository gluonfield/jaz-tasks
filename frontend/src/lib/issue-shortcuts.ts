import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { copyIssue } from './issue-copy'
import type { IssueGroup } from './issue-groups'
import { workflowOrder } from './issues'
import { useCatalogMaps, useIssues, useRestoreIssue, useUpdateIssue } from './queries'
import type { ShortcutActions, ShortcutId } from './shortcut-definitions'
import { useShortcutActions } from './shortcuts'
import type { Issue, IssuePatch } from './types'
import { type PickerKind, openCreateRelated, setUI, useUI } from './ui'

export function useIssueShortcuts(issue: Issue | undefined) {
  const navigate = useNavigate()
  const { catalog } = useCatalogMaps()
  const { data: issues = [] } = useIssues()
  const update = useUpdateIssue()
  const restore = useRestoreIssue()
  const actions: ShortcutActions = {}
  if (issue) {
    const patch = (value: IssuePatch) => update.mutate({ id: issue.id, patch: value })
    const open = (identifier: string) => { void navigate({ to: '/issue/$identifier', params: { identifier } }) }
    const parent = issues.find((i) => i.id === issue.parentId)
    const child = issues.filter((i) => i.parentId === issue.id).sort((a, b) => a.number - b.number)[0]
    const active = catalog?.cycles.find((c) => c.teamId === issue.teamId && c.isActive)
    Object.assign(actions, {
      branch: () => { void copyIssue(issue, 'branch') },
      copyId: () => { void copyIssue(issue, 'copyId') },
      copyUrl: () => { void copyIssue(issue, 'copyUrl') },
      open: () => open(issue.identifier),
      subIssue: () => openCreateRelated(issue, { parentId: issue.id }),
      deleteIssue: () => setUI({ deleteIssue: issue }),
      ...(catalog && { assignMe: () => patch({ assigneeId: catalog.viewer.id }) }),
      rename: () => { void navigate({ to: '/issue/$identifier', params: { identifier: issue.identifier }, search: { edit: 'title' } }) },
      edit: () => { void navigate({ to: '/issue/$identifier', params: { identifier: issue.identifier }, search: { edit: 'description' } }) },
      comment: () => { void navigate({ to: '/issue/$identifier', params: { identifier: issue.identifier }, search: { edit: 'comment' } }) },
    } satisfies ShortcutActions)
    for (const kind of ['status', 'priority', 'assignee', 'labels', 'project', 'cycle', 'estimate', 'dueDate', 'team'] satisfies PickerKind[]) {
      actions[kind] = () => setUI({ picker: { kind, issueId: issue.id } })
    }
    if (issue.labelIds.length) {
      actions.removeLabel = () => setUI({ picker: { kind: 'removeLabel', issueId: issue.id } })
    }
    if (issue.archivedAt) {
      actions.restore = () => restore.mutate(issue, {
        onSuccess: () => toast(`${issue.identifier} restored`),
        onError: (error) => toast.error(error.message),
      })
    }
    if (issue.dueDate) {
      actions.clearDueDate = () => patch({ dueDate: null })
    }
    if (parent) {
      actions.parent = () => open(parent.identifier)
    }
    if (child) {
      actions.child = () => open(child.identifier)
    }
    if (active) {
      actions.activeCycle = () => patch({ cycleId: active.id })
    }
    catalog?.states.filter((s) => s.teamId === issue.teamId).sort(workflowOrder).slice(0, 9).forEach((state, index) => {
      actions[`status${index + 1}` as ShortcutId] = () => patch({ stateId: state.id })
    })
  }
  useShortcutActions(actions)
}

export function useListNavigation(groups: IssueGroup[], board = false) {
  const focused = useUI((s) => s.focusedIssueId)
  const focusedGroup = useUI((s) => s.focusedGroupKey)
  const entries = useMemo(() => groups.flatMap((group) => group.issues.map((issue) => ({ issue, group: group.key }))), [groups])
  const selected = entries.find((entry) => entry.issue.id === focused && entry.group === focusedGroup) ?? entries.find((entry) => entry.issue.id === focused)
  const current = selected ? entries.indexOf(selected) : -1
  useIssueShortcuts(selected?.issue)
  useEffect(() => {
    if (focused && selected?.group !== focusedGroup) {
      setUI({ focusedIssueId: selected?.issue.id ?? null, focusedGroupKey: selected?.group ?? null, picker: null })
    }
  }, [focused, focusedGroup, selected])
  useEffect(() => () => setUI({ focusedIssueId: null, focusedGroupKey: null, picker: null }), [])
  const focus = (entry?: typeof entries[number]) => {
    if (entry) {
      setUI({ focusedIssueId: entry.issue.id, focusedGroupKey: entry.group })
      document.querySelector(`[data-issue-group="${CSS.escape(entry.group)}"] [data-issue-id="${CSS.escape(entry.issue.id)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }
  const move = (delta: number) => focus(entries[Math.max(0, Math.min(entries.length - 1, current < 0 ? 0 : current + delta))])
  const across = (delta: number) => {
    const populated = groups.filter((group) => group.issues.length)
    const column = populated.findIndex((group) => group.key === focusedGroup)
    const row = populated[column]?.issues.findIndex((issue) => issue.id === focused) ?? 0
    const next = populated[column + delta]
    const issue = next?.issues[Math.min(Math.max(row, 0), next.issues.length - 1)]
    focus(issue && { issue, group: next.key })
  }
  useShortcutActions({
    ...(entries.length && { up: () => move(-1), down: () => move(1), back: () => setUI({ focusedIssueId: null, focusedGroupKey: null }) }),
    ...(board && { left: () => across(-1), right: () => across(1) }),
  })
}
