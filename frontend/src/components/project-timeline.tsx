import { Link, useNavigate } from '@tanstack/react-router'
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatDay } from '@/lib/issues'
import { type ProjectPatch, useUpdateProject } from '@/lib/queries'
import { type Scale, type Zoom, fromDay, timelineScale, toDay, today, zooms } from '@/lib/timeline'
import type { Project } from '@/lib/types'
import { useWide } from '@/lib/ui'
import { cn } from '@/lib/utils'
import { EntityIcon } from './icons'
import { isTyping } from './issue-view'

type Range = { start: number; end: number }
type Mode = 'move' | 'start' | 'end' | 'create'
type Drag = { project: Project; mode: Mode; x: number; from: Range; range: Range; moved: boolean }

// datedRange is a project's span in days; a single date spans that day.
function datedRange(project: Project): Range | null {
  const days = [project.startDate, project.targetDate].filter((d) => d !== null).map(toDay)
  return days.length ? { start: Math.min(...days), end: Math.max(...days) } : null
}

function dragged(mode: Mode, from: Range, delta: number): Range {
  switch (mode) {
    case 'move':
      return { start: from.start + delta, end: from.end + delta }
    case 'start':
      return { start: Math.min(from.start + delta, from.end), end: from.end }
    case 'end':
      return { start: from.start, end: Math.max(from.end + delta, from.start) }
    case 'create':
      return { start: Math.min(from.start, from.start + delta), end: Math.max(from.start, from.start + delta) }
  }
}

const label = (day: number) => formatDay(fromDay(day))

export function ProjectTimeline({ projects, zoom, onZoom }: { projects: Project[]; zoom: Zoom; onZoom: (zoom: Zoom) => void }) {
  const side = useWide() ? 260 : 140
  const navigate = useNavigate()
  const update = useUpdateProject()
  const now = today()
  const scale = useMemo(
    () => timelineScale(zoom, projects.flatMap((p) => [p.startDate, p.targetDate]).filter((d) => d !== null).map(toDay), now),
    [zoom, projects, now],
  )
  const scroller = useRef<HTMLDivElement>(null)
  const shown = useRef(scale)
  // center is the day at the middle of the lanes, which a zoom keeps in place.
  const center = useRef(now)
  const [view, setView] = useState({ left: 0, width: 0 })
  const [cursor, setCursor] = useState<number | null>(null)
  const [hovered, setHovered] = useState<Project | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  // settled holds a dropped bar where it landed until the catalog it came from changes.
  const [settled, setSettled] = useState<{ id: string; range: Range; from: Project[] } | null>(null)

  const measure = useCallback(() => {
    const el = scroller.current!
    const width = el.clientWidth - side
    center.current = shown.current.start + (el.scrollLeft + width / 2) / shown.current.px
    setView({ left: el.scrollLeft, width })
  }, [side])

  useLayoutEffect(() => {
    const el = scroller.current!
    shown.current = scale
    el.scrollLeft = (center.current - scale.start) * scale.px - (el.clientWidth - side) / 2
  }, [scale, side])

  useEffect(() => {
    const observer = new ResizeObserver(measure)
    observer.observe(scroller.current!)
    return () => observer.disconnect()
  }, [measure])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const step = e.key === '-' ? 1 : e.key === '=' ? -1 : 0
      const next = zooms[zooms.indexOf(zoom) + step]
      if (!step || !next || isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) {
        return
      }
      e.preventDefault()
      onZoom(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom, onZoom])

  const x = (day: number) => (day - scale.start) * scale.px
  const dayAt = (clientX: number) => {
    const el = scroller.current!
    return Math.floor(scale.start + (clientX - el.getBoundingClientRect().left - side + el.scrollLeft) / scale.px)
  }
  // reveal centers a range that fits the lanes and otherwise brings its start in.
  const reveal = ({ start, end }: Range) => {
    const el = scroller.current!
    const lane = el.clientWidth - side
    const width = (end - start + 1) * scale.px
    el.scrollTo({ left: width < lane - 96 ? x(start) + (width - lane) / 2 : x(start) - 48, behavior: 'smooth' })
  }
  const rangeOf = (project: Project) =>
    drag?.project.id === project.id ? drag.range : settled?.from === projects && settled.id === project.id ? settled.range : datedRange(project)

  const finish = ({ project, mode, from, range, moved }: Drag) => {
    if (!moved && mode === 'move') {
      navigate({ to: '/project/$slugId', params: { slugId: project.slugId } })
      return
    }
    const span = moved ? range : { start: range.start, end: range.start + scale.span - 1 }
    if ((!moved && mode !== 'create') || (mode !== 'create' && span.start === from.start && span.end === from.end)) {
      return
    }
    const patch: ProjectPatch = {}
    if (project.startDate || mode === 'start' || mode === 'create') {
      patch.startDate = fromDay(span.start)
    }
    if (project.targetDate || mode === 'end' || mode === 'create') {
      patch.targetDate = fromDay(span.end)
    }
    setSettled({ id: project.id, range: span, from: projects })
    update.mutate({ id: project.id, patch })
  }

  const begin = (e: ReactPointerEvent, project: Project, mode: Mode, from: Range) => {
    if (e.button !== 0) {
      return
    }
    e.preventDefault()
    e.stopPropagation()
    let current: Drag = { project, mode, x: e.clientX, from, range: from, moved: false }
    setDrag(current)
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - current.x
      const moved = current.moved || Math.abs(dx) > 3
      current = { ...current, moved, range: dragged(mode, from, moved ? Math.round(dx / scale.px) : 0) }
      setDrag(current)
    }
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      setDrag(null)
      if (ev.type === 'pointerup') {
        finish(current)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const hoveredRange = hovered && rangeOf(hovered)
  const band = drag ?? (hovered && hoveredRange && { project: hovered, range: hoveredRange })
  return (
    <div ref={scroller} onScroll={measure} className={cn('scrollbar-quiet h-full overflow-auto', drag && 'select-none')}>
      <div className="relative flex min-h-full flex-col" style={{ width: side + x(scale.end) }}>
        <Header side={side} scale={scale} x={x} now={now} cursor={band ? null : cursor} band={band} onToday={() => reveal({ start: now, end: now })} />
        <div
          className="relative flex flex-1 flex-col"
          onPointerMove={(e) => setCursor(e.clientX - scroller.current!.getBoundingClientRect().left < side ? null : dayAt(e.clientX))}
          onPointerLeave={() => setCursor(null)}
        >
          <div aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: side, width: x(scale.end) }}>
            {scale.major.map((tick) => (
              <span key={tick.day} className="absolute inset-y-0 w-px bg-border" style={{ left: x(tick.day) }} />
            ))}
            {cursor !== null && <span className="absolute inset-y-0 w-px bg-ink-3/40" style={{ left: x(cursor) + scale.px / 2 }} />}
            <span className="absolute inset-y-0 w-px bg-primary" style={{ left: x(now) + scale.px / 2 }} />
          </div>
          {projects.map((project) => {
            const range = rangeOf(project)
            const off = range && (x(range.end + 1) < view.left ? 'left' : x(range.start) > view.left + view.width ? 'right' : null)
            return (
              <div key={project.id} className="group/row relative flex h-10 shrink-0">
                <Link
                  to="/project/$slugId"
                  params={{ slugId: project.slugId }}
                  className="sticky left-0 z-10 flex shrink-0 items-center gap-2.5 border-r border-border bg-bg px-4 text-[13px] font-medium text-ink outline-none group-hover/row:[background:linear-gradient(var(--color-list-hover),var(--color-list-hover)),var(--color-bg)]"
                  style={{ width: side }}
                >
                  <EntityIcon icon={project.icon} color={project.color} />
                  <span className="truncate">{project.name}</span>
                </Link>
                <div
                  className="relative flex-1 group-hover/row:bg-list-hover"
                  onPointerDown={range ? undefined : (e) => begin(e, project, 'create', { start: dayAt(e.clientX), end: dayAt(e.clientX) })}
                >
                  {range ? (
                    <Bar
                      project={project}
                      left={x(range.start)}
                      width={(range.end - range.start + 1) * scale.px}
                      hidden={Math.max(0, view.left - x(range.start))}
                      lifted={drag?.project.id === project.id}
                      onBegin={(e, mode) => begin(e, project, mode, range)}
                      onHover={(on) => setHovered(on ? project : null)}
                    />
                  ) : (
                    cursor !== null && (
                      <div
                        className="pointer-events-none absolute top-2 h-6 rounded-[6px] border border-dashed border-ink-3/60 opacity-0 group-hover/row:opacity-100"
                        style={{ left: x(cursor), width: scale.span * scale.px }}
                      />
                    )
                  )}
                  {off && (
                    <button
                      onClick={() => reveal(range)}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="absolute top-2 z-[2] flex h-6 items-center gap-1 rounded-full border border-border bg-raised px-2.5 text-[12px] text-ink-2 shadow-xs outline-none hover:text-ink"
                      style={off === 'left' ? { left: view.left + 8 } : { left: view.left + view.width - 8, transform: 'translateX(-100%)' }}
                    >
                      {off === 'left' ? `← ${label(range.end)}` : `${label(range.start)} →`}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          <div className="flex flex-1">
            <div className="sticky left-0 z-10 shrink-0 border-r border-border bg-bg" style={{ width: side }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// Bar keeps its name on the visible part when the lane edge hides its start.
function Bar({
  project,
  left,
  width,
  hidden,
  lifted,
  onBegin,
  onHover,
}: {
  project: Project
  left: number
  width: number
  hidden: number
  lifted: boolean
  onBegin: (e: ReactPointerEvent, mode: Mode) => void
  onHover: (on: boolean) => void
}) {
  const handle =
    'absolute inset-y-0 w-2.5 cursor-ew-resize after:absolute after:inset-y-1.5 after:left-1 after:w-0.5 after:rounded-full after:bg-ink-3 after:opacity-0 group-hover/bar:after:opacity-100'
  return (
    <div
      onPointerDown={(e) => onBegin(e, 'move')}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      className={cn('group/bar absolute top-2 z-[1] flex h-6 cursor-grab items-center', lifted && 'cursor-grabbing')}
      style={{ left, width: Math.max(width, 6) }}
    >
      <div
        className={cn('absolute inset-0 overflow-hidden rounded-[6px] border transition-shadow', lifted && 'shadow-[var(--shadow-raised)]')}
        style={{
          background: `color-mix(in oklab, ${project.color} 14%, var(--color-bg))`,
          borderColor: `color-mix(in oklab, ${project.color} 45%, transparent)`,
        }}
      >
        <div className="h-full" style={{ width: `${project.progress * 100}%`, background: `color-mix(in oklab, ${project.color} 26%, var(--color-bg))` }} />
      </div>
      {(!hidden || width - hidden > 80) && (
        <span
          className="pointer-events-none relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2 text-[12.5px] font-medium text-ink"
          style={hidden ? { marginLeft: hidden, maxWidth: width - hidden } : undefined}
        >
          <EntityIcon icon={project.icon} color={project.color} className="size-3" />
          <span className="truncate">{project.name}</span>
        </span>
      )}
      <span onPointerDown={(e) => onBegin(e, 'start')} className={cn(handle, '-left-1')} />
      <span onPointerDown={(e) => onBegin(e, 'end')} className={cn(handle, '-right-1')} />
    </div>
  )
}

function Header({
  side,
  scale,
  x,
  now,
  cursor,
  band,
  onToday,
}: {
  side: number
  scale: Scale
  x: (day: number) => number
  now: number
  cursor: number | null
  band: { project: Project; range: Range } | null
  onToday: () => void
}) {
  const pill = 'absolute bottom-1 z-[2] -translate-x-1/2 whitespace-nowrap rounded-[5px] px-1.5 text-[11.5px] font-medium leading-5'
  return (
    <div className="sticky top-0 z-20 flex h-[52px] shrink-0 border-b border-border bg-bg">
      <div className="sticky left-0 z-10 flex shrink-0 items-end border-r border-border bg-bg px-4 pb-2" style={{ width: side }}>
        <button
          onClick={onToday}
          className="h-6 rounded-full border border-border px-2.5 text-[12px] font-medium text-ink-2 outline-none transition-colors hover:bg-list-hover hover:text-ink"
        >
          Today
        </button>
      </div>
      <div className="relative flex-1 select-none">
        {scale.major.map((tick) => (
          <div key={tick.day} className="absolute top-0 h-6 border-l border-border" style={{ left: x(tick.day), width: x(tick.end) - x(tick.day) }}>
            <span className="sticky inline-block whitespace-nowrap px-2 pt-1.5 text-[12px] font-medium text-ink-2" style={{ left: side }}>
              {tick.label}
            </span>
          </div>
        ))}
        {scale.minor.map((tick) => (
          <span
            key={tick.day}
            className="absolute bottom-1 text-center text-[11.5px] leading-5 tabular-nums text-ink-3"
            style={{ left: x(tick.day), width: x(tick.end) - x(tick.day) }}
          >
            {tick.label}
          </span>
        ))}
        {band && (
          <div
            className="absolute bottom-1 h-5 rounded-[5px]"
            style={{ left: x(band.range.start), width: (band.range.end - band.range.start + 1) * scale.px, background: `color-mix(in oklab, ${band.project.color} 22%, var(--color-bg))` }}
          >
            <span className="absolute right-full top-0 mr-1 whitespace-nowrap rounded-[5px] bg-bg px-1 text-[11.5px] font-medium leading-5 text-ink">{label(band.range.start)}</span>
            <span className="absolute left-full top-0 ml-1 whitespace-nowrap rounded-[5px] bg-bg px-1 text-[11.5px] font-medium leading-5 text-ink">{label(band.range.end)}</span>
          </div>
        )}
        {cursor !== null && Math.abs(cursor - now) * scale.px > 56 && (
          <span className={cn(pill, 'bg-surface-2 text-ink')} style={{ left: x(cursor) + scale.px / 2 }}>
            {label(cursor)}
          </span>
        )}
        <span className={cn(pill, 'bg-primary text-on-primary')} style={{ left: x(now) + scale.px / 2 }}>
          {label(now)}
        </span>
      </div>
    </div>
  )
}
