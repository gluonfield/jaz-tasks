import { Link, createFileRoute } from '@tanstack/react-router'
import { Layers } from 'lucide-react'
import { useCatalogMaps, useIssues } from '@/lib/queries'
import { views } from '@/lib/views'

export const Route = createFileRoute('/_app/views')({ component: Views })

function Views() {
  const { states, catalog } = useCatalogMaps()
  const { data: issues = [] } = useIssues()
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4 text-[13px] font-medium text-ink">
        <Layers className="size-4 text-ink-2" /> Views
      </header>
      <div className="scrollbar-quiet flex-1 overflow-y-auto">
        {views.map((view) => {
          const count = issues.filter((i) => view.match(i, { states, viewerId: catalog?.viewer.id })).length
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
