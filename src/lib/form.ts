export function nullifyEmptyStrings<T extends Record<string, unknown>>(
  obj: T
): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === "string" && v.trim() === "" ? undefined : v
  }
  return out as T
}
