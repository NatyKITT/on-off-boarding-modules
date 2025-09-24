export type Diff = {
  field: string
  oldValue: string | null
  newValue: string | null
}

function toLogString(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date)
    return isNaN(value.getTime()) ? null : value.toISOString()
  if (typeof value === "object") {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}
function isEqual(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  return Object.is(a, b)
}
export function makeDiff<T extends Record<string, unknown>, K extends keyof T>(
  prev: Pick<T, K>,
  next: Pick<T, K>,
  fields: readonly K[]
): Diff[] {
  const out: Diff[] = []
  for (const f of fields) {
    const a = prev[f],
      b = next[f]
    if (!isEqual(a, b))
      out.push({
        field: String(f),
        oldValue: toLogString(a),
        newValue: toLogString(b),
      })
  }
  return out
}
