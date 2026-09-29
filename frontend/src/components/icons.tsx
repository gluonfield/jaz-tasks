import { AppWindow, Bot, Box, Cpu, Layers, Palette, Rocket, createLucideIcon, type LucideIcon } from 'lucide-react'
import type { StateType, User } from '@/lib/types'
import { cn } from '@/lib/utils'

const startedFill = [0.5, 0.75, 0.875]

// StatusIcon draws Linear's workflow glyphs; progress is the share an
// in-progress state has covered, by its order among started states.
export function StatusIcon({
  type,
  color,
  progress = 0,
  className,
}: {
  type: StateType
  color: string
  progress?: number
  className?: string
}) {
  const cut = 'var(--color-bg)'
  return (
    <svg viewBox="0 0 14 14" className={cn('size-3.5 shrink-0', className)} aria-hidden>
      {type === 'completed' ? (
        <>
          <circle cx="7" cy="7" r="6.5" fill={color} />
          <path d="M4.3 7.2 6.2 9l3.5-3.9" fill="none" stroke={cut} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : type === 'canceled' ? (
        <>
          <circle cx="7" cy="7" r="6.5" fill={color} />
          <path d="m4.9 4.9 4.2 4.2m0-4.2L4.9 9.1" stroke={cut} strokeWidth="1.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle
            cx="7"
            cy="7"
            r="5.75"
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeDasharray={type === 'backlog' ? '1.4 1.74' : undefined}
          />
          {type === 'started' && (
            <circle
              cx="7"
              cy="7"
              r="1.75"
              fill="none"
              stroke={color}
              strokeWidth="3.5"
              strokeDasharray={`${progress * 2 * Math.PI * 1.75} 100`}
              transform="rotate(-90 7 7)"
            />
          )}
        </>
      )}
    </svg>
  )
}

export function startedProgress(index: number) {
  return startedFill[Math.min(index, startedFill.length - 1)]
}

export function PriorityIcon({ priority, className }: { priority: number; className?: string }) {
  if (priority === 1) {
    return (
      <svg viewBox="0 0 14 14" className={cn('size-3.5 shrink-0', className)} aria-hidden>
        <rect x="0.5" y="0.5" width="13" height="13" rx="3" fill="var(--color-accent)" />
        <path d="M7 3.6v4.1M7 10.1v.3" stroke="var(--color-bg)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }
  if (priority === 0) {
    return (
      <svg viewBox="0 0 14 14" className={cn('size-3.5 shrink-0 text-ink-3', className)} aria-hidden>
        {[1, 5.5, 10].map((x) => (
          <rect key={x} x={x} y="6.25" width="3" height="1.5" rx="0.5" fill="currentColor" />
        ))}
      </svg>
    )
  }
  const filled = 5 - priority
  return (
    <svg viewBox="0 0 14 14" className={cn('size-3.5 shrink-0 text-ink-2', className)} aria-hidden>
      {[0, 1, 2].map((bar) => (
        <rect
          key={bar}
          x={1 + bar * 4.5}
          y={9 - bar * 3.5}
          width="3"
          height={4 + bar * 3.5}
          rx="0.75"
          fill="currentColor"
          opacity={bar < filled ? 1 : 0.28}
        />
      ))}
    </svg>
  )
}

function hash(value: string) {
  let h = 0
  for (const char of value) {
    h = (h * 31 + char.charCodeAt(0)) | 0
  }
  return Math.abs(h)
}

export function Avatar({ user, size = 18, className }: { user?: User | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: size * 0.45 }
  if (!user) {
    return (
      <svg viewBox="0 0 18 18" style={style} className={cn('shrink-0 text-ink-3', className)} aria-hidden>
        <circle cx="9" cy="9" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.8" />
        <circle cx="9" cy="7.2" r="2.3" fill="currentColor" />
        <path d="M5.2 13.2c.7-1.6 2.1-2.4 3.8-2.4s3.1.8 3.8 2.4" fill="currentColor" />
      </svg>
    )
  }
  if (user.avatarUrl) {
    return <img src={user.avatarUrl} alt="" style={style} className={cn('shrink-0 rounded-full object-cover', className)} />
  }
  return (
    <span
      style={{ ...style, background: `var(--color-avatar-${(hash(user.id) % 6) + 1})` }}
      className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold leading-none text-avatar-ink', className)}
      aria-hidden
    >
      {user.initials}
    </span>
  )
}

const entityIcons: Record<string, LucideIcon> = { AppWindow, Bot, Cpu, Layers, Palette, Rocket }

// EntityIcon renders a team or project icon name tinted with its color.
export function EntityIcon({ icon, color, className }: { icon: string | null; color: string | null; className?: string }) {
  const Icon = (icon && entityIcons[icon]) || Box
  return <Icon className={cn('size-3.5 shrink-0', className)} style={{ color: color ?? 'var(--color-ink-2)' }} strokeWidth={2} />
}

export function TeamBadge({ icon, color, className }: { icon: string | null; color: string | null; className?: string }) {
  const Icon = (icon && entityIcons[icon]) || Box
  return (
    <span
      className={cn('inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px]', className)}
      style={{ background: `color-mix(in oklab, ${color ?? 'var(--color-ink-3)'} 18%, transparent)` }}
    >
      <Icon className="size-3" style={{ color: color ?? 'var(--color-ink-2)' }} strokeWidth={2.2} />
    </span>
  )
}

export function LabelDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', className)} style={{ background: color }} />
}

// ProgressRing is Linear's small project/cycle completion circle.
export function ProgressRing({ value, color = 'var(--color-primary)', className }: { value: number; color?: string; className?: string }) {
  const r = 5.25
  const length = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 14 14" className={cn('size-3.5 shrink-0 -rotate-90', className)} aria-hidden>
      <circle cx="7" cy="7" r={r} fill="none" stroke="var(--color-border)" strokeWidth="1.8" />
      <circle cx="7" cy="7" r={r} fill="none" stroke={color} strokeWidth="1.8" strokeDasharray={`${value * length} ${length}`} strokeLinecap="round" />
    </svg>
  )
}

// MyIssuesIcon is Linear's My issues mark: a focus frame around a dot.
export const MyIssuesIcon = createLucideIcon('my-issues', [
  ['path', { d: 'M3 8V6a3 3 0 0 1 3-3h2', key: 'tl' }],
  ['path', { d: 'M16 3h2a3 3 0 0 1 3 3v2', key: 'tr' }],
  ['path', { d: 'M21 16v2a3 3 0 0 1-3 3h-2', key: 'br' }],
  ['path', { d: 'M8 21H6a3 3 0 0 1-3-3v-2', key: 'bl' }],
  ['circle', { cx: '12', cy: '12', r: '2.25', fill: 'currentColor', key: 'dot' }],
])
