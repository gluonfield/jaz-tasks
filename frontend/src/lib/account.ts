import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { rest } from './api'

export type APIKey = { id: string; label: string; hint: string; createdAt: string }
export type Grant = { id: string; clientName: string; createdAt: string; lastUsedAt: string }
export type Workspace = { id: string; name: string; urlKey: string; current: boolean }
export type Invite = { id: string; email: string; createdAt: string }

export function useAPIKeys() {
  return useQuery({ queryKey: ['api-keys'], queryFn: () => rest<APIKey[]>('GET', '/auth/api-keys') })
}

export function useCreateAPIKey() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (label: string) => rest<{ key: string; apiKey: APIKey }>('POST', '/auth/api-keys', { label }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['api-keys'] }),
  })
}

export function useDeleteAPIKey() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => rest('DELETE', `/auth/api-keys/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['api-keys'] }),
  })
}

export function useGrants() {
  return useQuery({ queryKey: ['grants'], queryFn: () => rest<Grant[]>('GET', '/auth/grants') })
}

export function useRevokeGrant() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => rest('DELETE', `/auth/grants/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['grants'] }),
  })
}

export function useWorkspaces() {
  return useQuery({ queryKey: ['workspaces'], queryFn: () => rest<Workspace[]>('GET', '/auth/workspaces') })
}

// switchWorkspace points the session at another workspace and reloads, so no
// data from the previous workspace survives in memory.
export async function switchWorkspace(id: string) {
  await rest('POST', '/auth/workspace', { workspaceId: id })
  window.location.assign('/')
}

export function useInvites() {
  return useQuery({ queryKey: ['invites'], queryFn: () => rest<Invite[]>('GET', '/auth/invites') })
}

export function useInvite() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (email: string) => rest<Invite>('POST', '/auth/invites', { email }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['invites'] }),
  })
}

export function useCancelInvite() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => rest('DELETE', `/auth/invites/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['invites'] }),
  })
}
