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
      {([['showCompleted', 'Show completed issues'], ['showEmpty', 'Show empty groups']] as const).map(([key, label]) => (
        <label key={key} className="mt-2.5 flex items-center justify-between text-[12.5px] text-ink-2">
          {label}
          <input type="checkbox" checked={value[key]} onChange={(event) => onChange({ [key]: event.target.checked })} className="accent-[var(--color-primary)]" />
        </label>
      ))}
    </>
  )
}
