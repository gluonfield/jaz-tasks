import { useNavigate } from '@tanstack/react-router'
import { ChevronRight, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { workflowOrder } from '@/lib/issues'
import { type IssueDraft, useCatalog, useCreateIssue, useIssues, useUpdateIssue } from '@/lib/queries'
import { setUI, useUI } from '@/lib/ui'
import { cn } from '@/lib/utils'
import { TeamBadge } from './icons'
import { Kbd } from './kbd'
import { Picker } from './picker'
import {
  AssigneePicker,
  CyclePicker,
  DueDatePicker,
  EstimatePicker,
  LabelsPicker,
  ParentPicker,
  PriorityPicker,
  ProjectPicker,
  StatusPicker,
} from './properties'

type Draft = Required<Pick<IssueDraft, 'teamId' | 'title' | 'stateId' | 'priority' | 'labelIds'>> &
  Pick<IssueDraft, 'description' | 'assigneeId' | 'projectId' | 'cycleId' | 'estimate' | 'dueDate' | 'parentId'> & { childId?: string }

export function CreateIssueDialog() {
  const open = useUI((s) => s.createOpen)
  return (
    <Dialog open={open} onOpenChange={(next) => setUI({ createOpen: next })}>
      <DialogContent
        showCloseButton={false}
        className="top-[12%] w-[720px] max-w-[calc(100vw-2rem)] translate-y-0 gap-0 rounded-[12px] border-border bg-raised p-0 shadow-[var(--shadow-raised)] sm:max-w-[720px]"
      >
        {open && <CreateIssueForm />}
      </DialogContent>
    </Dialog>
  )
}

function CreateIssueForm() {
  const navigate = useNavigate()
  const defaults = useUI((s) => s.createDefaults)
  const { data: catalog } = useCatalog()
  const create = useCreateIssue()
  const update = useUpdateIssue()
  const { data: issues = [] } = useIssues()
  const [createMore, setCreateMore] = useState(false)
  const [teamOpen, setTeamOpen] = useState(false)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const teams = catalog?.teams ?? []
  const defaultState = (teamId: string) =>
    (catalog?.states ?? []).filter((s) => s.teamId === teamId).sort(workflowOrder).find((s) => s.type === 'unstarted')?.id ?? ''
  const initialTeam = defaults.teamId ?? teams.find((t) => t.key === 'ENG')?.id ?? teams[0]?.id ?? ''
  const [draft, setDraft] = useState<Draft>(() => ({
    title: '',
    priority: 0,
    labelIds: [],
    ...defaults,
    teamId: initialTeam,
    stateId: defaults.stateId ?? defaultState(initialTeam),
  }))
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const team = teams.find((t) => t.id === draft.teamId)
  const parent = issues.find((i) => i.id === draft.parentId)
  const child = issues.find((i) => i.id === draft.childId)

  useEffect(() => titleRef.current?.focus(), [])

  const submit = async () => {
    if (!draft.title.trim() || create.isPending) {
      return
    }
    try {
      const { childId, ...input } = draft
      const issue = await create.mutateAsync({ ...input, title: input.title.trim() })
      if (childId) {
        await update.mutateAsync({ id: childId, patch: { parentId: issue.id } })
        set({ childId: undefined })
      }
      toast(`${issue.identifier} created`, {
        description: issue.title,
        action: { label: 'View', onClick: () => navigate({ to: '/issue/$identifier', params: { identifier: issue.identifier } }) },
      })
      if (createMore) {
        set({ title: '', description: '' })
        titleRef.current?.focus()
      } else {
        setUI({ createOpen: false })
      }
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
      <div className="flex items-center gap-1.5 px-4 pt-3.5 text-[12.5px]">
        <Picker
          open={teamOpen}
          onOpenChange={setTeamOpen}
          placeholder="Move to team..."
          options={teams.map((t) => ({ value: t.id, label: t.name, icon: <TeamBadge icon={t.icon} color={t.color} className="size-4" /> }))}
          selected={[draft.teamId]}
          onSelect={(teamId) => set({ teamId, stateId: defaultState(teamId), labelIds: [], cycleId: null })}
          trigger={
            <button type="button" className="flex h-6 items-center gap-1.5 rounded-[5px] border border-border px-1.5 font-medium text-ink outline-none hover:bg-list-hover">
              {team && <TeamBadge icon={team.icon} color={team.color} className="size-4" />}
              {team?.key}
            </button>
          }
        />
        <ChevronRight className="size-3 text-ink-3" />
        {parent && (
          <>
            <span className="text-ink-2 tabular-nums">{parent.identifier}</span>
            <ChevronRight className="size-3 text-ink-3" />
          </>
        )}
        <DialogTitle className="text-[12.5px] font-normal text-ink-2">
          {parent ? 'New sub-issue' : child ? `New parent of ${child.identifier}` : 'New issue'}
        </DialogTitle>
        <button
          type="button"
          aria-label="Close"
          onClick={() => setUI({ createOpen: false })}
          className="ml-auto flex size-6 items-center justify-center rounded-[5px] text-ink-3 outline-none hover:bg-list-hover hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="px-4 pt-3">
        <textarea
          ref={titleRef}
          rows={1}
          value={draft.title}
          onChange={(e) => set({ title: e.target.value.replace(/\n/g, ' ') })}
          placeholder="Issue title"
          className="field-sizing-content w-full resize-none bg-transparent text-[18px] font-semibold leading-snug text-ink outline-none placeholder:text-ink-3"
        />
        <textarea
          value={draft.description ?? ''}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="Add description..."
          className="field-sizing-content mt-1.5 min-h-20 w-full resize-none bg-transparent text-[14px] leading-relaxed text-ink outline-none placeholder:text-ink-3"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3.5 pt-1">
        <StatusPicker variant="chip" value={draft.stateId} onChange={(stateId) => set({ stateId })} teamId={draft.teamId} />
        <PriorityPicker variant="chip" value={draft.priority} onChange={(priority) => set({ priority })} teamId={draft.teamId} />
        <AssigneePicker variant="chip" value={draft.assigneeId ?? null} onChange={(assigneeId) => set({ assigneeId })} teamId={draft.teamId} />
        <LabelsPicker variant="chip" value={draft.labelIds} onChange={(labelIds) => set({ labelIds })} teamId={draft.teamId} />
        <ProjectPicker variant="chip" value={draft.projectId ?? null} onChange={(projectId) => set({ projectId })} teamId={draft.teamId} />
        <CyclePicker variant="chip" value={draft.cycleId ?? null} onChange={(cycleId) => set({ cycleId })} teamId={draft.teamId} />
        <EstimatePicker variant="chip" value={draft.estimate ?? null} onChange={(estimate) => set({ estimate })} teamId={draft.teamId} />
        <DueDatePicker variant="chip" value={draft.dueDate ?? null} onChange={(dueDate) => set({ dueDate })} teamId={draft.teamId} />
        {parent && <ParentPicker variant="chip" value={parent.id} onChange={(parentId) => set({ parentId })} teamId={draft.teamId} />}
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-border px-4 py-2.5">
        <label className="flex cursor-default items-center gap-2 text-[12.5px] text-ink-2 select-none">
          <button
            type="button"
            role="switch"
            aria-checked={createMore}
            onClick={() => setCreateMore(!createMore)}
            className={cn(
              'relative h-4 w-7 rounded-full transition-colors duration-150',
              createMore ? 'bg-primary' : 'bg-[color-mix(in_oklab,var(--color-ink)_18%,transparent)]',
            )}
          >
            <span className={cn('absolute left-0.5 top-0.5 size-3 rounded-full bg-bg shadow-sm transition-transform duration-150', createMore && 'translate-x-3')} />
          </button>
          Create more
        </label>
        <button
          type="submit"
          disabled={!draft.title.trim() || create.isPending}
          className="flex h-8 items-center gap-2 rounded-full bg-primary px-3.5 text-[13px] font-medium text-on-primary shadow-xs outline-none transition-[background-color,opacity] hover:bg-primary-strong disabled:opacity-50"
        >
          Create issue
          <span className="flex items-center gap-0.5 opacity-70">
            <Kbd className="ml-0 border-on-primary/25 bg-on-primary/15 text-on-primary">⌘</Kbd>
            <Kbd className="ml-0 border-on-primary/25 bg-on-primary/15 text-on-primary">↵</Kbd>
          </span>
        </button>
      </div>
    </form>
  )
}
