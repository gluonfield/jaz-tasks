import { useNavigate } from '@tanstack/react-router'
import { Command } from 'cmdk'
import { CircleDot, Command as CommandIcon } from 'lucide-react'
import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useCatalogMaps, useIssues } from '@/lib/queries'
import { isMac, matchesKey, shortcutIds, shortcutLabel, shortcuts } from '@/lib/shortcut-definitions'
import { useAvailableShortcuts } from '@/lib/shortcuts'
import { setSchemePreference } from '@/lib/theme'
import { setUI, useUI } from '@/lib/ui'
import { Kbd } from './kbd'

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen)
  return (
    <Dialog open={open} onOpenChange={(paletteOpen) => setUI({ paletteOpen })}>
      <DialogContent showCloseButton={false} onCloseAutoFocus={(event) => event.preventDefault()}
        className="top-[14%] w-[640px] max-w-[calc(100vw-2rem)] translate-y-0 gap-0 overflow-hidden rounded-[var(--radius-card)] bg-raised p-0 md:max-w-[640px]">
        <DialogTitle className="sr-only">Command menu</DialogTitle>
        {open && <Palette />}
      </DialogContent>
    </Dialog>
  )
}

function Palette() {
  const navigate = useNavigate()
  const { catalog } = useCatalogMaps()
  const { data: issues = [] } = useIssues()
  const actions = useAvailableShortcuts()
  const focusedId = useUI((s) => s.focusedIssueId)
  const focused = issues.find((issue) => issue.id === focusedId)
  const page = useUI((s) => s.palettePage)
  const [search, setSearch] = useState('')
  const run = (action: () => void) => {
    setUI({ paletteOpen: false })
    action()
  }
  const go = (to: string) => run(() => { void navigate({ to }) })
  return (
    <Command loop onKeyDown={(event) => {
      if (matchesKey(event.nativeEvent, shortcuts.palette.keys[0], isMac())) {
        event.preventDefault()
        setUI({ paletteOpen: false })
      }
    }}>
      {focused && actions.branch && <div className="flex items-center gap-2 px-4 pt-3 text-[12px] text-ink-3">
        <span>{focused.identifier}</span><span className="truncate">{focused.title}</span>
      </div>}
      <Command.Input autoFocus value={search} onValueChange={setSearch}
        placeholder={page === 'commands' ? 'Type a command or search…' : `Search ${page}…`}
        className="h-12 w-full border-b border-border bg-transparent px-4 text-[15px] text-ink outline-none placeholder:text-ink-3 pointer-coarse:text-[16px]" />
      <Command.List className="scrollbar-quiet max-h-[min(420px,60vh)] overflow-y-auto p-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:text-ink-3">
        <Command.Empty className="py-8 text-center text-[13px] text-ink-3">No results</Command.Empty>
        {page === 'commands' && <>
          {['Issue', 'General', 'Navigation', 'Inbox', 'Timeline'].map((group) => (
            <Command.Group key={group} heading={group}>
              {shortcutIds.filter((id) => shortcuts[id].group === group && actions[id]).map((id) => (
                <Item key={id} label={shortcuts[id].label} shortcut={shortcutLabel(shortcuts[id].keys[0])} onSelect={() => run(actions[id]!)} />
              ))}
            </Command.Group>
          ))}
          <Command.Group heading="Appearance">
            {(['light', 'dark', 'system'] as const).map((scheme) => <Item key={scheme} label={`Use ${scheme} theme`} onSelect={() => run(() => setSchemePreference(scheme))} />)}
          </Command.Group>
        </>}
        {(page === 'issues' || (page === 'commands' && search)) && <Command.Group heading="Issues">
          {issues.map((issue) => <Item key={issue.id} label={`${issue.identifier} ${issue.title}`} onSelect={() => go(`/issue/${issue.identifier}`)} record />)}
        </Command.Group>}
        {(page === 'projects' || page === 'commands') && <Command.Group heading="Projects">
          {catalog?.projects.map((project) => <Item key={project.id} label={`Open ${project.name}`} onSelect={() => go(`/project/${project.slugId}`)} record />)}
        </Command.Group>}
        {(page === 'teams' || page === 'commands') && <Command.Group heading="Teams">
          {catalog?.teams.map((team) => <Item key={team.id} label={`Go to ${team.name}`} onSelect={() => go(`/team/${team.key}/all`)} record />)}
        </Command.Group>}
      </Command.List>
    </Command>
  )
}

function Item({ label, shortcut, onSelect, record }: { label: string; shortcut?: string; onSelect: () => void; record?: boolean }) {
  return (
    <Command.Item value={label} onSelect={onSelect} className="flex h-8 cursor-default items-center gap-2.5 rounded-[var(--radius-control)] px-2 text-[13px] text-ink outline-none data-[selected=true]:bg-list-active">
      {record ? <CircleDot className="size-4 shrink-0 text-ink-2" /> : <CommandIcon className="size-4 shrink-0 text-ink-2" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </Command.Item>
  )
}
