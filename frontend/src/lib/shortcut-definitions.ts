type Definition = { label: string; keys: string[]; group: string }

export const shortcuts = {
  branch: { label: 'Copy git branch name', keys: ['Mod+Shift+.'], group: 'Issue' },
  copyId: { label: 'Copy issue ID', keys: ['Mod+.'], group: 'Issue' },
  copyUrl: { label: 'Copy issue URL', keys: ['Mod+Shift+,'], group: 'Issue' },
  palette: { label: 'Open command menu', keys: ['Mod+k'], group: 'General' },
  search: { label: 'Search issues', keys: ['/', 'o i'], group: 'Navigation' },
  help: { label: 'Keyboard Shortcuts', keys: ['?', 'Mod+/'], group: 'General' },
  create: { label: 'Create issue', keys: ['c'], group: 'General' },
  back: { label: 'Back', keys: ['Escape'], group: 'General' },
  open: { label: 'Open focused issue', keys: ['Enter', 'o'], group: 'Navigation' },
  up: { label: 'Move up', keys: ['ArrowUp', 'k'], group: 'Navigation' },
  down: { label: 'Move down', keys: ['ArrowDown', 'j'], group: 'Navigation' },
  left: { label: 'Move left', keys: ['ArrowLeft'], group: 'Navigation' },
  right: { label: 'Move right', keys: ['ArrowRight'], group: 'Navigation' },
  details: { label: 'Toggle issue details', keys: ['Mod+i'], group: 'Navigation' },
  layout: { label: 'Toggle layout', keys: ['Mod+b'], group: 'Navigation' },
  board: { label: 'Go to board', keys: ['g d'], group: 'Navigation' },
  inbox: { label: 'Go to Inbox', keys: ['g i'], group: 'Navigation' },
  mine: { label: 'Go to My Issues', keys: ['g m'], group: 'Navigation' },
  all: { label: 'Go to all issues', keys: ['g e'], group: 'Navigation' },
  backlog: { label: 'Go to backlog', keys: ['g b'], group: 'Navigation' },
  projects: { label: 'Go to Projects', keys: ['g p'], group: 'Navigation' },
  views: { label: 'Go to Views', keys: ['g u'], group: 'Navigation' },
  settings: { label: 'Go to Settings', keys: ['g s'], group: 'Navigation' },
  openProject: { label: 'Open project…', keys: ['o p'], group: 'Navigation' },
  openTeam: { label: 'Open team…', keys: ['o t'], group: 'Navigation' },
  team1: { label: 'Go to team 1', keys: ['Ctrl+Shift+1'], group: 'Navigation' },
  team2: { label: 'Go to team 2', keys: ['Ctrl+Shift+2'], group: 'Navigation' },
  team3: { label: 'Go to team 3', keys: ['Ctrl+Shift+3'], group: 'Navigation' },
  team4: { label: 'Go to team 4', keys: ['Ctrl+Shift+4'], group: 'Navigation' },
  team5: { label: 'Go to team 5', keys: ['Ctrl+Shift+5'], group: 'Navigation' },
  team6: { label: 'Go to team 6', keys: ['Ctrl+Shift+6'], group: 'Navigation' },
  team7: { label: 'Go to team 7', keys: ['Ctrl+Shift+7'], group: 'Navigation' },
  team8: { label: 'Go to team 8', keys: ['Ctrl+Shift+8'], group: 'Navigation' },
  team9: { label: 'Go to team 9', keys: ['Ctrl+Shift+9'], group: 'Navigation' },
  parent: { label: 'Open parent issue', keys: ['Mod+Shift+ArrowUp'], group: 'Issue' },
  child: { label: 'Open sub-issue', keys: ['Mod+Shift+ArrowDown'], group: 'Issue' },
  subIssue: { label: 'Create sub-issue', keys: ['Mod+Shift+o'], group: 'Issue' },
  edit: { label: 'Edit issue', keys: ['Alt+e'], group: 'Issue' },
  rename: { label: 'Rename issue', keys: ['r'], group: 'Issue' },
  comment: { label: 'Comment on issue', keys: ['Ctrl+m'], group: 'Issue' },
  status: { label: 'Change status…', keys: ['s'], group: 'Issue' },
  priority: { label: 'Change priority…', keys: ['p'], group: 'Issue' },
  assignee: { label: 'Assign to…', keys: ['a'], group: 'Issue' },
  assignMe: { label: 'Assign to me', keys: ['i'], group: 'Issue' },
  labels: { label: 'Change labels…', keys: ['l'], group: 'Issue' },
  removeLabel: { label: 'Remove label…', keys: ['Shift+l'], group: 'Issue' },
  estimate: { label: 'Change estimate…', keys: ['Shift+e'], group: 'Issue' },
  dueDate: { label: 'Set due date…', keys: ['Shift+d'], group: 'Issue' },
  clearDueDate: { label: 'Remove due date', keys: ['Mod+Shift+d'], group: 'Issue' },
  team: { label: 'Move to team…', keys: ['Mod+Shift+m'], group: 'Issue' },
  deleteIssue: { label: 'Delete issue…', keys: ['Mod+Backspace', 'Mod+Delete'], group: 'Issue' },
  restore: { label: 'Restore issue', keys: ['#'], group: 'Issue' },
  cycle: { label: 'Add to cycle…', keys: ['Shift+c'], group: 'Issue' },
  project: { label: 'Add to project…', keys: ['Shift+p'], group: 'Issue' },
  activeCycle: { label: 'Add to active cycle', keys: ['Mod+Shift+c'], group: 'Issue' },
  status1: { label: 'Set status 1', keys: ['Mod+Alt+1'], group: 'Issue' },
  status2: { label: 'Set status 2', keys: ['Mod+Alt+2'], group: 'Issue' },
  status3: { label: 'Set status 3', keys: ['Mod+Alt+3'], group: 'Issue' },
  status4: { label: 'Set status 4', keys: ['Mod+Alt+4'], group: 'Issue' },
  status5: { label: 'Set status 5', keys: ['Mod+Alt+5'], group: 'Issue' },
  status6: { label: 'Set status 6', keys: ['Mod+Alt+6'], group: 'Issue' },
  status7: { label: 'Set status 7', keys: ['Mod+Alt+7'], group: 'Issue' },
  status8: { label: 'Set status 8', keys: ['Mod+Alt+8'], group: 'Issue' },
  status9: { label: 'Set status 9', keys: ['Mod+Alt+9'], group: 'Issue' },
  dismiss: { label: 'Dismiss Inbox update', keys: ['Backspace', 'e'], group: 'Inbox' },
  signOut: { label: 'Sign out', keys: ['Alt+Shift+q'], group: 'General' },
  zoomIn: { label: 'Zoom timeline in', keys: ['='], group: 'Timeline' },
  zoomOut: { label: 'Zoom timeline out', keys: ['-'], group: 'Timeline' },
} satisfies Record<string, Definition>

export type ShortcutId = keyof typeof shortcuts
export type ShortcutActions = Partial<Record<ShortcutId, () => void>>
export const shortcutIds = Object.keys(shortcuts) as ShortcutId[]

export function isMac() {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
}

export function shortcutLabel(keys: string, mac = isMac()) {
  return keys.replace(/Mod/g, mac ? '⌘' : 'Ctrl').replace(/Shift/g, '⇧').replace(/Alt/g, mac ? '⌥' : 'Alt')
    .replace(/Ctrl/g, mac ? '⌃' : 'Ctrl').replace(/ArrowUp/g, '↑').replace(/ArrowDown/g, '↓')
    .replace(/ArrowLeft/g, '←').replace(/ArrowRight/g, '→').replace(/Escape/g, 'Esc').replace(/Backspace/g, '⌫')
    .replace(/Enter/g, '↵').replace(/\+/g, ' ').toUpperCase()
}

export function matchesKey(event: KeyboardEvent, chord: string, mac: boolean) {
  if (event.isComposing) {
    return false
  }
  const parts = chord.split('+')
  const key = parts.pop()!
  if (key === '#' || key === '?') {
    return !event.metaKey && !event.ctrlKey && event.key === key
  }
  const mod = parts.includes('Mod')
  if (event.metaKey !== (mod && mac) || event.ctrlKey !== (parts.includes('Ctrl') || (mod && !mac)) || event.altKey !== parts.includes('Alt')) {
    return false
  }
  if (event.shiftKey !== parts.includes('Shift')) {
    return false
  }
  if (event.key.toLowerCase() === key.toLowerCase()) {
    return true
  }
  // Shift/Option can change punctuation and digits even on a US keyboard.
  const code = key === '.' ? 'Period' : key === ',' ? 'Comma' : key === '\\' ? 'Backslash' : /^\d$/.test(key) ? `Digit${key}` : parts.includes('Alt') ? `Key${key.toUpperCase()}` : ''
  return !!code && event.code === code
}
