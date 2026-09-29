import { type QueryClient, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { gql } from './api'
import type { Catalog, Comment, HistoryEntry, Issue, IssueDetail, IssuePatch } from './types'

type Ref = { id: string } | null
type Page<T> = { nodes: T[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }

const id = (ref: Ref) => ref?.id ?? null

const catalogQuery = /* GraphQL */ `
  query Catalog {
    viewer { id }
    organization { id name urlKey projectStatuses { id name type color } }
    teams(first: 250) { nodes { id key name icon color } }
    workflowStates(first: 250) { nodes { id name type color position team { id } } }
    users(first: 250) { nodes { id name displayName email avatarUrl initials active admin isMe } }
    issueLabels(first: 250) { nodes { id name color isGroup team { id } parent { id } } }
    projects(first: 250) {
      nodes {
        id name slugId icon color description url startDate targetDate progress
        status { id name type color }
        lead { id }
        teams { nodes { id } }
      }
    }
    cycles(first: 250) { nodes { id number name startsAt endsAt isActive progress team { id } } }
  }
`

type CatalogData = {
  viewer: { id: string }
  organization: Catalog['organization']
  teams: Page<Catalog['teams'][number]>
  workflowStates: Page<Omit<Catalog['states'][number], 'teamId'> & { team: Ref }>
  users: Page<Catalog['users'][number]>
  issueLabels: Page<Omit<Catalog['labels'][number], 'teamId' | 'parentId'> & { team: Ref; parent: Ref }>
  projects: Page<Omit<Catalog['projects'][number], 'leadId' | 'teamIds'> & { lead: Ref; teams: { nodes: { id: string }[] } }>
  cycles: Page<Omit<Catalog['cycles'][number], 'teamId'> & { team: Ref }>
}

async function fetchCatalog(): Promise<Catalog> {
  const data = await gql<CatalogData>(catalogQuery)
  const users = data.users.nodes
  return {
    viewer: users.find((u) => u.id === data.viewer.id)!,
    organization: data.organization,
    teams: data.teams.nodes,
    states: data.workflowStates.nodes.map(({ team, ...s }) => ({ ...s, teamId: id(team)! })),
    users,
    labels: data.issueLabels.nodes.map(({ team, parent, ...l }) => ({ ...l, teamId: id(team), parentId: id(parent) })),
    projects: data.projects.nodes.map(({ lead, teams, ...p }) => ({ ...p, leadId: id(lead), teamIds: teams.nodes.map((t) => t.id) })),
    cycles: data.cycles.nodes.map(({ team, ...c }) => ({ ...c, teamId: id(team)! })),
  }
}

export function useCatalog() {
  return useQuery({ queryKey: ['catalog'], queryFn: fetchCatalog, staleTime: 30_000 })
}

// useCatalogMaps indexes the catalog by id for rendering lookups.
export function useCatalogMaps() {
  const { data } = useCatalog()
  return useMemo(() => {
    const byId = <T extends { id: string }>(items: T[] = []) => new Map(items.map((item) => [item.id, item]))
    return {
      catalog: data,
      teams: byId(data?.teams),
      states: byId(data?.states),
      users: byId(data?.users),
      labels: byId(data?.labels),
      projects: byId(data?.projects),
      cycles: byId(data?.cycles),
    }
  }, [data])
}

const issueFields = /* GraphQL */ `
  id identifier number title priority estimate sortOrder dueDate createdAt updatedAt
  startedAt completedAt canceledAt labelIds url
  team { id } state { id } assignee { id } creator { id } project { id } cycle { id } parent { id }
`

type IssueNode = Omit<Issue, 'teamId' | 'stateId' | 'assigneeId' | 'creatorId' | 'projectId' | 'cycleId' | 'parentId'> & {
  team: Ref
  state: Ref
  assignee: Ref
  creator: Ref
  project: Ref
  cycle: Ref
  parent: Ref
}

function toIssue({ team, state, assignee, creator, project, cycle, parent, ...issue }: IssueNode): Issue {
  return {
    ...issue,
    teamId: id(team)!,
    stateId: id(state)!,
    assigneeId: id(assignee),
    creatorId: id(creator),
    projectId: id(project),
    cycleId: id(cycle),
    parentId: id(parent),
  }
}

const issuesQuery = /* GraphQL */ `
  query Issues($after: String) {
    issues(first: 250, after: $after) {
      nodes { ${issueFields} }
      pageInfo { hasNextPage endCursor }
    }
  }
`

// Like Linear's sync engine, the client holds every live issue and derives
// views locally; polling picks up changes made by agents and teammates.
async function fetchIssues(): Promise<Issue[]> {
  const issues: Issue[] = []
  let after: string | null = null
  do {
    const data: { issues: Page<IssueNode> } = await gql(issuesQuery, { after })
    issues.push(...data.issues.nodes.map(toIssue))
    after = data.issues.pageInfo.hasNextPage ? data.issues.pageInfo.endCursor : null
  } while (after)
  return issues
}

const issuesListQuery = queryOptions({ queryKey: ['issues'], queryFn: fetchIssues, refetchInterval: 20_000 })

export function useIssues() {
  return useQuery(issuesListQuery)
}

export type SubIssueProgress = { done: number; total: number }

const progressByList = new WeakMap<Issue[], { catalog?: Catalog; counts: Map<string, SubIssueProgress> }>()

// useSubIssueProgress counts a parent's finished and total sub-issues. Counts
// are built once per issue list and catalog, and a row re-renders only when
// its own count changes.
export function useSubIssueProgress(issueId: string): SubIssueProgress | undefined {
  const { catalog, states } = useCatalogMaps()
  const { data } = useQuery({
    ...issuesListQuery,
    select: (issues: Issue[]) => {
      let cached = progressByList.get(issues)
      if (!cached || cached.catalog !== catalog) {
        const counts = new Map<string, SubIssueProgress>()
        for (const issue of issues) {
          if (!issue.parentId) {
            continue
          }
          const progress = counts.get(issue.parentId) ?? { done: 0, total: 0 }
          const type = states.get(issue.stateId)?.type
          progress.total++
          if (type === 'completed' || type === 'canceled') {
            progress.done++
          }
          counts.set(issue.parentId, progress)
        }
        cached = { catalog, counts }
        progressByList.set(issues, cached)
      }
      return cached.counts.get(issueId)
    },
  })
  return data
}

const issueDetailQuery = /* GraphQL */ `
  query Issue($id: String!) {
    issue(id: $id) {
      ${issueFields}
      description
      comments(first: 250) { nodes { id body createdAt editedAt user { id } } }
      history(first: 250) {
        nodes {
          id createdAt actorId fromStateId toStateId fromAssigneeId toAssigneeId fromPriority toPriority
          fromTitle toTitle fromProjectId toProjectId fromCycleId toCycleId fromEstimate toEstimate
          fromDueDate toDueDate fromParentId toParentId fromTeamId toTeamId addedLabelIds removedLabelIds
          updatedDescription archived
        }
      }
    }
  }
`

type IssueDetailNode = IssueNode & {
  description: string | null
  comments: { nodes: (Omit<Comment, 'userId'> & { user: Ref })[] }
  history: { nodes: HistoryEntry[] }
}

export function useIssueDetail(identifier: string) {
  return useQuery({
    queryKey: ['issue', identifier],
    queryFn: async (): Promise<IssueDetail> => {
      const { issue } = await gql<{ issue: IssueDetailNode }>(issueDetailQuery, { id: identifier })
      const { description, comments, history, ...node } = issue
      return {
        ...toIssue(node),
        description,
        comments: comments.nodes.map(({ user, ...c }) => ({ ...c, userId: id(user) })),
        history: history.nodes,
      }
    },
  })
}

const updateIssueMutation = /* GraphQL */ `
  mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) { issue { ${issueFields} } }
  }
`

// applyPatch mirrors the server's state lifecycle so optimistic rows match.
function applyPatch(issue: Issue, patch: IssuePatch): Issue {
  return { ...issue, ...patch, updatedAt: new Date().toISOString() } as Issue
}

function patchCaches(client: QueryClient, issueId: string, update: (issue: Issue) => Issue) {
  client.setQueryData<Issue[]>(['issues'], (issues) => issues?.map((i) => (i.id === issueId ? update(i) : i)))
  client.setQueriesData<IssueDetail>({ queryKey: ['issue'] }, (detail) =>
    detail?.id === issueId ? { ...detail, ...update(detail) } : detail,
  )
}

// useIssuePatch applies a partial change to one issue, optimistically.
export function useIssuePatch(issue: Issue) {
  const update = useUpdateIssue()
  return (patch: IssuePatch) => update.mutate({ id: issue.id, patch })
}

export function useUpdateIssue() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: IssuePatch }) =>
      gql<{ issueUpdate: { issue: IssueNode } }>(updateIssueMutation, { id, input: patch }),
    onMutate: async ({ id, patch }) => {
      await client.cancelQueries({ queryKey: ['issues'] })
      const previous = client.getQueryData<Issue[]>(['issues'])
      patchCaches(client, id, (issue) => applyPatch(issue, patch))
      return { previous }
    },
    onError: (_error, _vars, context) => {
      client.setQueryData(['issues'], context?.previous)
      client.invalidateQueries({ queryKey: ['issue'] })
    },
    onSuccess: ({ issueUpdate }) => {
      const saved = toIssue(issueUpdate.issue)
      patchCaches(client, saved.id, () => saved)
      client.invalidateQueries({ queryKey: ['issue', saved.identifier] })
      client.invalidateQueries({ queryKey: ['catalog'] })
    },
  })
}

const createIssueMutation = /* GraphQL */ `
  mutation CreateIssue($input: IssueCreateInput!) {
    issueCreate(input: $input) { issue { ${issueFields} } }
  }
`

export type IssueDraft = IssuePatch & { teamId: string; title: string }

export function useCreateIssue() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: IssueDraft) => {
      const data = await gql<{ issueCreate: { issue: IssueNode } }>(createIssueMutation, { input })
      return toIssue(data.issueCreate.issue)
    },
    onSuccess: (issue) => {
      client.setQueryData<Issue[]>(['issues'], (issues) => (issues ? [issue, ...issues] : [issue]))
      client.invalidateQueries({ queryKey: ['catalog'] })
    },
  })
}

export function useArchiveIssue() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => gql(`mutation ($id: String!) { issueArchive(id: $id) { success } }`, { id }),
    onMutate: (id) => {
      client.setQueryData<Issue[]>(['issues'], (issues) => issues?.filter((i) => i.id !== id))
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['issues'] }),
  })
}

export function useCreateComment(identifier: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: string) =>
      gql(`mutation ($input: CommentCreateInput!) { commentCreate(input: $input) { success } }`, {
        input: { issueId: identifier, body },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['issue', identifier] }),
  })
}

export function useDeleteComment(identifier: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => gql(`mutation ($id: String!) { commentDelete(id: $id) { success } }`, { id }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['issue', identifier] }),
  })
}

export function useCreateLabel() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; color: string; teamId?: string }) => {
      const data = await gql<{ issueLabelCreate: { issueLabel: { id: string } } }>(
        `mutation ($input: IssueLabelCreateInput!) { issueLabelCreate(input: $input) { issueLabel { id } } }`,
        { input },
      )
      return data.issueLabelCreate.issueLabel.id
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['catalog'] }),
  })
}

export type ProjectDraft = {
  name: string
  description?: string
  statusId: string
  leadId?: string | null
  teamIds: string[]
  targetDate?: string | null
  color: string
  icon: string
}

export function useCreateProject() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: ProjectDraft) => {
      const data = await gql<{ projectCreate: { project: { slugId: string } } }>(
        `mutation ($input: ProjectCreateInput!) { projectCreate(input: $input) { project { slugId } } }`,
        { input },
      )
      return data.projectCreate.project.slugId
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['catalog'] }),
  })
}
