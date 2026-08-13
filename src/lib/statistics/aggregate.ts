import "server-only"

import { prisma } from "@/lib/db"
import { normalizePersonalNumber } from "@/lib/employment-linking"

import type {
  ChangesByTypeMonthPoint,
  CustomViewRequest,
  CustomViewResult,
  KpiSummary,
  MonthlyFlowPoint,
  ProcessHealth,
  StatDatum,
  StatDimension,
  StatisticsFilterOptions,
  StatisticsFilters,
  StatisticsOverview,
  StatMetric,
  StatSection,
} from "./types"

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function resolveDateRange(filters: StatisticsFilters) {
  const fromMonth = filters.fromMonth ?? 1
  const toMonth = filters.toMonth ?? 12
  const start = new Date(Date.UTC(filters.year, fromMonth - 1, 1))
  const end = new Date(Date.UTC(filters.year, toMonth, 1))
  return { start, end }
}

function inRange(date: Date | null | undefined, start: Date, end: Date) {
  if (!date) return false
  return date >= start && date < end
}

function buildOrgMatcher(filters: StatisticsFilters) {
  return (row: {
    department: string | null
    unitName: string | null
    positionName: string | null
  }) =>
    (!filters.department?.length ||
      (row.department && filters.department.includes(row.department))) &&
    (!filters.unitName?.length ||
      (row.unitName && filters.unitName.includes(row.unitName))) &&
    (!filters.positionName?.length ||
      (row.positionName && filters.positionName.includes(row.positionName)))
}

type OnboardingRow = Awaited<ReturnType<typeof fetchOnboardingsRaw>>[number]
type OffboardingRow = Awaited<ReturnType<typeof fetchOffboardingsRaw>>[number]
type ChangeRow = Awaited<ReturnType<typeof fetchChangesRaw>>[number]

async function fetchOnboardingsRaw() {
  return prisma.employeeOnboarding.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      status: true,
      plannedStart: true,
      actualStart: true,
      probationEnd: true,
      probationMonths: true,
      department: true,
      unitName: true,
      positionName: true,
      positionType: true,
      supervisorName: true,
      mentorName: true,
      personalNumber: true,
      cancelledAt: true,
    },
  })
}

async function fetchOffboardingsRaw() {
  return prisma.employeeOffboarding.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      plannedEnd: true,
      actualEnd: true,
      cancelledAt: true,
      department: true,
      unitName: true,
      positionName: true,
      personalNumber: true,
    },
  })
}

async function fetchChangesRaw() {
  return prisma.employeeChange.findMany({
    where: { deletedAt: null, status: { not: "CANCELLED" } },
    select: {
      id: true,
      type: true,
      effectiveDate: true,
      oldDepartment: true,
      newDepartment: true,
      oldUnitName: true,
      newUnitName: true,
      oldPositionName: true,
      newPositionName: true,
    },
  })
}

// Per-request cache: without it, a single page load fanned out into dozens of
// duplicate full-table scans (each metric/KPI re-fetched the same raw rows),
// which was the main source of intermittent "Nepodařilo se načíst statistiky"
// failures under load (DB connection-pool exhaustion / timeouts).
type RawCache = {
  onboardings?: Promise<OnboardingRow[]>
  offboardings?: Promise<OffboardingRow[]>
  changes?: Promise<ChangeRow[]>
}

function createRawCache(): RawCache {
  return {}
}

function cachedOnboardingsRaw(cache: RawCache) {
  if (!cache.onboardings) cache.onboardings = fetchOnboardingsRaw()
  return cache.onboardings
}

function cachedOffboardingsRaw(cache: RawCache) {
  if (!cache.offboardings) cache.offboardings = fetchOffboardingsRaw()
  return cache.offboardings
}

function cachedChangesRaw(cache: RawCache) {
  if (!cache.changes) cache.changes = fetchChangesRaw()
  return cache.changes
}

function onboardingSection(row: OnboardingRow): StatSection {
  if (row.status === "CANCELLED") return "cancelled"
  return row.actualStart ? "actual" : "planned"
}

function onboardingRelevantDate(row: OnboardingRow): Date | null {
  return onboardingSection(row) === "cancelled"
    ? (row.cancelledAt ?? row.plannedStart)
    : (row.actualStart ?? row.plannedStart)
}

async function fetchOnboardings(filters: StatisticsFilters, cache: RawCache) {
  const { start, end } = resolveDateRange(filters)
  const sections = filters.section?.length
    ? filters.section
    : (["planned", "actual"] as StatSection[])
  const orgMatcher = buildOrgMatcher(filters)

  const rows = await cachedOnboardingsRaw(cache)

  return rows.filter((row) => {
    if (!orgMatcher(row)) return false
    if (!sections.includes(onboardingSection(row))) return false
    return inRange(onboardingRelevantDate(row), start, end)
  })
}

function offboardingSection(row: OffboardingRow): StatSection {
  if (row.cancelledAt) return "cancelled"
  return row.actualEnd ? "actual" : "planned"
}

function offboardingRelevantDate(row: OffboardingRow): Date {
  return offboardingSection(row) === "cancelled"
    ? (row.cancelledAt ?? row.plannedEnd)
    : (row.actualEnd ?? row.plannedEnd)
}

async function fetchOffboardings(filters: StatisticsFilters, cache: RawCache) {
  const { start, end } = resolveDateRange(filters)
  const sections = filters.section?.length
    ? filters.section
    : (["planned", "actual"] as StatSection[])
  const orgMatcher = buildOrgMatcher(filters)

  const rows = await cachedOffboardingsRaw(cache)

  return rows.filter((row) => {
    if (!orgMatcher(row)) return false
    if (!sections.includes(offboardingSection(row))) return false
    return inRange(offboardingRelevantDate(row), start, end)
  })
}

async function fetchChanges(filters: StatisticsFilters, cache: RawCache) {
  const { start, end } = resolveDateRange(filters)
  const rows = await cachedChangesRaw(cache)

  return rows.filter((row) => {
    if (!inRange(row.effectiveDate, start, end)) return false

    const department = row.newDepartment ?? row.oldDepartment
    const unitName = row.newUnitName ?? row.oldUnitName
    const positionName = row.newPositionName ?? row.oldPositionName

    return buildOrgMatcher(filters)({ department, unitName, positionName })
  })
}

async function getCurrentHeadcountAsOf(
  filters: StatisticsFilters,
  asOf: Date,
  cache: RawCache
) {
  const matcher = buildOrgMatcher(filters)
  const [onboardings, offboardings] = await Promise.all([
    cachedOnboardingsRaw(cache),
    cachedOffboardingsRaw(cache),
  ])

  const started = onboardings.filter(
    (row) =>
      row.status !== "CANCELLED" &&
      row.actualStart &&
      row.actualStart < asOf &&
      matcher(row)
  ).length

  const ended = offboardings.filter(
    (row) =>
      !row.cancelledAt && row.actualEnd && row.actualEnd < asOf && matcher(row)
  ).length

  return started - ended
}

type LinkedDeparture = { actualEnd: Date | null; plannedEnd: Date }

async function getOffboardingsDuringProbationMatches(
  filters: StatisticsFilters,
  cache: RawCache
) {
  const onboardings = (
    await fetchOnboardings({ ...filters, section: ["actual"] }, cache)
  ).filter((row) => row.actualStart && row.probationEnd)

  if (onboardings.length === 0) {
    return { total: 0, matchedOnboardings: [] as OnboardingRow[] }
  }

  const personalNumbers = Array.from(
    new Set(
      onboardings
        .map((row) => normalizePersonalNumber(row.personalNumber))
        .filter((v): v is string => Boolean(v))
    )
  )

  const linked = personalNumbers.length
    ? await prisma.employeeOffboarding.findMany({
        where: {
          deletedAt: null,
          cancelledAt: null,
          personalNumber: { in: personalNumbers },
        },
        select: { personalNumber: true, actualEnd: true, plannedEnd: true },
      })
    : []

  const byPersonalNumber = new Map<string, LinkedDeparture[]>()
  for (const off of linked) {
    const key = normalizePersonalNumber(off.personalNumber)
    if (!key) continue
    const list = byPersonalNumber.get(key) ?? []
    list.push(off)
    byPersonalNumber.set(key, list)
  }

  const matchedOnboardings = onboardings.filter((row) => {
    const key = normalizePersonalNumber(row.personalNumber)
    if (!key) return false
    const candidates = byPersonalNumber.get(key) ?? []
    const probationEnd = row.probationEnd as Date
    return candidates.some((off) => {
      const exitDate = off.actualEnd ?? off.plannedEnd
      return exitDate.getTime() <= probationEnd.getTime()
    })
  })

  return { total: onboardings.length, matchedOnboardings }
}

async function getKpis(
  filters: StatisticsFilters,
  cache: RawCache
): Promise<KpiSummary> {
  const [
    onboardings,
    offboardings,
    cancelledOnboardings,
    cancelledOffboardings,
    probationMatch,
    currentHeadcount,
  ] = await Promise.all([
    fetchOnboardings({ ...filters, section: ["planned", "actual"] }, cache),
    fetchOffboardings({ ...filters, section: ["planned", "actual"] }, cache),
    fetchOnboardings({ ...filters, section: ["cancelled"] }, cache),
    fetchOffboardings({ ...filters, section: ["cancelled"] }, cache),
    getOffboardingsDuringProbationMatches(filters, cache),
    getCurrentHeadcountAsOf(filters, new Date(), cache),
  ])

  const offboardingsDuringProbationPercent = probationMatch.total
    ? Math.round(
        (probationMatch.matchedOnboardings.length / probationMatch.total) * 1000
      ) / 10
    : 0

  return {
    onboardingsTotal: onboardings.length,
    offboardingsTotal: offboardings.length,
    netGrowth: onboardings.length - offboardings.length,
    currentHeadcount,
    offboardingsDuringProbationPercent,
    onboardingsCancelledTotal: cancelledOnboardings.length,
    offboardingsCancelledTotal: cancelledOffboardings.length,
  }
}

async function getMonthlySeries(
  filters: StatisticsFilters,
  cache: RawCache
): Promise<MonthlyFlowPoint[]> {
  const { start, end } = resolveDateRange(filters)
  const [onboardings, offboardings, baselineHeadcount] = await Promise.all([
    fetchOnboardings({ ...filters, section: ["actual"] }, cache),
    fetchOffboardings({ ...filters, section: ["actual"] }, cache),
    getCurrentHeadcountAsOf(filters, start, cache),
  ])

  const months: string[] = []
  const cursor = new Date(start)
  while (cursor < end) {
    months.push(monthKey(cursor))
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  const onboardingsByMonth = new Map<string, number>()
  for (const row of onboardings) {
    const key = monthKey(row.actualStart as Date)
    onboardingsByMonth.set(key, (onboardingsByMonth.get(key) ?? 0) + 1)
  }

  const offboardingsByMonth = new Map<string, number>()
  for (const row of offboardings) {
    const key = monthKey(row.actualEnd as Date)
    offboardingsByMonth.set(key, (offboardingsByMonth.get(key) ?? 0) + 1)
  }

  let running = baselineHeadcount

  return months.map((month) => {
    const onb = onboardingsByMonth.get(month) ?? 0
    const off = offboardingsByMonth.get(month) ?? 0
    running += onb - off
    return { month, onboardings: onb, offboardings: off, headcount: running }
  })
}

async function getDepartmentFluctuation(
  filters: StatisticsFilters,
  cache: RawCache
): Promise<StatDatum[]> {
  const offboardings = await fetchOffboardings(
    { ...filters, section: ["actual"] },
    cache
  )
  const counts = new Map<string, number>()

  for (const row of offboardings) {
    const label = row.department?.trim() || "Neuvedeno"
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
}

async function getChangesByTypeMonthly(
  filters: StatisticsFilters,
  cache: RawCache
): Promise<ChangesByTypeMonthPoint[]> {
  const changes = await fetchChanges(filters, cache)
  const byMonth = new Map<string, ChangesByTypeMonthPoint>()

  for (const row of changes) {
    const key = monthKey(row.effectiveDate)
    const point = byMonth.get(key) ?? {
      month: key,
      POSITION: 0,
      NAME: 0,
      NAME_AND_POSITION: 0,
    }
    point[row.type] += 1
    byMonth.set(key, point)
  }

  return Array.from(byMonth.values()).sort((a, b) =>
    a.month.localeCompare(b.month)
  )
}

async function getProcessHealth(
  filters: StatisticsFilters,
  cache: RawCache
): Promise<ProcessHealth> {
  const [onboardings, offboardings] = await Promise.all([
    fetchOnboardings({ ...filters, section: ["actual"] }, cache),
    fetchOffboardings({ ...filters, section: ["actual"] }, cache),
  ])

  const onboardingIds = onboardings.map((row) => row.id)
  const offboardingIds = offboardings.map((row) => row.id)

  const [documents, probationRequests, exitChecklists] = await Promise.all([
    onboardingIds.length
      ? prisma.employmentDocument.findMany({
          where: { onboardingId: { in: onboardingIds }, sentAt: { not: null } },
          select: { status: true, completedAt: true, expiresAt: true },
        })
      : Promise.resolve([]),
    onboardingIds.length
      ? prisma.probationEvaluationRequest.findMany({
          where: { onboardingId: { in: onboardingIds } },
          select: { status: true, sentAt: true, completedAt: true },
        })
      : Promise.resolve([]),
    offboardingIds.length
      ? prisma.exitChecklist.findMany({
          where: { offboardingId: { in: offboardingIds } },
          select: { items: { select: { resolution: true, signedAt: true } } },
        })
      : Promise.resolve([]),
  ])

  const documentsCompletedOnTimePercent = documents.length
    ? Math.round(
        (documents.filter(
          (d) =>
            Boolean(d.completedAt) &&
            (!d.expiresAt || (d.completedAt as Date) <= d.expiresAt)
        ).length /
          documents.length) *
          1000
      ) / 10
    : 0

  const probationEvaluationsCompletedPercent = probationRequests.length
    ? Math.round(
        (probationRequests.filter((p) => p.status === "COMPLETED").length /
          probationRequests.length) *
          1000
      ) / 10
    : 0

  const withDuration = probationRequests.filter(
    (p) => p.sentAt && p.completedAt
  )
  const probationEvaluationsAvgDays = withDuration.length
    ? Math.round(
        (withDuration.reduce(
          (sum, p) =>
            sum +
            ((p.completedAt as Date).getTime() - (p.sentAt as Date).getTime()) /
              86400000,
          0
        ) /
          withDuration.length) *
          10
      ) / 10
    : null

  const exitChecklistsFullySignedPercent = exitChecklists.length
    ? Math.round(
        (exitChecklists.filter((checklist) =>
          checklist.items.every(
            (item) => item.resolution === "NOT_APPLICABLE" || item.signedAt
          )
        ).length /
          exitChecklists.length) *
          1000
      ) / 10
    : 0

  const startDeviations = onboardings
    .filter((row) => row.actualStart)
    .map((row) =>
      Math.abs(
        ((row.actualStart as Date).getTime() - row.plannedStart.getTime()) /
          86400000
      )
    )
  const avgStartDeviationDays = startDeviations.length
    ? Math.round(
        (startDeviations.reduce((a, b) => a + b, 0) / startDeviations.length) *
          10
      ) / 10
    : null

  const endDeviations = offboardings.map((row) =>
    Math.abs(
      ((row.actualEnd as Date).getTime() - row.plannedEnd.getTime()) / 86400000
    )
  )
  const avgEndDeviationDays = endDeviations.length
    ? Math.round(
        (endDeviations.reduce((a, b) => a + b, 0) / endDeviations.length) * 10
      ) / 10
    : null

  return {
    documentsCompletedOnTimePercent,
    probationEvaluationsCompletedPercent,
    probationEvaluationsAvgDays,
    exitChecklistsFullySignedPercent,
    avgStartDeviationDays,
    avgEndDeviationDays,
  }
}

export async function getStatisticsOverview(
  filters: StatisticsFilters
): Promise<StatisticsOverview> {
  const cache = createRawCache()

  const [
    kpis,
    monthlyFlow,
    departmentFluctuation,
    changesByTypeMonthly,
    processHealth,
  ] = await Promise.all([
    getKpis(filters, cache),
    getMonthlySeries(filters, cache),
    getDepartmentFluctuation(filters, cache),
    getChangesByTypeMonthly(filters, cache),
    getProcessHealth(filters, cache),
  ])

  return {
    kpis,
    monthlyFlow,
    departmentFluctuation,
    changesByTypeMonthly,
    processHealth,
  }
}

type NormalizedRow = {
  department: string | null
  unitName: string | null
  positionName: string | null
  supervisorName: string | null
  probationMonths: number | null
  positionType: string | null
  date: Date | null
  changeType: string | null
  completed: boolean | null
}

async function getCustomViewRows(
  metric: StatMetric,
  filters: StatisticsFilters,
  cache: RawCache
): Promise<NormalizedRow[]> {
  switch (metric) {
    case "onboardings": {
      const sections = filters.section?.length
        ? filters.section.filter(
            (s): s is "planned" | "actual" => s !== "cancelled"
          )
        : (["planned", "actual"] as const)
      const rows = await fetchOnboardings(
        { ...filters, section: [...sections] },
        cache
      )
      return rows.map((row) => ({
        department: row.department,
        unitName: row.unitName,
        positionName: row.positionName,
        supervisorName: row.supervisorName ?? row.mentorName,
        probationMonths: row.probationMonths,
        positionType: row.positionType,
        date: onboardingRelevantDate(row),
        changeType: null,
        completed: null,
      }))
    }
    case "onboardingsCancelled": {
      const rows = await fetchOnboardings(
        { ...filters, section: ["cancelled"] },
        cache
      )
      return rows.map((row) => ({
        department: row.department,
        unitName: row.unitName,
        positionName: row.positionName,
        supervisorName: row.supervisorName ?? row.mentorName,
        probationMonths: row.probationMonths,
        positionType: row.positionType,
        date: onboardingRelevantDate(row),
        changeType: null,
        completed: null,
      }))
    }
    case "offboardings": {
      const sections = filters.section?.length
        ? filters.section.filter(
            (s): s is "planned" | "actual" => s !== "cancelled"
          )
        : (["planned", "actual"] as const)
      const rows = await fetchOffboardings(
        { ...filters, section: [...sections] },
        cache
      )
      return rows.map((row) => ({
        department: row.department,
        unitName: row.unitName,
        positionName: row.positionName,
        supervisorName: null,
        probationMonths: null,
        positionType: null,
        date: offboardingRelevantDate(row),
        changeType: null,
        completed: null,
      }))
    }
    case "offboardingsCancelled": {
      const rows = await fetchOffboardings(
        { ...filters, section: ["cancelled"] },
        cache
      )
      return rows.map((row) => ({
        department: row.department,
        unitName: row.unitName,
        positionName: row.positionName,
        supervisorName: null,
        probationMonths: null,
        positionType: null,
        date: offboardingRelevantDate(row),
        changeType: null,
        completed: null,
      }))
    }
    case "offboardingsDuringProbation": {
      const { matchedOnboardings } =
        await getOffboardingsDuringProbationMatches(filters, cache)
      return matchedOnboardings.map((row) => ({
        department: row.department,
        unitName: row.unitName,
        positionName: row.positionName,
        supervisorName: row.supervisorName ?? row.mentorName,
        probationMonths: row.probationMonths,
        positionType: row.positionType,
        date: row.actualStart,
        changeType: null,
        completed: null,
      }))
    }
    case "changes": {
      const rows = await fetchChanges(filters, cache)
      return rows.map((row) => ({
        department: row.newDepartment ?? row.oldDepartment,
        unitName: row.newUnitName ?? row.oldUnitName,
        positionName: row.newPositionName ?? row.oldPositionName,
        supervisorName: null,
        probationMonths: null,
        positionType: null,
        date: row.effectiveDate,
        changeType: row.type,
        completed: null,
      }))
    }
    case "documentsCompletion": {
      const onboardings = await fetchOnboardings(
        { ...filters, section: ["actual"] },
        cache
      )
      const onboardingById = new Map(onboardings.map((row) => [row.id, row]))
      const ids = onboardings.map((row) => row.id)
      if (!ids.length) return []

      const documents = await prisma.employmentDocument.findMany({
        where: { onboardingId: { in: ids }, sentAt: { not: null } },
        select: { onboardingId: true, completedAt: true, expiresAt: true },
      })

      return documents.flatMap((doc) => {
        const onboarding = onboardingById.get(doc.onboardingId)
        if (!onboarding) return []
        return [
          {
            department: onboarding.department,
            unitName: onboarding.unitName,
            positionName: onboarding.positionName,
            supervisorName: onboarding.supervisorName ?? onboarding.mentorName,
            probationMonths: onboarding.probationMonths,
            positionType: onboarding.positionType,
            date: onboardingRelevantDate(onboarding),
            changeType: null,
            completed:
              Boolean(doc.completedAt) &&
              (!doc.expiresAt || (doc.completedAt as Date) <= doc.expiresAt),
          },
        ]
      })
    }
    case "probationEvaluationCompletion": {
      const onboardings = await fetchOnboardings(
        { ...filters, section: ["actual"] },
        cache
      )
      const onboardingById = new Map(onboardings.map((row) => [row.id, row]))
      const ids = onboardings.map((row) => row.id)
      if (!ids.length) return []

      const requests = await prisma.probationEvaluationRequest.findMany({
        where: { onboardingId: { in: ids } },
        select: { onboardingId: true, status: true },
      })

      return requests.flatMap((request) => {
        const onboarding = onboardingById.get(request.onboardingId)
        if (!onboarding) return []
        return [
          {
            department: onboarding.department,
            unitName: onboarding.unitName,
            positionName: onboarding.positionName,
            supervisorName: onboarding.supervisorName ?? onboarding.mentorName,
            probationMonths: onboarding.probationMonths,
            positionType: onboarding.positionType,
            date: onboardingRelevantDate(onboarding),
            changeType: null,
            completed: request.status === "COMPLETED",
          },
        ]
      })
    }
    default:
      return []
  }
}

function dimensionLabelFor(
  dimension: StatDimension,
  row: NormalizedRow
): string {
  switch (dimension) {
    case "department":
      return row.department?.trim() || "Neuvedeno"
    case "unitName":
      return row.unitName?.trim() || "Neuvedeno"
    case "positionName":
      return row.positionName?.trim() || "Neuvedeno"
    case "supervisor":
      return row.supervisorName?.trim() || "Neuvedeno"
    case "probationLength":
      return row.probationMonths ? `${row.probationMonths} měs.` : "Neuvedeno"
    case "positionType":
      return row.positionType === "MANAGERIAL" ? "Manažerská" : "Běžná"
    case "changeType":
      return row.changeType ?? "Neuvedeno"
    case "month":
      return row.date ? monthKey(row.date) : "Neuvedeno"
    default:
      return "Neuvedeno"
  }
}

export async function getCustomView(
  request: CustomViewRequest
): Promise<CustomViewResult> {
  const { metric, dimension, filters } = request
  const cache = createRawCache()
  const rows = await getCustomViewRows(metric, filters, cache)

  const isCompletionMetric =
    metric === "documentsCompletion" ||
    metric === "probationEvaluationCompletion"

  const groups = new Map<string, { total: number; completed: number }>()

  for (const row of rows) {
    const label = dimensionLabelFor(dimension, row)
    const group = groups.get(label) ?? { total: 0, completed: 0 }
    group.total += 1
    if (row.completed) group.completed += 1
    groups.set(label, group)
  }

  const data: StatDatum[] = Array.from(groups.entries())
    .map(([label, group]) => ({
      label,
      value: isCompletionMetric
        ? group.total
          ? Math.round((group.completed / group.total) * 1000) / 10
          : 0
        : group.total,
    }))
    .sort((a, b) => b.value - a.value)

  return { data }
}

export async function getStatisticsFilterOptions(): Promise<StatisticsFilterOptions> {
  const [onboardings, offboardings, changes] = await Promise.all([
    prisma.employeeOnboarding.findMany({
      where: { deletedAt: null },
      select: {
        department: true,
        unitName: true,
        positionName: true,
        plannedStart: true,
        actualStart: true,
        cancelledAt: true,
      },
    }),
    prisma.employeeOffboarding.findMany({
      where: { deletedAt: null },
      select: {
        department: true,
        unitName: true,
        positionName: true,
        plannedEnd: true,
        actualEnd: true,
      },
    }),
    prisma.employeeChange.findMany({
      where: { deletedAt: null },
      select: { effectiveDate: true },
    }),
  ])

  const departments = new Set<string>()
  const unitNames = new Set<string>()
  const positionNames = new Set<string>()
  const years = new Set<number>([new Date().getFullYear()])

  for (const row of [...onboardings, ...offboardings]) {
    if (row.department) departments.add(row.department)
    if (row.unitName) unitNames.add(row.unitName)
    if (row.positionName) positionNames.add(row.positionName)
  }

  for (const row of onboardings) {
    if (row.actualStart) years.add(row.actualStart.getFullYear())
    if (row.plannedStart) years.add(row.plannedStart.getFullYear())
    if (row.cancelledAt) years.add(row.cancelledAt.getFullYear())
  }
  for (const row of offboardings) {
    if (row.actualEnd) years.add(row.actualEnd.getFullYear())
    if (row.plannedEnd) years.add(row.plannedEnd.getFullYear())
  }
  for (const row of changes) {
    years.add(row.effectiveDate.getFullYear())
  }

  return {
    departments: Array.from(departments).sort(),
    unitNames: Array.from(unitNames).sort(),
    positionNames: Array.from(positionNames).sort(),
    years: Array.from(years).sort((a, b) => b - a),
  }
}

export type { ChangeRow, OffboardingRow, OnboardingRow }
