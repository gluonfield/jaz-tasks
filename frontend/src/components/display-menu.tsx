import { type LucideIcon, SlidersHorizontal } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { Kbd } from './kbd'

// DisplayMenu picks a view's layout, which ⌘B cycles, above the view's own options.
export function DisplayMenu<T extends string>({
  layouts,
  layout,
  setLayout,
  children,
}: {
  layouts: [T, LucideIcon][]
  layout: T
  setLayout: (layout: T) => void
  children?: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        const index = layouts.findIndex(([value]) => value === layout)
        setLayout(layouts[(index + 1) % layouts.length][0])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [layouts, layout, setLayout])

  return (
    <Popover>
      <PopoverTrigger className="flex h-7 items-center gap-1.5 rounded-full border border-border px-3 text-[12.5px] font-medium text-ink-2 outline-none transition-colors hover:bg-list-hover hover:text-ink data-[state=open]:bg-list-active max-md:w-7 max-md:justify-center max-md:px-0">
        <SlidersHorizontal className="size-3.5" />
        <span className="max-md:sr-only">Display</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 rounded-[var(--radius-card)] p-3 shadow-[var(--shadow-raised)]">
        <div className="grid grid-cols-2 gap-1.5">
          {layouts.map(([value, Icon]) => (
            <button
              key={value}
              onClick={() => setLayout(value)}
              className={cn(
                'flex h-14 flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] border text-[12px] font-medium capitalize outline-none transition-colors',
                layout === value ? 'border-primary/50 bg-primary-soft text-ink' : 'border-border text-ink-2 hover:bg-list-hover',
              )}
            >
              <Icon className="size-4" />
              {value}
            </button>
          ))}
        </div>
        {children}
        <p className="mt-3 border-t border-border pt-2.5 text-[11.5px] text-ink-3 pointer-coarse:hidden">
          Toggle layout <Kbd>⌘</Kbd>
          <Kbd>B</Kbd>
        </p>
      </PopoverContent>
    </Popover>
  )
}

export function DisplaySelect<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (value: T) => void }) {
  return (
    <div className="mt-3 flex items-center justify-between text-[12.5px]">
      <span className="text-ink-2">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-7 rounded-[5px] border border-border bg-bg px-1.5 text-[12.5px] text-ink outline-none pointer-coarse:text-[16px]"
      >
        {options.map(([option, name]) => (
          <option key={option} value={option}>
            {name}
          </option>
        ))}
      </select>
    </div>
  )
}
