import { useSyncExternalStore } from 'react'
import { readItem, writeItem } from './storage'
import type { Issue, IssuePatch } from './types'

// Shell-wide UI state shared by shortcuts, the palette and the views.
type UIState = {
  createOpen: boolean
  // childId makes the new issue the parent of an existing one.
  createDefaults: IssuePatch & { teamId?: string; childId?: string }
  paletteOpen: boolean
  // focusedIssueId is the list/board row keyboard shortcuts act on.
  focusedIssueId: string | null
  // picker opens a property picker for the focused issue from the keyboard.
  picker: { kind: PickerKind; issueId: string } | null
}

export type PickerKind = 'status' | 'priority' | 'assignee' | 'labels' | 'project' | 'parent' | 'cycle' | 'estimate' | 'dueDate'

let state: UIState = { createOpen: false, createDefaults: {}, paletteOpen: false, focusedIssueId: null, picker: null }
const listeners = new Set<() => void>()

export function setUI(patch: Partial<UIState>) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

export function getUI() {
  return state
}

export function useUI<T>(select: (s: UIState) => T): T {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => select(state),
    () => select(state),
  )
}

// useWide reports whether the viewport reaches Tailwind's md breakpoint, where
// the desktop layout starts.
export function useWide() {
  const query = '(min-width: 48rem)'
  return useSyncExternalStore(
    (listener) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', listener)
      return () => media.removeEventListener('change', listener)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

export function openCreateIssue(defaults: UIState['createDefaults'] = {}) {
  setUI({ createOpen: true, createDefaults: defaults })
}

// openCreateRelated starts an issue in the same team, project and cycle as issue.
export function openCreateRelated(issue: Issue, defaults: UIState['createDefaults'] = {}) {
  openCreateIssue({ teamId: issue.teamId, projectId: issue.projectId, cycleId: issue.cycleId, ...defaults })
}

// usePersistent keeps a small per-view preference (layout, ordering) in localStorage.
export function readPreference<T extends string>(key: string, fallback: T): T {
  return (readItem(`jaz-tasks:${key}`) as T | null) ?? fallback
}

export function writePreference(key: string, value: string) {
  writeItem(`jaz-tasks:${key}`, value)
  listeners.forEach((listener) => listener())
}

export function usePreference<T extends string>(key: string, fallback: T): [T, (value: T) => void] {
  const value = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => readPreference(key, fallback),
    () => fallback,
  )
  return [value, (next) => writePreference(key, next)]
}
