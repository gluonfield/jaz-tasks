import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { WorkspaceBadge } from '@/components/icons'
import { type ScopeView, ScopedIssues, scopeView } from '@/components/scoped-issues'
import { useCatalog } from '@/lib/queries'

export const Route = createFileRoute('/_app/issues')({
  validateSearch: (search): { view?: Exclude<ScopeView, 'all'> } => {
    const view = scopeView(search.view)
    return { view: view === 'all' ? undefined : view }
  },
  component: AllIssues,
})

function AllIssues() {
  const { data: catalog } = useCatalog()
  const navigate = useNavigate()
  const name = catalog?.organization.name ?? ''
  return (
    <ScopedIssues
      view={Route.useSearch().view ?? 'all'}
      onView={(next) => navigate({ to: '/issues', search: { view: next === 'all' ? undefined : next } })}
      title={
        <>
          <WorkspaceBadge name={name} />
          {name}
        </>
      }
    />
  )
}
