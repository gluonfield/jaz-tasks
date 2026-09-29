import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { rest } from './api'

export type APIKey = { id: string; label: string; hint: string; createdAt: string }
export type Grant = { id: string; clientName: string; createdAt: string; lastUsedAt: string }

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
