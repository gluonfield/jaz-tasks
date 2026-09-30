import { useNavigate } from '@tanstack/react-router'
import { CalendarDays, Plus, Users, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { entityColors, formatDay } from '@/lib/issues'
import { type ProjectDraft, useCatalog, useCreateProject } from '@/lib/queries'
import { Avatar, TeamBadge } from './icons'
import { Kbd } from './kbd'
import { Picker } from './picker'
import { ProjectStatusIcon } from './project-status'
import { PropertyButton } from './properties'

export function CreateProjectButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-7 items-center gap-1.5 rounded-[var(--radius-control)] border border-border bg-raised px-2.5 text-[12.5px] font-medium text-ink shadow-xs outline-none transition-colors hover:bg-list-hover"
      >
        <Plus className="size-3.5" /> New project
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="top-[14%] w-[640px] max-w-[calc(100vw-2rem)] translate-y-0 gap-0 rounded-[12px] border-border bg-raised p-0 shadow-[var(--shadow-raised)] sm:max-w-[640px]"
        >
          {open && <ProjectForm close={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

type Open = 'status' | 'lead' | 'teams' | null

function ProjectForm({ close }: { close: () => void }) {
  const navigate = useNavigate()
  const { data: catalog } = useCatalog()
  const create = useCreateProject()
  const [open, setOpen] = useState<Open>(null)
  const [draft, setDraft] = useState<ProjectDraft>(() => ({
    name: '',
    statusId: 'planned',
    leadId: catalog?.viewer.id,
    teamIds: catalog?.teams.slice(0, 1).map((t) => t.id) ?? [],
    color: entityColors[Math.floor(Math.random() * entityColors.length)],
    icon: 'Layers',
  }))
  const set = (patch: Partial<ProjectDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const statuses = catalog?.organization.projectStatuses ?? []
  const status = statuses.find((s) => s.id === draft.statusId)
  const lead = catalog?.users.find((u) => u.id === draft.leadId)
  const toggle = (name: Exclude<Open, null>) => (next: boolean) => setOpen(next ? name : null)

  const submit = async () => {
    if (!draft.name.trim() || !draft.teamIds.length) {
      return
    }
    try {
      const slugId = await create.mutateAsync({ ...draft, name: draft.name.trim() })
      toast(`${draft.name.trim()} created`)
      close()
      navigate({ to: '/project/$slugId', params: { slugId } })
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          submit()
        }
      }}
    >
      <div className="flex items-center px-4 pt-3.5 text-[12.5px] text-ink-2">
        <DialogTitle className="text-[12.5px] font-normal">New project</DialogTitle>
        <button type="button" aria-label="Close" onClick={close} className="ml-auto flex size-6 items-center justify-center rounded-[5px] text-ink-3 outline-none hover:bg-list-hover hover:text-ink">
          <X className="size-4" />
        </button>
      </div>
      <div className="px-4 pt-3">
        <input
          autoFocus
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Project name"
          className="w-full bg-transparent text-[18px] font-semibold text-ink outline-none placeholder:text-ink-3"
        />
        <textarea
          value={draft.description ?? ''}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="Add a short summary..."
          className="field-sizing-content mt-2 min-h-12 w-full resize-none bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3.5 pt-1">
        <Picker
          open={open === 'status'}
          onOpenChange={toggle('status')}
          placeholder="Change status..."
          options={statuses.map((s) => ({ value: s.id, label: s.name, icon: <ProjectStatusIcon type={s.type} color={s.color} /> }))}
          selected={[draft.statusId]}
          onSelect={(statusId) => set({ statusId })}
          trigger={<PropertyButton variant="chip" icon={status && <ProjectStatusIcon type={status.type} color={status.color} />} label={status?.name} />}
        />
        <Picker
          open={open === 'lead'}
          onOpenChange={toggle('lead')}
          placeholder="Set lead..."
          options={[
            { value: '', label: 'No lead', icon: <Avatar user={null} size={16} /> },
            ...(catalog?.users ?? []).map((u) => ({ value: u.id, label: u.name, icon: <Avatar user={u} size={16} /> })),
          ]}
          selected={[draft.leadId ?? '']}
          onSelect={(leadId) => set({ leadId: leadId || null })}
          trigger={<PropertyButton variant="chip" icon={<Avatar user={lead} size={16} />} label={lead?.name ?? 'Lead'} />}
        />
        <Picker
          open={open === 'teams'}
          onOpenChange={toggle('teams')}
          multiple
          placeholder="Add teams..."
          options={(catalog?.teams ?? []).map((t) => ({ value: t.id, label: t.name, icon: <TeamBadge icon={t.icon} color={t.color} className="size-4" /> }))}
          selected={draft.teamIds}
          onSelect={(id) => set({ teamIds: draft.teamIds.includes(id) ? draft.teamIds.filter((t) => t !== id) : [...draft.teamIds, id] })}
          trigger={
            <PropertyButton
              variant="chip"
              icon={<Users className="size-3.5 text-ink-3" />}
              label={draft.teamIds.map((id) => catalog?.teams.find((t) => t.id === id)?.key).join(', ') || 'Teams'}
            />
          }
        />
        <label className="relative inline-flex h-6 items-center gap-1.5 rounded-[var(--radius-control)] border border-border px-2 text-[12px] text-ink-2 hover:bg-list-hover">
          <CalendarDays className="size-3.5 text-ink-3" />
          {draft.targetDate ? formatDay(draft.targetDate) : 'Target date'}
          <input type="date" value={draft.targetDate ?? ''} onChange={(e) => set({ targetDate: e.target.value || null })} className="absolute inset-0 opacity-0" />
        </label>
      </div>
      <div className="flex items-center justify-end border-t border-border px-4 py-2.5">
        <button
          type="submit"
          disabled={!draft.name.trim() || !draft.teamIds.length || create.isPending}
          className="flex h-8 items-center gap-2 rounded-[var(--radius-control)] bg-primary px-3 text-[13px] font-medium text-on-primary shadow-xs outline-none transition-[background-color,opacity] hover:bg-primary-strong disabled:opacity-50"
        >
          Create project
          <span className="flex items-center gap-0.5 opacity-70">
            <Kbd className="ml-0 border-on-primary/25 bg-on-primary/15 text-on-primary">⌘</Kbd>
            <Kbd className="ml-0 border-on-primary/25 bg-on-primary/15 text-on-primary">↵</Kbd>
          </span>
        </button>
      </div>
    </form>
  )
}
