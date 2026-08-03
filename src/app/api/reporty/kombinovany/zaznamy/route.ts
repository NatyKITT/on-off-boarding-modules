import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { endOfMonth, startOfMonth } from "date-fns"

import { prisma } from "@/lib/db"
import { canReadMonthlyReports } from "@/lib/rbac"

type Audience = "ONBOARDING_GROUP" | "ALL_EMPLOYEES"
type RecordKind = "planned" | "actual"
type ChangeType = "POSITION" | "NAME" | "NAME_AND_POSITION"

export type CombinedOnboardingRow = {
  id: number
  name: string
  surname: string
  titleBefore: string | null
  titleAfter: string | null
  date: string | null
  position: string | null
  department: string | null
  personalNumber: string | null
  positionNum: string | null
  month: string
  kind: RecordKind
  wasSent: boolean
  sentDate: string | null
}

export type CombinedOffboardingRow = {
  id: number
  name: string
  surname: string
  titleBefore: string | null
  titleAfter: string | null
  date: string | null
  position: string | null
  department: string | null
  personalNumber: string | null
  positionNum: string | null
  month: string
  kind: RecordKind
  wasSent: boolean
  sentDate: string | null
}

export type CombinedChangeRow = {
  id: number
  type: ChangeType
  status: string
  employeeName: string
  personalNumber: string | null
  position: string | null
  positionNum: string | null
  department: string | null
  effectiveDate: string
  month: string

  oldTitleBefore: string | null
  newTitleBefore: string | null
  oldName: string | null
  newName: string | null
  oldSurname: string | null
  newSurname: string | null
  oldTitleAfter: string | null
  newTitleAfter: string | null

  oldDepartment: string | null
  newDepartment: string | null
  oldUnitName: string | null
  newUnitName: string | null
  oldPositionName: string | null
  newPositionName: string | null
  oldPositionNum: string | null
  newPositionNum: string | null

  wasSent: boolean
  sentDate: string | null
}

function fullName(p: {
  titleBefore: string | null
  name: string
  surname: string
  titleAfter: string | null
}) {
  return [p.titleBefore, p.name, p.surname, p.titleAfter]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number)
  const start = startOfMonth(new Date(y, m - 1))
  const end = endOfMonth(start)
  return { start, end }
}

function monthOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function parseCsvKinds(value: string | null): RecordKind[] {
  return Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter((v): v is RecordKind => v === "planned" || v === "actual")
    )
  )
}

function parseCsvChangeTypes(value: string | null): ChangeType[] {
  const valid: ChangeType[] = ["POSITION", "NAME", "NAME_AND_POSITION"]
  return Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter((v): v is ChangeType => (valid as string[]).includes(v))
    )
  )
}

export async function GET(req: Request) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canReadMonthlyReports(session.user.role)) {
    return NextResponse.json(
      { error: "Nemáte oprávnění zobrazit měsíční reporty." },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(req.url)

  const monthsParam = searchParams.get("months") || ""
  const months = Array.from(
    new Set(
      monthsParam
        .split(",")
        .map((m) => m.trim())
        .filter((m) => /^\d{4}-\d{2}$/.test(m))
    )
  )

  if (!months.length) {
    return NextResponse.json(
      { error: "Vyberte alespoň jeden měsíc." },
      { status: 400 }
    )
  }

  const audienceParam = searchParams.get("audience")
  const audience: Audience =
    audienceParam === "ALL_EMPLOYEES" ? "ALL_EMPLOYEES" : "ONBOARDING_GROUP"

  const onboardingKinds = parseCsvKinds(searchParams.get("onboardingKinds"))
  const offboardingKinds = parseCsvKinds(searchParams.get("offboardingKinds"))
  const changeTypes = parseCsvChangeTypes(searchParams.get("changeTypes"))

  const ranges = months.map((m) => ({ month: m, ...monthRange(m) }))
  const overallStart = ranges.reduce(
    (min, r) => (r.start < min ? r.start : min),
    ranges[0].start
  )
  const overallEnd = ranges.reduce(
    (max, r) => (r.end > max ? r.end : max),
    ranges[0].end
  )
  const monthSet = new Set(months)

  // Nástupy/odchody se sledují jako odeslané podle (měsíc, plánované/skutečné) -
  // nezávisle na tom, komu se report posílá.
  const [onboardingReports, offboardingReports, changeReports] =
    await Promise.all([
      prisma.monthlyReport.findMany({
        where: {
          month: { in: months },
          reportType: { in: ["planned", "actual"] },
        },
        include: {
          records: {
            select: { recordType: true, recordId: true, sentAt: true },
          },
        },
      }),
      prisma.monthlyReport.findMany({
        where: {
          month: { in: months },
          reportType: { in: ["planned", "actual"] },
        },
        include: {
          records: {
            select: { recordType: true, recordId: true, sentAt: true },
          },
        },
      }),
      prisma.monthlyReport.findMany({
        where: {
          month: { in: months },
          reportType: `employee_changes_${audience.toLowerCase()}`,
        },
        include: {
          records: {
            select: { recordType: true, recordId: true, sentAt: true },
          },
        },
      }),
    ])

  const onboardingSentMap = new Map<string, Date>()
  for (const report of onboardingReports) {
    for (const record of report.records) {
      if (record.recordType === `onboarding_${report.reportType}`) {
        onboardingSentMap.set(
          `${report.reportType}-${report.month}-${record.recordId}`,
          record.sentAt
        )
      }
    }
  }

  const offboardingSentMap = new Map<string, Date>()
  for (const report of offboardingReports) {
    for (const record of report.records) {
      if (record.recordType === `offboarding_${report.reportType}`) {
        offboardingSentMap.set(
          `${report.reportType}-${report.month}-${record.recordId}`,
          record.sentAt
        )
      }
    }
  }

  const changeSentMap = new Map<string, Date>()
  for (const report of changeReports) {
    for (const record of report.records) {
      if (record.recordType === "employee_change") {
        changeSentMap.set(`${report.month}-${record.recordId}`, record.sentAt)
      }
    }
  }

  const wantOnboardingPlanned = onboardingKinds.includes("planned")
  const wantOnboardingActual = onboardingKinds.includes("actual")
  const wantOffboardingPlanned = offboardingKinds.includes("planned")
  const wantOffboardingActual = offboardingKinds.includes("actual")

  const onboardingWhereOr = [
    ...(wantOnboardingPlanned
      ? [
          {
            actualStart: null,
            plannedStart: { gte: overallStart, lte: overallEnd },
          },
        ]
      : []),
    ...(wantOnboardingActual
      ? [{ actualStart: { gte: overallStart, lte: overallEnd } }]
      : []),
  ]

  const offboardingWhereOr = [
    ...(wantOffboardingPlanned
      ? [
          {
            actualEnd: null,
            plannedEnd: { gte: overallStart, lte: overallEnd },
          },
        ]
      : []),
    ...(wantOffboardingActual
      ? [{ actualEnd: { gte: overallStart, lte: overallEnd } }]
      : []),
  ]

  const changesWhere =
    changeTypes.length > 0
      ? {
          deletedAt: null,
          status: { not: "CANCELLED" as const },
          effectiveDate: { gte: overallStart, lte: overallEnd },
          ...(changeTypes.length < 3 ? { type: { in: changeTypes } } : {}),
        }
      : null

  const [onboardingRows, offboardingRows, changeRows] = await Promise.all([
    onboardingWhereOr.length
      ? prisma.employeeOnboarding.findMany({
          where: { deletedAt: null, OR: onboardingWhereOr },
          orderBy: [{ plannedStart: "asc" }, { surname: "asc" }],
          select: {
            id: true,
            name: true,
            surname: true,
            titleBefore: true,
            titleAfter: true,
            plannedStart: true,
            actualStart: true,
            positionName: true,
            department: true,
            personalNumber: true,
            positionNum: true,
          },
        })
      : Promise.resolve([]),
    offboardingWhereOr.length
      ? prisma.employeeOffboarding.findMany({
          where: { deletedAt: null, OR: offboardingWhereOr },
          orderBy: [{ plannedEnd: "asc" }, { surname: "asc" }],
          select: {
            id: true,
            name: true,
            surname: true,
            titleBefore: true,
            titleAfter: true,
            plannedEnd: true,
            actualEnd: true,
            positionName: true,
            department: true,
            personalNumber: true,
            positionNum: true,
          },
        })
      : Promise.resolve([]),
    changesWhere
      ? prisma.employeeChange.findMany({
          where: changesWhere,
          orderBy: [
            { effectiveDate: "asc" },
            { surname: "asc" },
            { id: "asc" },
          ],
        })
      : Promise.resolve([]),
  ])

  const onboardings: CombinedOnboardingRow[] = onboardingRows
    .map((o) => {
      const kind: RecordKind = o.actualStart ? "actual" : "planned"
      const date = kind === "actual" ? o.actualStart : o.plannedStart
      const month = date ? monthOf(date) : null

      return { o, kind, date, month }
    })
    .filter(({ month }) => month && monthSet.has(month))
    .map(({ o, kind, date, month }) => {
      const sentAt = onboardingSentMap.get(`${kind}-${month}-${o.id}`) ?? null

      return {
        id: o.id,
        name: o.name,
        surname: o.surname,
        titleBefore: o.titleBefore,
        titleAfter: o.titleAfter,
        date: date?.toISOString() ?? null,
        position: o.positionName,
        department: o.department,
        personalNumber: o.personalNumber ? String(o.personalNumber) : null,
        positionNum: o.positionNum ? String(o.positionNum) : null,
        month: month as string,
        kind,
        wasSent: Boolean(sentAt),
        sentDate: sentAt ? sentAt.toISOString() : null,
      }
    })

  const offboardings: CombinedOffboardingRow[] = offboardingRows
    .map((o) => {
      const kind: RecordKind = o.actualEnd ? "actual" : "planned"
      const date = kind === "actual" ? o.actualEnd : o.plannedEnd
      const month = date ? monthOf(date) : null

      return { o, kind, date, month }
    })
    .filter(({ month }) => month && monthSet.has(month))
    .map(({ o, kind, date, month }) => {
      const sentAt = offboardingSentMap.get(`${kind}-${month}-${o.id}`) ?? null

      return {
        id: o.id,
        name: o.name,
        surname: o.surname,
        titleBefore: o.titleBefore,
        titleAfter: o.titleAfter,
        date: date?.toISOString() ?? null,
        position: o.positionName,
        department: o.department,
        personalNumber: o.personalNumber ? String(o.personalNumber) : null,
        positionNum: o.positionNum ? String(o.positionNum) : null,
        month: month as string,
        kind,
        wasSent: Boolean(sentAt),
        sentDate: sentAt ? sentAt.toISOString() : null,
      }
    })

  const changes: CombinedChangeRow[] = changeRows
    .map((c) => ({ c, month: monthOf(c.effectiveDate) }))
    .filter(({ month }) => monthSet.has(month))
    .map(({ c, month }) => {
      const sentAt = changeSentMap.get(`${month}-${c.id}`) ?? null

      return {
        id: c.id,
        type: c.type,
        status: c.status,
        employeeName: fullName(c),
        personalNumber: c.personalNumber,
        position: c.newPositionName ?? c.oldPositionName,
        positionNum: c.newPositionNum ?? c.oldPositionNum,
        department: c.newDepartment ?? c.oldDepartment,
        effectiveDate: c.effectiveDate.toISOString(),
        month,

        oldTitleBefore: c.oldTitleBefore,
        newTitleBefore: c.newTitleBefore,
        oldName: c.oldName,
        newName: c.newName,
        oldSurname: c.oldSurname,
        newSurname: c.newSurname,
        oldTitleAfter: c.oldTitleAfter,
        newTitleAfter: c.newTitleAfter,

        oldDepartment: c.oldDepartment,
        newDepartment: c.newDepartment,
        oldUnitName: c.oldUnitName,
        newUnitName: c.newUnitName,
        oldPositionName: c.oldPositionName,
        newPositionName: c.newPositionName,
        oldPositionNum: c.oldPositionNum,
        newPositionNum: c.newPositionNum,

        wasSent: Boolean(sentAt),
        sentDate: sentAt ? sentAt.toISOString() : null,
      }
    })

  return NextResponse.json({ onboardings, offboardings, changes })
}
