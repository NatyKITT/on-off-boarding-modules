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

function diffMonthsAndDays(
  from: Date,
  to: Date
): { months: number; days: number } {
  const totalDays = differenceInCalendarDays(to, from)
  if (totalDays <= 0) return { months: 0, days: 0 }

  // differenceInCalendarMonths srovnává jen čísla měsíců (7 -> 8 = 1 měsíc),
  // nehledí na den v měsíci - u např. 23.7. -> 15.8. by tak vrátilo "1
  // měsíc", i když je to jen 23 dní. Dokud addMonths(from, months)
  // přestřeluje "to", měsíc se odečte, aby zbylo jen skutečně celé počty
  // měsíců podle kalendářní délky.
  let months = differenceInCalendarMonths(to, from)
  let afterMonths = addMonths(from, months)

  while (months > 0 && afterMonths > to) {
    months -= 1
    afterMonths = addMonths(from, months)
  }

  if (months <= 0) return { months: 0, days: totalDays }

  const remainderDays = differenceInCalendarDays(to, afterMonths)

  return { months, days: remainderDays }
}

/**
 * "2 měsíce 12 dní" for gaps of a month or more, otherwise just "12 dní" —
 * computed from real calendar months, not a /30 approximation.
 */
export function formatHumanDurationBetween(from: Date, to: Date): string {
  const { months, days } = diffMonthsAndDays(from, to)
  if (months <= 0) return formatDayCountCs(days)

  const monthWord =
    months === 1 ? "měsíc" : months >= 2 && months <= 4 ? "měsíce" : "měsíců"

  return days > 0
    ? `${months} ${monthWord} ${formatDayCountCs(days)}`
    : `${months} ${monthWord}`
}

/**
 * Compact "3m 12d" / "12d" form for tight spaces like a progress-bar label.
 */
export function formatHumanDurationCompact(from: Date, to: Date): string {
  const { months, days } = diffMonthsAndDays(from, to)
  if (months <= 0) return `${days}d`

  return days > 0 ? `${months}m ${days}d` : `${months}m`
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
