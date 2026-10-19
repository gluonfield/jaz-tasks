import { Dialog, DialogContent, DialogTitle } from './ui/dialog'
import { shortcutIds, shortcutLabel, shortcuts } from '@/lib/shortcut-definitions'
import { markdownShortcuts } from '@/lib/markdown-shortcuts'
import { setUI, useUI } from '@/lib/ui'
import { Kbd } from './kbd'

export function ShortcutsHelp() {
  const open = useUI((s) => s.helpOpen)
  return (
    <Dialog open={open} onOpenChange={(helpOpen) => setUI({ helpOpen })}>
      <DialogContent className="flex flex-col max-h-[85dvh] w-[600px] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-[var(--radius-card)] bg-raised p-0 md:max-w-[600px]">
        <DialogTitle className="shrink-0 px-5 py-4 text-[14px] font-medium">Keyboard Shortcuts</DialogTitle>
        <div className="scrollbar-quiet min-h-0 overflow-y-auto px-5 pb-4">
          {['Issue', 'General', 'Navigation', 'Inbox', 'Timeline'].map((group) => (
            <section key={group} className="mb-4">
              <h3 className="mb-1 text-[12px] font-medium text-ink-3">{group}</h3>
              {shortcutIds.filter((id) => shortcuts[id].group === group && !/^(team|status)[2-9]$/.test(id)).map((id) => (
                <div key={id} className="flex min-h-8 items-center justify-between gap-4 text-[13px]">
                  <span>{shortcuts[id].label.replace(/ 1$/, ' 1–9')}</span>
                  <span className="shrink-0 text-ink-3">
                    {shortcuts[id].keys.map((key, index) => <span key={key}>{index > 0 && ' / '}<Kbd>{shortcutLabel(key).replace(/ 1$/, ' 1–9')}</Kbd></span>)}
                  </span>
                </div>
              ))}
            </section>
          ))}
          <section>
            <h3 className="mb-1 text-[12px] font-medium text-ink-3">Editing</h3>
            {Object.values(markdownShortcuts).map((format) => <div key={format.label} className="flex min-h-8 items-center justify-between text-[13px]">{format.label}<Kbd>{format.keys.map((key) => shortcutLabel(key)).join(' / ')}</Kbd></div>)}
            <div className="flex min-h-8 items-center justify-between text-[13px]">Save or submit<Kbd>{shortcutLabel('Mod+Enter')}</Kbd></div>
            <div className="flex min-h-8 items-center justify-between text-[13px]">Undo / Redo<Kbd>{shortcutLabel('Mod+z')} / {shortcutLabel('Mod+Shift+z')}</Kbd></div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
