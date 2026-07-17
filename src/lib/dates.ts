import {
  addMonths,
  differenceInCalendarDays,
  differenceInCalendarMonths,
} from "date-fns"

export function addCalendarMonths(d: Date, months: number): Date {
  const r = new Date(d)
  r.setUTCMonth(r.getUTCMonth() + months)
  return r
}

export function formatDayCountCs(days: number): string {
  const n = Math.abs(Math.round(days))

  if (n === 1) return "1 den"
  if (n >= 2 && n <= 4) return `${n} dny`

  return `${n} dní`
}

/**
 * "2 měsíce 12 dní" for gaps of a month or more, otherwise just "12 dní" —
 * computed from real calendar months, not a /30 approximation.
 */
export function formatHumanDurationBetween(from: Date, to: Date): string {
  const days = differenceInCalendarDays(to, from)
  if (days <= 0) return formatDayCountCs(0)

  const months = differenceInCalendarMonths(to, from)
  if (months <= 0) return formatDayCountCs(days)

  const afterMonths = addMonths(from, months)
  const remainderDays = differenceInCalendarDays(to, afterMonths)

  const monthWord =
    months === 1 ? "měsíc" : months >= 2 && months <= 4 ? "měsíce" : "měsíců"

  return remainderDays > 0
    ? `${months} ${monthWord} ${formatDayCountCs(remainderDays)}`
    : `${months} ${monthWord}`
}

export type DateProgressBucket =
  | "OVERDUE"
  | "TODAY"
  | "WITHIN_7"
  | "WITHIN_30"
  | "WITHIN_60"
  | "WITHIN_120"
  | "LATER"

export function getDaysRemaining(targetDate?: string | null): number | null {
  if (!targetDate) return null

  const target = new Date(`${targetDate.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(target.getTime())) return null

  const today = new Date()
  const todayOnly = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  )

  return Math.round(
    (target.getTime() - todayOnly.getTime()) / (1000 * 60 * 60 * 24)
  )
}

export function getDateProgressBucket(
  targetDate?: string | null
): DateProgressBucket | null {
  const diffDays = getDaysRemaining(targetDate)
  if (diffDays == null) return null

  if (diffDays < 0) return "OVERDUE"
  if (diffDays === 0) return "TODAY"
  if (diffDays <= 7) return "WITHIN_7"
  if (diffDays <= 30) return "WITHIN_30"
  if (diffDays <= 60) return "WITHIN_60"
  if (diffDays <= 120) return "WITHIN_120"

  return "LATER"
}

export type DayRangeValue = { min: number | null; max: number | null }

export const EMPTY_DAY_RANGE: DayRangeValue = { min: null, max: null }

export function isDayRangeActive(range: DayRangeValue): boolean {
  return range.min != null || range.max != null
}

export function matchesDayRange(
  days: number | null,
  range: DayRangeValue
): boolean {
  if (!isDayRangeActive(range)) return true
  if (days == null) return false
  if (range.min != null && days < range.min) return false
  if (range.max != null && days > range.max) return false

  return true
}

export function progressPct(from: Date, to: Date, now = new Date()): number {
  const a = from.getTime(),
    b = to.getTime(),
    n = now.getTime()
  if (Number.isNaN(a) || Number.isNaN(b) || a >= b) return 0
  if (n <= a) return 0
  if (n >= b) return 100
  return Math.round(((n - a) / (b - a)) * 100)
}
