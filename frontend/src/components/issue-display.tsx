import { LayoutGrid, List, type LucideIcon } from 'lucide-react'
import { host } from '@/lib/host'
import type { IssueDisplay } from '@/lib/types'
import { DisplayMenu, DisplaySelect } from './display-menu'

const layouts: [IssueDisplay['layout'], LucideIcon][] = [['list', List], ['board', LayoutGrid]]

export function IssueDisplayMenu({ value, onChange }: { value: IssueDisplay; onChange: (patch: Partial<IssueDisplay>) => void }) {
  return (
    <DisplayMenu layouts={layouts} layout={value.layout} setLayout={(layout) => onChange({ layout })}>
      <IssueDisplayOptions value={value} onChange={onChange} />
    </DisplayMenu>
  )
}

export function IssueDisplayOptions({ value, onChange }: { value: IssueDisplay; onChange: (patch: Partial<IssueDisplay>) => void }) {
  return (
    <>
      {!host.columns && <DisplaySelect label="Group by" value={value.grouping} options={[["state", "Status"], ["label", "Label"]]} onChange={(grouping) => onChange({ grouping })} />}
      <DisplaySelect label="Ordering" value={value.ordering} options={[["manual", "Manual"], ["priority", "Priority"], ["updated", "Last updated"], ["created", "Last created"]]} onChange={(ordering) => onChange({ ordering })} />
      <DisplaySelect label="Completed tasks" value={value.completedFilter} options={[["hidden", "Hidden"], ["week", "This week"], ["7d", "Last 7 days"], ["30d", "Last 30 days"], ["all", "All time"]]} onChange={(completedFilter) => onChange({ completedFilter })} />
      <DisplaySelect label="Due date" value={value.dueDateFilter} options={[["any", "All dates"], ["week", "This week"]]} onChange={(dueDateFilter) => onChange({ dueDateFilter })} />
      {(value.completedFilter === 'week' || value.dueDateFilter === 'week') && <p className="mt-1.5 text-[11.5px] text-ink-3">Monday–Sunday · Local time</p>}
      <label className="mt-2.5 flex items-center justify-between text-[12.5px] text-ink-2">
        Show empty groups
        <input type="checkbox" checked={value.showEmpty} onChange={(event) => onChange({ showEmpty: event.target.checked })} className="accent-[var(--color-primary)]" />
      </label>
    </>
  )
}
