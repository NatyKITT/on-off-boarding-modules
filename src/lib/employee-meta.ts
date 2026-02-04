export type EmployeeMeta = {
  fullName?: string
  position?: string
  unitName?: string
  department?: string
}

type OnboardingLike = {
  titleBefore?: string | null
  name?: string | null
  surname?: string | null
  titleAfter?: string | null
  department?: string | null
  unitName?: string | null
  positionName?: string | null
}

export function buildEmployeeMeta(onb: OnboardingLike): EmployeeMeta {
  const fullName = [onb.titleBefore, onb.name, onb.surname, onb.titleAfter]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()

  const unitName = (onb.unitName ?? undefined)?.trim() || undefined
  const department = (onb.department ?? undefined)?.trim() || undefined
  const position = (onb.positionName ?? undefined)?.trim() || undefined

  return {
    fullName,
    position,
    unitName,
    department,
  }
}
