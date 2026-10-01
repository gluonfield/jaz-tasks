import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const inputClass =
  'h-7 min-w-0 rounded-[var(--radius-control)] border border-border bg-bg px-2.5 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-primary disabled:opacity-50'

// Button is a pill, filled when primary; without onClick it submits its form.
export function Button({ children, onClick, primary, disabled }: { children: ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <button
      type={onClick ? 'button' : 'submit'}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'h-7 shrink-0 rounded-full border px-3 text-[12.5px] font-medium outline-none transition-colors disabled:opacity-50',
        primary ? 'border-primary bg-primary text-on-primary hover:bg-primary-strong' : 'border-border text-ink hover:bg-list-hover',
      )}
    >
      {children}
    </button>
  )
}
