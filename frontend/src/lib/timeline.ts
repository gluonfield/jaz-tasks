export type Zoom = 'week' | 'month' | 'quarter' | 'year'

export const zooms: Zoom[] = ['week', 'month', 'quarter', 'year']

type Unit = 'day' | 'week' | 'month' | 'quarter' | 'year'

// Each zoom sets pixels per day, the header's two tick units, the days of
// padding around today and the dated projects, and the span a click gives an
// undated project.
const settings: Record<Zoom, { px: number; major: Unit; minor: Unit; pad: number; span: number }> = {
  week: { px: 40, major: 'month', minor: 'day', pad: 60, span: 7 },
  month: { px: 14, major: 'month', minor: 'week', pad: 150, span: 14 },
  quarter: { px: 4.5, major: 'quarter', minor: 'month', pad: 400, span: 42 },
  year: { px: 1.6, major: 'year', minor: 'month', pad: 800, span: 90 },
}

const DAY = 86_400_000
const monthsIn: Record<'month' | 'quarter' | 'year', number> = { month: 1, quarter: 3, year: 12 }
const longMonth = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const shortMonth = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' })

// A day is a whole calendar day counted from 1970-01-01, so arithmetic on
// days never meets a daylight saving shift.
export function toDay(date: string) {
  return Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / DAY
}

export function fromDay(day: number) {
  return new Date(day * DAY).toISOString().slice(0, 10)
}

export function today() {
  const now = new Date()
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY
}

function floor(unit: Unit, day: number) {
  const date = new Date(day * DAY)
  if (unit === 'day') {
    return day
  }
  if (unit === 'week') {
    return day - ((date.getUTCDay() + 6) % 7)
  }
  const month = date.getUTCMonth()
  return Date.UTC(date.getUTCFullYear(), month - (month % monthsIn[unit]), 1) / DAY
}

function next(unit: Unit, day: number) {
  if (unit === 'day' || unit === 'week') {
    return day + (unit === 'day' ? 1 : 7)
  }
  const date = new Date(day * DAY)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthsIn[unit], 1) / DAY
}

function label(unit: Unit, day: number, major: boolean) {
  const date = new Date(day * DAY)
  switch (unit) {
    case 'day':
    case 'week':
      return String(date.getUTCDate())
    case 'month':
      return (major ? longMonth : shortMonth).format(date)
    case 'quarter':
      return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`
    case 'year':
      return String(date.getUTCFullYear())
  }
}

export type Tick = { day: number; end: number; label: string }

function ticks(unit: Unit, start: number, end: number, major: boolean): Tick[] {
  const out: Tick[] = []
  for (let day = floor(unit, start); day < end; day = next(unit, day)) {
    if (day >= start) {
      out.push({ day, end: Math.min(next(unit, day), end), label: label(unit, day, major) })
    }
  }
  return out
}

export type Scale = { px: number; span: number; start: number; end: number; major: Tick[]; minor: Tick[] }

// timelineScale lays out whole major units around today and the given days.
export function timelineScale(zoom: Zoom, days: number[], now: number): Scale {
  const { px, major, minor, pad, span } = settings[zoom]
  const start = floor(major, Math.min(now, ...days) - pad)
  const end = next(major, floor(major, Math.max(now, ...days) + pad))
  return { px, span, start, end, major: ticks(major, start, end, true), minor: ticks(minor, start, end, false) }
}
