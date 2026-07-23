import type { StatisticsFilters, StatSection } from "./types"

const VALID_SECTIONS: StatSection[] = ["planned", "actual", "cancelled"]

export function parseStatisticsFilters(
  searchParams: URLSearchParams
): StatisticsFilters {
  const yearParam = Number(searchParams.get("year"))
  const year =
    Number.isFinite(yearParam) && yearParam > 0
      ? yearParam
      : new Date().getFullYear()

  const fromMonthParam = Number(searchParams.get("fromMonth"))
  const toMonthParam = Number(searchParams.get("toMonth"))

  const fromMonth =
    Number.isFinite(fromMonthParam) &&
    fromMonthParam >= 1 &&
    fromMonthParam <= 12
      ? fromMonthParam
      : undefined
  const toMonth =
    Number.isFinite(toMonthParam) && toMonthParam >= 1 && toMonthParam <= 12
      ? toMonthParam
      : undefined

  const department = searchParams.getAll("department").filter(Boolean)
  const unitName = searchParams.getAll("unitName").filter(Boolean)
  const positionName = searchParams.getAll("positionName").filter(Boolean)
  const section = searchParams
    .getAll("section")
    .filter((value): value is StatSection =>
      VALID_SECTIONS.includes(value as StatSection)
    )

  return {
    year,
    fromMonth,
    toMonth,
    department: department.length ? department : undefined,
    unitName: unitName.length ? unitName : undefined,
    positionName: positionName.length ? positionName : undefined,
    section: section.length ? section : undefined,
  }
}
