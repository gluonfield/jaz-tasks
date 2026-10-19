import { createFileRoute } from '@tanstack/react-router'
import { IssuePage } from '@/components/issue-page'

export const Route = createFileRoute('/_app/issue/$identifier')({
  validateSearch: (search): { edit?: 'title' | 'description' | 'comment' } => ({
    edit: search.edit === 'title' || search.edit === 'description' || search.edit === 'comment' ? search.edit : undefined,
  }),
  component: Issue,
})

function Issue() {
  return <IssuePage identifier={Route.useParams().identifier} />
}
