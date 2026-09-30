import { CalendarCheck, CalendarChevronsRight, Users } from 'lucide-react'
import { useState } from 'react'
import { type ProjectDraft, useCatalog } from '@/lib/queries'
import { DatePicker } from './date-picker'
import { Avatar, TeamBadge } from './icons'
import { Picker } from './picker'
import { ProjectStatusIcon } from './project-status'
import { PropertyButton } from './properties'

type Properties = Pick<ProjectDraft, 'statusId' | 'teamIds' | 'leadId' | 'startDate' | 'targetDate'>

// ProjectProperties is the chip row that sets a project's status, lead, teams
// and dates, both on a new project and on an existing one.
export function ProjectProperties({ value, onChange }: { value: Properties; onChange: (patch: Partial<Properties>) => void }) {
  const { data: catalog } = useCatalog()
  const [open, setOpen] = useState<'status' | 'lead' | 'teams' | null>(null)
  const toggle = (name: 'status' | 'lead' | 'teams') => (next: boolean) => setOpen(next ? name : null)
  const statuses = catalog?.organization.projectStatuses ?? []
  const status = statuses.find((s) => s.id === value.statusId)
  const lead = catalog?.users.find((u) => u.id === value.leadId)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Picker
        open={open === 'status'}
        onOpenChange={toggle('status')}
        placeholder="Change status..."
        options={statuses.map((s) => ({ value: s.id, label: s.name, icon: <ProjectStatusIcon type={s.type} color={s.color} /> }))}
        selected={[value.statusId]}
        onSelect={(statusId) => onChange({ statusId })}
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
        selected={[value.leadId ?? '']}
        onSelect={(leadId) => onChange({ leadId: leadId || null })}
        trigger={<PropertyButton variant="chip" icon={<Avatar user={lead} size={16} />} label={lead?.name ?? 'Lead'} />}
      />
      <Picker
        open={open === 'teams'}
        onOpenChange={toggle('teams')}
        multiple
        placeholder="Add teams..."
        options={(catalog?.teams ?? []).map((t) => ({ value: t.id, label: t.name, icon: <TeamBadge icon={t.icon} color={t.color} className="size-4" /> }))}
        selected={value.teamIds}
        onSelect={(id) => onChange({ teamIds: value.teamIds.includes(id) ? value.teamIds.filter((t) => t !== id) : [...value.teamIds, id] })}
        trigger={
          <PropertyButton
            variant="chip"
            icon={<Users className="size-3.5 text-ink-3" />}
            label={value.teamIds.map((id) => catalog?.teams.find((t) => t.id === id)?.key).join(', ') || 'Teams'}
          />
        }
      />
      <DatePicker value={value.startDate} onChange={(startDate) => onChange({ startDate })} icon={CalendarChevronsRight} label="Start" title="Set start date" />
      <DatePicker value={value.targetDate} onChange={(targetDate) => onChange({ targetDate })} icon={CalendarCheck} label="Target" title="Set target date" />
    </div>
  )
}
