import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import type { IssuePatch } from '@/lib/types'
import { openCreateIssue } from '@/lib/ui'
import { Kbd } from './kbd'

export function EmptyState({
  title,
  body,
  icon,
  createDefaults,
}: {
  title: string
  body: string
  icon?: ReactNode
  createDefaults?: IssuePatch & { teamId?: string }
}) {
  return (
    <div className="flex h-full animate-rise flex-col items-center justify-center gap-3 px-6 pb-16 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-raised text-ink-3 shadow-xs">
        {icon ?? (
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="12" cy="12" r="8.5" strokeDasharray="2.6 2.4" />
          </svg>
        )}
      </div>
      <div>
        <p className="text-[14px] font-medium text-ink">{title}</p>
        <p className="mt-1 max-w-72 text-[13px] text-ink-3">{body}</p>
      </div>
      {createDefaults && (
        <button
          onClick={() => openCreateIssue(createDefaults)}
          className="mt-1 flex h-7 items-center gap-1.5 rounded-full border border-border bg-raised px-3 text-[12.5px] font-medium text-ink shadow-xs outline-none transition-colors hover:bg-list-hover"
        >
          <Plus className="size-3.5" /> Create issue <Kbd className="ml-0.5">C</Kbd>
        </button>
      )}
    </div>
  )
}
