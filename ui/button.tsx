import type { ComponentProps } from 'react'
import { twMerge } from 'tailwind-merge'

const variants = {
  secondary: 'border-border bg-raised text-ink hover:bg-list-hover',
  primary: 'bg-primary text-on-primary shadow-xs hover:bg-primary-strong',
  ghost: 'bg-transparent font-normal text-ink-2 hover:bg-list-hover hover:text-ink',
  danger: 'border-danger/30 bg-danger/10 text-danger hover:bg-danger/20',
}

const sizes = {
  default: 'h-7 px-2.5',
  sm: 'h-6 px-2 text-[12px]',
  lg: 'h-8 px-3 text-[13px]',
  icon: 'size-7 p-0',
  'icon-sm': 'size-6 p-0',
}

export function Button({ variant = 'secondary', size = 'default', type = 'button', className, ...props }: ComponentProps<'button'> & { variant?: keyof typeof variants; size?: keyof typeof sizes }) {
  return (
    <button
      type={type}
      {...props}
      className={twMerge(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-transparent text-[12.5px] font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
        variants[variant],
        sizes[size],
        className,
      )}
    />
  )
}
