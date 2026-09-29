import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { gql, rest } from './api'

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

// useWorkspaces lists the viewer's workspaces; asking also joins any they
// were invited to.
export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => (await gql<{ workspaces: Workspace[] }>('{ workspaces { id name urlKey current } }')).workspaces,
  })
}

// useSwitchWorkspace moves this session, or Jaz's connection when embedded,
// to another workspace, then drops every cached query and starts from home so
// nothing from the previous workspace survives.
export function useSwitchWorkspace() {
  const client = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: (id: string) => gql('mutation ($id: String!) { workspaceSwitch(id: $id) { success } }', { id }),
    onSuccess: () => {
      void client.resetQueries()
      void navigate({ to: '/' })
    },
  })
}
