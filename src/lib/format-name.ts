export function joinNameWithTitles(parts: {
  titleBefore?: string | null
  name?: string | null
  surname?: string | null
  titleAfter?: string | null
}): string {
  const base = [parts.titleBefore, parts.name, parts.surname]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" ")

  const titleAfter = parts.titleAfter?.trim()

  if (!titleAfter) return base
  if (!base) return titleAfter

  return `${base}, ${titleAfter}`
}
