import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { IssueView } from '@/components/issue-view'
import { useCatalogMaps, useIssues } from '@/lib/queries'
import { views } from '@/lib/views'

export const Route = createFileRoute('/_app/view/$viewId')({ component: ViewIssues })

function ViewIssues() {
  const { viewId } = Route.useParams()
  const { states, catalog } = useCatalogMaps()
  const { data: issues, isLoading } = useIssues()
  const view = views.find((v) => v.id === viewId)
  const matched = useMemo(
    () => (view ? (issues ?? []).filter((i) => view.match(i, { states, viewerId: catalog?.viewer.id })) : []),
    [issues, view, states, catalog],
  )
  if (!view) {
    return <p className="p-8 text-[13px] text-ink-3">This view does not exist.</p>
  }
  return (
    <IssueView
      viewKey={`view:${view.id}`}
      loading={isLoading}
      issues={matched}
      title={
        <>
          <Link to="/views" className="text-ink-2 outline-none hover:text-ink">
            Views
          </Link>
          <ChevronRight className="size-3 text-ink-3" />
          {view.name}
        </>
      }
    />
  )
}
