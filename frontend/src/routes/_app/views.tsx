import { Link, createFileRoute } from '@tanstack/react-router'
import { Button } from '@jaz/ui/button'
import { Layers } from 'lucide-react'
import { useState } from 'react'
import { ViewHeader } from '@/components/issue-view'
import { SavedViewDialog } from '@/components/saved-view-dialog'
import { useCatalogMaps, useIssues } from '@/lib/queries'
import { useSavedViews } from '@/lib/saved-views'
import { savedViewDefinition, views } from '@/lib/views'
import { useNow } from '@/lib/use-now'

export const Route = createFileRoute('/_app/views')({ component: Views })

function Views() {
  const [creating, setCreating] = useState(false)
  const { data: saved = [], error, refetch } = useSavedViews()
  const { states, catalog } = useCatalogMaps()
  const { data: issues = [] } = useIssues()
  const now = useNow()
  return (
    <div className="flex h-full flex-col">
      <ViewHeader
        title={
          <>
            <Layers className="size-4 text-ink-2" /> Views
          </>
        }
      >
        <Button onClick={() => setCreating(true)}>Create view</Button>
      </ViewHeader>
      <SavedViewDialog open={creating} onOpenChange={setCreating} />
      <div className="scrollbar-quiet flex-1 overflow-y-auto pb-[var(--safe-area-bottom)]">
        {error && <div className="flex items-center gap-3 px-5 py-3 text-[13px] text-ink-2">Couldn’t load saved views.<Button onClick={() => void refetch()}>Retry</Button></div>}
        {[...saved.map(savedViewDefinition), ...views].map((view) => {
          const count = issues.filter((i) => view.match(i, { states, viewerId: catalog?.viewer.id, now })).length
          return (
            <Link
              key={view.id}
              to="/view/$viewId"
              params={{ viewId: view.id }}
              className="flex h-14 items-center gap-3 border-b border-border/60 px-5 outline-none transition-colors hover:bg-list-hover"
            >
              <span className="flex size-7 items-center justify-center rounded-[7px] border border-border bg-raised text-ink-2">
                <Layers className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-ink">{view.name}</span>
                <span className="block truncate text-[12px] text-ink-3">{view.description}</span>
              </span>
              <span className="text-[12px] tabular-nums text-ink-3">{count} issues</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
