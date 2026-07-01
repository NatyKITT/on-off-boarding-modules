import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { endOfMonth, format, startOfMonth } from "date-fns"

import { prisma } from "@/lib/db"
import { canReadMonthlyReports } from "@/lib/rbac"

type Audience = "ONBOARDING_GROUP" | "ALL_EMPLOYEES"
type ChangeType = "all" | "POSITION" | "NAME" | "NAME_AND_POSITION"

export type EmployeeChangeReportRow = {
  id: number
  type: "POSITION" | "NAME" | "NAME_AND_POSITION"
  status: string
  audience: string | null

  employeeName: string
  personalNumber: string | null
  effectiveDate: string

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

const REPORT_TYPE_PREFIX = "employee_changes"
const RECORD_TYPE = "employee_change"

function fullName(change: {
  titleBefore: string | null
  name: string
  surname: string
  titleAfter: string | null
}) {
  return [change.titleBefore, change.name, change.surname, change.titleAfter]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

function getReportType(audience: Audience) {
  return `${REPORT_TYPE_PREFIX}_${audience.toLowerCase()}`
}

export async function GET(req: Request) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canReadMonthlyReports(session.user.role)) {
    return NextResponse.json(
      { error: "Nemáte oprávnění zobrazit měsíční reporty změn." },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(req.url)

  const month = searchParams.get("month") || format(new Date(), "yyyy-MM")
  const audienceParam = searchParams.get("audience")
  const audience: Audience =
    audienceParam === "ONBOARDING_GROUP" || audienceParam === "ALL_EMPLOYEES"
      ? audienceParam
      : "ONBOARDING_GROUP"

  const changeTypeParam = searchParams.get("changeType")
  const changeType: ChangeType =
    changeTypeParam === "POSITION" ||
    changeTypeParam === "NAME" ||
    changeTypeParam === "NAME_AND_POSITION"
      ? changeTypeParam
      : "all"

  const [year, monthNumber] = month.split("-").map(Number)

  if (!Number.isFinite(year) || !Number.isFinite(monthNumber)) {
    return NextResponse.json(
      { error: "Neplatný měsíc reportu." },
      { status: 400 }
    )
  }

  const monthStart = startOfMonth(new Date(year, monthNumber - 1))
  const monthEnd = endOfMonth(monthStart)

  const monthly = await prisma.monthlyReport.findUnique({
    where: {
      month_reportType: {
        month,
        reportType: getReportType(audience),
      },
    },
    include: {
      records: {
        select: {
          recordType: true,
          recordId: true,
          sentAt: true,
        },
      },
    },
  })

  const sentMap = new Map<number, Date>()

  for (const record of monthly?.records ?? []) {
    if (record.recordType === RECORD_TYPE) {
      sentMap.set(record.recordId, record.sentAt)
    }
  }

  const rows = await prisma.employeeChange.findMany({
    where: {
      deletedAt: null,
      status: {
        not: "CANCELLED",
      },
      effectiveDate: {
        gte: monthStart,
        lte: monthEnd,
      },
      ...(changeType !== "all" ? { type: changeType } : {}),
    },
    orderBy: [{ effectiveDate: "asc" }, { surname: "asc" }, { id: "asc" }],
  })

  const records: EmployeeChangeReportRow[] = rows.map((change) => {
    const sentAt = sentMap.get(change.id) ?? null

    return {
      id: change.id,
      type: change.type,
      status: change.status,
      audience: change.audience,

      employeeName: fullName(change),
      personalNumber: change.personalNumber,
      effectiveDate: change.effectiveDate.toISOString(),

      oldTitleBefore: change.oldTitleBefore,
      newTitleBefore: change.newTitleBefore,
      oldName: change.oldName,
      newName: change.newName,
      oldSurname: change.oldSurname,
      newSurname: change.newSurname,
      oldTitleAfter: change.oldTitleAfter,
      newTitleAfter: change.newTitleAfter,

      oldDepartment: change.oldDepartment,
      newDepartment: change.newDepartment,
      oldUnitName: change.oldUnitName,
      newUnitName: change.newUnitName,
      oldPositionName: change.oldPositionName,
      newPositionName: change.newPositionName,
      oldPositionNum: change.oldPositionNum,
      newPositionNum: change.newPositionNum,

      wasSent: Boolean(sentAt),
      sentDate: sentAt ? sentAt.toISOString() : null,
    }
  })

  return NextResponse.json({ records })
}
