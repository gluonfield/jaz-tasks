import { Button } from '@jaz/ui/button'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useCatalog } from '@/lib/queries'
import { useDeleteView, useSaveView } from '@/lib/saved-views'
import type { SavedView } from '@/lib/types'
import { DisplaySelect } from './display-menu'
import { LabelDot } from './icons'
import { IssueDisplayOptions } from './issue-display'

export function SavedViewDialog({ open, onOpenChange, view }: { open: boolean; onOpenChange: (open: boolean) => void; view?: SavedView }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogTitle>{view ? 'Edit view' : 'Create view'}</DialogTitle>
        {open && <ViewForm view={view} close={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function ViewForm({ view, close }: { view?: SavedView; close: () => void }) {
  const { data: catalog } = useCatalog()
  const save = useSaveView()
  const remove = useDeleteView()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [changes, setChanges] = useState<Partial<Omit<SavedView, 'id'>>>({})
  const draft: Omit<SavedView, 'id'> = {
    name: '', teamId: catalog?.teams.length === 1 ? catalog.teams[0].id : null,
    layout: 'board', grouping: 'label', ordering: 'manual', completedFilter: '7d', dueDateFilter: 'any', showEmpty: false, labelIds: [],
    ...view,
    ...changes,
  }
  const change = (patch: Partial<Omit<SavedView, 'id'>>) => setChanges((current) => ({ ...current, ...patch }))
  const labels = (catalog?.labels ?? []).filter((label) => !label.isGroup && (!draft.teamId || !label.teamId || label.teamId === draft.teamId))
  const pending = save.isPending || remove.isPending
  return (
    <form onSubmit={async (event) => {
      event.preventDefault()
      const saved = await save.mutateAsync(view ? { id: view.id, patch: changes } : { input: draft }).catch(() => null)
      if (saved) {
        close()
        await navigate({ to: '/view/$viewId', params: { viewId: saved.id } })
      }
    }}>
      <label className="block text-[12.5px] text-ink-2">
        Name
        <input autoFocus required value={draft.name} onChange={(event) => change({ name: event.target.value })} className="mt-1.5 h-9 w-full rounded-[var(--radius-control)] border border-border bg-bg px-2.5 text-[13px] text-ink outline-none focus-visible:border-primary" />
      </label>
      <DisplaySelect label="Team" value={draft.teamId ?? ''} options={[["", "All teams"], ...(catalog?.teams ?? []).map((team): [string, string] => [team.id, team.name])]} onChange={(teamId) => change({ teamId: teamId || null, labelIds: draft.labelIds.filter((id) => catalog?.labels.some((label) => label.id === id && (!teamId || !label.teamId || label.teamId === teamId))) })} />
      {!!labels.length && (
        <fieldset className="mt-4">
          <legend className="mb-1.5 text-[12.5px] text-ink-2">Labels (any)</legend>
          <div className="grid max-h-32 grid-cols-2 gap-x-3 overflow-y-auto">
            {labels.map((label) => (
              <label key={label.id} className="flex min-w-0 items-center gap-2 py-1 text-[12.5px] text-ink-2">
                <input type="checkbox" checked={draft.labelIds.includes(label.id)} onChange={(event) => change({ labelIds: event.target.checked ? [...draft.labelIds, label.id] : draft.labelIds.filter((id) => id !== label.id) })} className="accent-[var(--color-primary)]" />
                <LabelDot color={label.color} /><span className="truncate">{label.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="mt-4 border-t border-border pt-1">
        <DisplaySelect label="Layout" value={draft.layout} options={[["list", "List"], ["board", "Board"]]} onChange={(layout) => change({ layout })} />
        <IssueDisplayOptions value={draft} onChange={change} />
      </div>
      <div className="mt-5 flex items-center gap-2">
        {view && <Button disabled={pending} onClick={() => {
          if (!confirmDelete) {
            setConfirmDelete(true)
            return
          }
          remove.mutate(view.id, { onSuccess: () => {
            close()
            void navigate({ to: '/views' })
          } })
        }}>{confirmDelete ? 'Confirm delete' : 'Delete view'}</Button>}
        <Button className="ml-auto" onClick={close}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={pending || !draft.name.trim()}>{view ? 'Save view' : 'Create view'}</Button>
      </div>
    </form>
  )
}
