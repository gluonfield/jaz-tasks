import { createFileRoute } from '@tanstack/react-router'
import { IssuePage } from '@/components/issue-page'

export const Route = createFileRoute('/_app/issue/$identifier')({ component: Issue })

function Issue() {
  return <IssuePage identifier={Route.useParams().identifier} />
}
