import { Check, Plus } from 'lucide-react'
import { Command as CommandPrimitive } from 'cmdk'
import { type ReactNode, useState } from 'react'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type PickerOption = {
  value: string
  label: string
  icon?: ReactNode
  keywords?: string[]
  detail?: ReactNode
}

// Picker is Linear's property menu: a filter field over a keyboard-driven list.
// Number keys pick the first nine options when the filter is empty.
export function Picker({
  open,
  onOpenChange,
  trigger,
  anchor,
  placeholder,
  options,
  selected,
  onSelect,
  multiple = false,
  align = 'start',
  footer,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger?: ReactNode
  anchor?: ReactNode
  placeholder: string
  options: PickerOption[]
  selected: string[]
  onSelect: (value: string) => void
  multiple?: boolean
  align?: 'start' | 'end' | 'center'
  footer?: ReactNode
  // onCreate offers to create an option from unmatched filter text.
  onCreate?: { label: string; create: (name: string) => void }
}) {
  const [search, setSearch] = useState('')
  const creatable = onCreate && search.trim() && !options.some((o) => o.label.toLowerCase() === search.trim().toLowerCase())
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {trigger && <PopoverTrigger asChild>{trigger}</PopoverTrigger>}
      {anchor && <PopoverAnchor asChild>{anchor}</PopoverAnchor>}
      <PopoverContent
        align={align}
        sideOffset={6}
        className="w-60 overflow-hidden rounded-[var(--radius-card)] p-0 shadow-[var(--shadow-raised)]"
        onClick={(e) => e.stopPropagation()}
      >
        <CommandPrimitive
          loop
          defaultValue={multiple ? undefined : itemValue(options.find((o) => selected.includes(o.value)))}
          onKeyDown={(e) => {
            const digit = Number(e.key)
            const input = e.currentTarget.querySelector('input')
            if (!e.metaKey && !e.ctrlKey && digit >= 1 && digit <= 9 && !input?.value && options[digit - 1]) {
              e.preventDefault()
              onSelect(options[digit - 1].value)
              if (!multiple) {
                onOpenChange(false)
              }
            }
          }}
        >
          <CommandPrimitive.Input
            autoFocus
            value={search}
            onValueChange={setSearch}
            placeholder={placeholder}
            className="h-9 w-full border-b border-border bg-transparent px-3 text-[13px] text-ink outline-none placeholder:text-ink-3"
          />
          <CommandPrimitive.List className="scrollbar-quiet max-h-72 overflow-y-auto p-1">
            {!creatable && <CommandPrimitive.Empty className="px-2 py-3 text-center text-[12px] text-ink-3">No results</CommandPrimitive.Empty>}
            {options.map((option, index) => {
              const active = selected.includes(option.value)
              return (
                <CommandPrimitive.Item
                  key={option.value}
                  value={itemValue(option)}
                  keywords={option.keywords}
                  onSelect={() => {
                    onSelect(option.value)
                    if (!multiple) {
                      onOpenChange(false)
                    }
                  }}
                  className="group flex h-8 cursor-default items-center gap-2.5 rounded-[5px] px-2 text-[13px] text-ink outline-none data-[selected=true]:bg-list-active"
                >
                  {multiple && (
                    <span
                      className={cn(
                        'flex size-3.5 items-center justify-center rounded-[4px] border border-ink-3/60',
                        active && 'border-primary bg-primary text-on-primary',
                      )}
                    >
                      {active && <Check className="size-2.5" strokeWidth={3} />}
                    </span>
                  )}
                  {option.icon}
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.detail}
                  {!multiple && active && <Check className="size-3.5 text-ink-2" />}
                  {index < 9 && <span className="w-3 text-right text-[11px] tabular-nums text-ink-3">{index + 1}</span>}
                </CommandPrimitive.Item>
              )
            })}
            {creatable && (
              <CommandPrimitive.Item
                value={`create ${search}`}
                forceMount
                onSelect={() => {
                  onCreate.create(search.trim())
                  setSearch('')
                }}
                className="flex h-8 cursor-default items-center gap-2.5 rounded-[5px] px-2 text-[13px] text-ink outline-none data-[selected=true]:bg-list-active"
              >
                <Plus className="size-3.5 text-ink-3" />
                <span className="truncate">
                  {onCreate.label} <span className="font-medium">"{search.trim()}"</span>
                </span>
              </CommandPrimitive.Item>
            )}
          </CommandPrimitive.List>
          {footer}
        </CommandPrimitive>
      </PopoverContent>
    </Popover>
  )
}

const itemValue = (option?: PickerOption) => option && `${option.label} ${option.value}`
