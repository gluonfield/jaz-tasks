import { Button } from '@jaz/ui/button'
import { useNavigate } from '@tanstack/react-router'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { entityColors } from '@/lib/issues'
import { type ProjectDraft, useCatalog, useCreateProject } from '@/lib/queries'
import { Kbd } from './kbd'
import { ProjectProperties } from './project-properties'

export function CreateProjectButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
      >
        <Plus className="size-3.5" /> New project
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="top-[10%] w-[760px] max-w-[calc(100vw-2rem)] translate-y-0 gap-0 rounded-[12px] border-border bg-raised p-0 shadow-[var(--shadow-raised)] sm:max-w-[760px]"
        >
          {open && <ProjectForm close={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function ProjectForm({ close }: { close: () => void }) {
  const navigate = useNavigate()
  const { data: catalog } = useCatalog()
  const create = useCreateProject()
  const [draft, setDraft] = useState<ProjectDraft>(() => ({
    name: '',
    statusId: 'planned',
    leadId: catalog?.viewer.id,
    teamIds: catalog?.teams.slice(0, 1).map((t) => t.id) ?? [],
    color: entityColors[Math.floor(Math.random() * entityColors.length)],
    icon: 'Layers',
  }))
  const set = (patch: Partial<ProjectDraft>) => setDraft((d) => ({ ...d, ...patch }))

  const submit = async () => {
    if (!draft.name.trim() || !draft.teamIds.length) {
      return
    }
    try {
      const slugId = await create.mutateAsync({ ...draft, name: draft.name.trim(), content: draft.content?.trim() ? draft.content : undefined })
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
        <Button aria-label="Close" onClick={close} variant="ghost" size="icon-sm" className="ml-auto">
          <X className="size-4" />
        </Button>
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
      <div className="px-4 pb-3.5 pt-1">
        <ProjectProperties value={draft} onChange={set} />
      </div>
      <div className="mx-4 border-t border-border" />
      <textarea
        value={draft.content ?? ''}
        onChange={(e) => set({ content: e.target.value })}
        placeholder="Write a description, a project brief, or collect ideas..."
        className="field-sizing-content block max-h-[45vh] min-h-40 w-full resize-none overflow-y-auto bg-transparent px-4 py-3.5 text-[14px] leading-[1.6] text-ink outline-none placeholder:text-ink-3"
      />
      <div className="flex items-center justify-end border-t border-border px-4 py-2.5">
        <Button
          type="submit"
          disabled={!draft.name.trim() || !draft.teamIds.length || create.isPending}
          variant="primary" size="lg"
        >
          Create project
          <span className="flex items-center gap-0.5 opacity-70">
            <Kbd className="ml-0 border-on-primary/25 bg-on-primary/15 text-on-primary">⌘</Kbd>
            <Kbd className="ml-0 border-on-primary/25 bg-on-primary/15 text-on-primary">↵</Kbd>
          </span>
        </Button>
      </div>
    </form>
  )
}
