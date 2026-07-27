const USER_REF_KEYS = [
  "restoredBy",
  "deletedBy",
  "cancelledBy",
  "cancelled_by",
  "revertedBy",
  "createdBy",
]

function parseObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null

  try {
    const parsed: unknown = JSON.parse(value)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // ignore
  }

  return null
}

export function collectUserRefs(value: string | null): string[] {
  const obj = parseObject(value)
  if (!obj) return []

  return USER_REF_KEYS.map((key) => obj[key]).filter(
    (v): v is string => typeof v === "string" && v.length > 0
  )
}

export function resolveUserRefs(
  value: string | null,
  nameByKey: Map<string, string>
): string | null {
  const obj = parseObject(value)
  if (!obj) return value

  const resolved = { ...obj }
  let changed = false

  for (const key of USER_REF_KEYS) {
    const ref = resolved[key]
    if (typeof ref === "string" && nameByKey.has(ref)) {
      resolved[key] = nameByKey.get(ref)
      changed = true
    }
  }

  return changed ? JSON.stringify(resolved) : value
}
