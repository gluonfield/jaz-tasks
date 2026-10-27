import { Link, createFileRoute } from '@tanstack/react-router'
import { Button } from '@jaz/ui/button'
import { ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { IssueView } from '@/components/issue-view'
import { SavedViewDialog } from '@/components/saved-view-dialog'
import { useCatalogMaps, useIssues } from '@/lib/queries'
import { savedViewDefinition, views } from '@/lib/views'
import { useSavedViews, useSaveView } from '@/lib/saved-views'

export const Route = createFileRoute('/_app/view/$viewId')({ component: ViewIssues })

function ViewIssues() {
  const [editing, setEditing] = useState(false)
  const { data: saved, isLoading: loadingViews, error, refetch } = useSavedViews()
  const save = useSaveView()
  const { viewId } = Route.useParams()
  const { states, catalog } = useCatalogMaps()
  const { data: issues, isLoading } = useIssues()
  const custom = saved?.find((view) => view.id === viewId)
  const view = useMemo(() => custom ? savedViewDefinition(custom) : views.find((view) => view.id === viewId), [custom, viewId])
  const matched = useMemo(
    () => (issues ?? []).filter((issue) => view?.match(issue, { states, viewerId: catalog?.viewer.id })),
    [issues, view, states, catalog],
  )
  if (!view && loadingViews) {
    return null
  }
  if (!view && error) {
    return <div className="flex items-center gap-3 p-8 text-[13px] text-ink-2">Couldn’t load this view.<Button onClick={() => void refetch()}>Retry</Button></div>
  }
  if (!view) {
    return <p className="p-8 text-[13px] text-ink-3">This view does not exist.</p>
  }
  return (
    <>
      <SavedViewDialog open={editing} onOpenChange={setEditing} view={custom} />
      <IssueView
        viewKey={`view:${viewId}`}
        settings={custom ? { value: custom, onChange: (patch) => save.mutate({ id: custom.id, patch }) } : undefined}
        actions={custom && <Button onClick={() => setEditing(true)}>Edit view</Button>}
        labelIds={custom?.labelIds}
        createDefaults={custom?.teamId ? { teamId: custom.teamId } : undefined}
        teamStates={custom ? catalog?.states.filter((state) => !custom.teamId || state.teamId === custom.teamId) : undefined}
        loading={isLoading}
        issues={matched}
        title={
          <>
            <Link to="/views" className="text-ink-2 outline-none hover:text-ink max-md:hidden">
              Views
            </Link>
            <ChevronRight className="size-3 text-ink-3 max-md:hidden" />
            {view.name}
          </>
        }
      />
    </>
  )
}
