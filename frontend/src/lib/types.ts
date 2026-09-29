export type StateType = 'triage' | 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled'

export type Team = { id: string; key: string; name: string; icon: string | null; color: string | null }

export type WorkflowState = {
  id: string
  name: string
  type: StateType
  color: string
  position: number
  teamId: string
}

export type User = {
  id: string
  name: string
  displayName: string
  email: string
  avatarUrl: string | null
  initials: string
  active: boolean
  isMe: boolean
}

export type Label = { id: string; name: string; color: string; isGroup: boolean; teamId: string | null; parentId: string | null }

export type ProjectStatusType = 'backlog' | 'planned' | 'started' | 'paused' | 'completed' | 'canceled'

export type Project = {
  id: string
  name: string
  slugId: string
  icon: string | null
  color: string
  description: string
  status: { id: string; name: string; type: ProjectStatusType; color: string }
  leadId: string | null
  startDate: string | null
  targetDate: string | null
  progress: number
  teamIds: string[]
  url: string
}

export type Cycle = {
  id: string
  number: number
  name: string | null
  startsAt: string
  endsAt: string
  isActive: boolean
  progress: number
  teamId: string
}

export type Catalog = {
  viewer: User
  organization: { id: string; name: string; urlKey: string; projectStatuses: Project['status'][] }
  teams: Team[]
  states: WorkflowState[]
  users: User[]
  labels: Label[]
  projects: Project[]
  cycles: Cycle[]
}

export type Issue = {
  id: string
  identifier: string
  number: number
  title: string
  priority: number
  estimate: number | null
  sortOrder: number
  dueDate: string | null
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
  canceledAt: string | null
  labelIds: string[]
  teamId: string
  stateId: string
  assigneeId: string | null
  creatorId: string | null
  projectId: string | null
  cycleId: string | null
  parentId: string | null
  url: string
}

export type Comment = {
  id: string
  body: string
  createdAt: string
  editedAt: string | null
  userId: string | null
}

export type HistoryEntry = {
  id: string
  createdAt: string
  actorId: string | null
  fromStateId: string | null
  toStateId: string | null
  fromAssigneeId: string | null
  toAssigneeId: string | null
  fromPriority: number | null
  toPriority: number | null
  fromTitle: string | null
  toTitle: string | null
  fromProjectId: string | null
  toProjectId: string | null
  fromCycleId: string | null
  toCycleId: string | null
  fromEstimate: number | null
  toEstimate: number | null
  fromDueDate: string | null
  toDueDate: string | null
  fromParentId: string | null
  toParentId: string | null
  fromTeamId: string | null
  toTeamId: string | null
  addedLabelIds: string[] | null
  removedLabelIds: string[] | null
  updatedDescription: boolean | null
  archived: boolean | null
}

export type IssueDetail = Issue & {
  description: string | null
  comments: Comment[]
  history: HistoryEntry[]
}

// IssuePatch is the subset of IssueUpdateInput the UI edits; null clears.
export type IssuePatch = Partial<{
  title: string
  description: string | null
  stateId: string
  priority: number
  estimate: number | null
  assigneeId: string | null
  projectId: string | null
  cycleId: string | null
  parentId: string | null
  labelIds: string[]
  dueDate: string | null
  sortOrder: number
}>
