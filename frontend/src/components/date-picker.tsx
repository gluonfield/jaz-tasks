import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatDay } from '@/lib/issues'
import { fromDay, monthLabel, monthStart, shiftMonth, toDay, today, weekday } from '@/lib/timeline'
import { cn } from '@/lib/utils'
import { PropertyButton, type Variant } from './properties'

// DatePicker sets or clears a calendar day from a month grid.
export function DatePicker({
  value,
  onChange,
  icon: Icon,
  label,
  title,
  variant = 'chip',
  className,
}: {
  value: string | null | undefined
  onChange: (value: string | null) => void
  icon: LucideIcon
  label: string
  title: string
  variant?: Variant
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const pick = (next: string | null) => {
    onChange(next)
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PropertyButton
          variant={variant}
          className={className}
          title={title}
          icon={<Icon className="size-3.5 text-ink-3" />}
          label={value ? formatDay(value) : label}
          muted={!value}
        />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-64 rounded-[var(--radius-card)] p-2 shadow-[var(--shadow-raised)]" onClick={(e) => e.stopPropagation()}>
        <Calendar value={value ?? null} onPick={pick} />
        {value && (
          <button
            type="button"
            onClick={() => pick(null)}
            className="mt-1.5 h-7 w-full rounded-[5px] text-[12.5px] text-ink-2 outline-none hover:bg-list-hover hover:text-ink"
          >
            Clear date
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}

function Calendar({ value, onPick }: { value: string | null; onPick: (day: string) => void }) {
  const now = today()
  const selected = value ? toDay(value) : null
  const [month, setMonth] = useState(() => monthStart(selected ?? now))
  return (
    <div className="select-none">
      <div className="flex h-8 items-center justify-between px-1">
        <span className="text-[13px] font-medium text-ink">{monthLabel(month)}</span>
        <div className="flex">
          {([-1, 1] as const).map((step) => (
            <button
              key={step}
              type="button"
              aria-label={step < 0 ? 'Previous month' : 'Next month'}
              onClick={() => setMonth(shiftMonth(month, step))}
              className="flex size-7 items-center justify-center rounded-[5px] text-ink-3 outline-none hover:bg-list-hover hover:text-ink"
            >
              {step < 0 ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[11.5px]">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((name, i) => (
          <span key={i} className="flex h-7 items-center justify-center text-ink-3">
            {name}
          </span>
        ))}
        {Array.from({ length: weekday(month) }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {Array.from({ length: shiftMonth(month, 1) - month }, (_, i) => {
          const day = month + i
          return (
            <button
              key={day}
              type="button"
              onClick={() => onPick(fromDay(day))}
              className={cn(
                'flex h-8 items-center justify-center rounded-[5px] text-[12.5px] tabular-nums outline-none transition-colors',
                day === selected ? 'bg-primary font-medium text-on-primary' : 'text-ink hover:bg-list-hover',
                day === now && day !== selected && 'font-semibold text-primary',
              )}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
    </div>
  )
}
