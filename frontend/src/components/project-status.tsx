import type { ProjectStatusType } from '@/lib/types'
import { cn } from '@/lib/utils'

// ProjectStatusIcon follows Linear's project glyphs: dashed backlog, empty
// planned, pie for in progress, pause bars, check and cross.
export function ProjectStatusIcon({ type, color, className }: { type: ProjectStatusType; color: string; className?: string }) {
  const cut = 'var(--color-bg)'
  return (
    <svg viewBox="0 0 14 14" className={cn('size-3.5 shrink-0', className)} aria-hidden>
      {type === 'completed' || type === 'canceled' ? (
        <>
          <circle cx="7" cy="7" r="6.5" fill={color} />
          {type === 'completed' ? (
            <path d="M4.3 7.2 6.2 9l3.5-3.9" fill="none" stroke={cut} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path d="m4.9 4.9 4.2 4.2m0-4.2L4.9 9.1" stroke={cut} strokeWidth="1.5" strokeLinecap="round" />
          )}
        </>
      ) : (
        <>
          <circle cx="7" cy="7" r="5.75" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray={type === 'backlog' ? '1.4 1.74' : undefined} />
          {type === 'started' && <circle cx="7" cy="7" r="1.75" fill="none" stroke={color} strokeWidth="3.5" strokeDasharray={`${Math.PI * 1.75} 100`} transform="rotate(-90 7 7)" />}
          {type === 'paused' && <path d="M5.6 4.8v4.4M8.4 4.8v4.4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />}
        </>
      )}
    </svg>
  )
}
