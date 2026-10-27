import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { gql } from './api'
import type { SavedView } from './types'

const fields = 'id name teamId labelIds layout grouping ordering showCompleted showEmpty'
type ViewInput = Omit<SavedView, 'id'>
type ViewWrite = { input: ViewInput } | { id: string; patch: Partial<ViewInput> }

export function useSavedViews() {
  return useQuery({
    queryKey: ['saved-views'],
    queryFn: async () => (await gql<{ savedViews: SavedView[] }>(`query { savedViews { ${fields} } }`)).savedViews,
    refetchInterval: 20_000,
  })
}

export function useSaveView() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['saved-views'],
    mutationFn: async (write: ViewWrite) => {
      const data = 'id' in write
        ? await gql<{ savedViewUpdate: SavedView }>(`mutation ($id: String!, $input: SavedViewUpdateInput!) { savedViewUpdate(id: $id, input: $input) { ${fields} } }`, { id: write.id, input: write.patch })
        : await gql<{ savedViewCreate: SavedView }>(`mutation ($input: SavedViewInput!) { savedViewCreate(input: $input) { ${fields} } }`, write)
      return 'savedViewCreate' in data ? data.savedViewCreate : data.savedViewUpdate
    },
    onMutate: async (write) => {
      await client.cancelQueries({ queryKey: ['saved-views'] })
      if ('id' in write) {
        client.setQueryData<SavedView[]>(['saved-views'], (views) => views?.map((existing) => existing.id === write.id ? { ...existing, ...write.patch } : existing))
      }
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => {
      if (client.isMutating({ mutationKey: ['saved-views'] }) === 1) {
        return client.invalidateQueries({ queryKey: ['saved-views'] })
      }
    },
  })
}

export function useDeleteView() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => gql('mutation ($id: String!) { savedViewDelete(id: $id) { success } }', { id }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['saved-views'] }),
    onError: (error) => toast.error(error.message),
  })
}
