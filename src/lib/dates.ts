export function addCalendarMonths(d: Date, months: number): Date {
  const r = new Date(d)
  r.setUTCMonth(r.getUTCMonth() + months)
  return r
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
