import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { gql } from './api'
import type { SavedView } from './types'

const fields = 'id name teamId labelIds layout grouping ordering showCompleted showEmpty'

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
    mutationFn: async ({ id, ...input }: Omit<SavedView, 'id'> & { id?: string }) => {
      const data = id
        ? await gql<{ savedViewUpdate: SavedView }>(`mutation ($id: String!, $input: SavedViewInput!) { savedViewUpdate(id: $id, input: $input) { ${fields} } }`, { id, input })
        : await gql<{ savedViewCreate: SavedView }>(`mutation ($input: SavedViewInput!) { savedViewCreate(input: $input) { ${fields} } }`, { input })
      return 'savedViewCreate' in data ? data.savedViewCreate : data.savedViewUpdate
    },
    onMutate: async (view) => {
      await client.cancelQueries({ queryKey: ['saved-views'] })
      const previous = client.getQueryData<SavedView[]>(['saved-views'])
      if (view.id) {
        client.setQueryData<SavedView[]>(['saved-views'], (views) => views?.map((existing) => existing.id === view.id ? { ...existing, ...view } : existing))
      }
      return { previous }
    },
    onError: (error, _view, context) => {
      client.setQueryData(['saved-views'], context?.previous)
      toast.error(error.message)
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['saved-views'] }),
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
