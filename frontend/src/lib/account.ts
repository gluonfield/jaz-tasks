import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { rest } from './api'

export type APIKey = { id: string; label: string; hint: string; createdAt: string }
export type Grant = { id: string; clientName: string; createdAt: string; lastUsedAt: string }
export type Workspace = { id: string; name: string; urlKey: string; current: boolean }

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

export function useWorkspaces({ enabled = true } = {}) {
  return useQuery({ queryKey: ['workspaces'], queryFn: () => rest<Workspace[]>('GET', '/auth/workspaces'), enabled })
}

// switchWorkspace points the session at another workspace and reloads, so no
// data from the previous workspace survives in memory.
export async function switchWorkspace(id: string) {
  await rest('POST', '/auth/workspace', { workspaceId: id })
  window.location.assign('/')
}
