import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { endOfMonth, format, startOfMonth } from "date-fns"

import { prisma } from "@/lib/db"

type Kind = "planned" | "actual"
type TypeFilter = "nastupy" | "odchody"
type RecordType = "onboarding" | "offboarding"

export type RecordRow = {
  id: number
  name: string
  surname: string
  titleBefore?: string | null
  titleAfter?: string | null
  date: string | null
  position: string | null
  department: string | null
  type: RecordType
  isPlanned: boolean
  wasSent: boolean
  sentDate: string | null
  email: string | null
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month = searchParams.get("month") || format(new Date(), "yyyy-MM")
  const kind = (searchParams.get("kind") as Kind) || "actual"
  const type = (searchParams.get("type") as TypeFilter) || "nastupy"
  const includeOtherType = searchParams.get("includeOtherType") === "true"

  const [y, m] = month.split("-").map(Number)
  const monthStart = startOfMonth(new Date(y, m - 1))
  const monthEnd = endOfMonth(monthStart)

  const monthly = await prisma.monthlyReport.findUnique({
    where: { month_reportType: { month, reportType: kind } },
    include: {
      records: { select: { recordType: true, recordId: true, sentAt: true } },
    },
  })
  const sentMap = new Map<string, Date>()
  for (const r of monthly?.records ?? []) {
    sentMap.set(`${r.recordType}-${r.recordId}`, r.sentAt)
  }

  const out: RecordRow[] = []

  // NÁSTUPY
  if (type === "nastupy" || includeOtherType) {
    const where =
      kind === "planned"
        ? {
            deletedAt: null,
            actualStart: null,
            plannedStart: { gte: monthStart, lte: monthEnd },
          }
        : { deletedAt: null, actualStart: { gte: monthStart, lte: monthEnd } }

    const rows = await prisma.employeeOnboarding.findMany({
      where,
      orderBy: [
        kind === "planned" ? { plannedStart: "asc" } : { actualStart: "asc" },
        { surname: "asc" },
      ],
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
        unitName: true,
        email: true,
      },
    })

    for (const o of rows) {
      const key = `onboarding_${kind}-${o.id}`
      const sentAt = sentMap.get(key) ?? null
      out.push({
        id: o.id,
        name: o.name,
        surname: o.surname,
        titleBefore: o.titleBefore ?? null,
        titleAfter: o.titleAfter ?? null,
        date:
          (kind === "planned"
            ? o.plannedStart
            : o.actualStart
          )?.toISOString() ?? null,
        position: o.positionName ?? null,
        department: o.department ?? null,
        type: "onboarding",
        isPlanned: kind === "planned",
        wasSent: Boolean(sentAt),
        sentDate: sentAt ? sentAt.toISOString() : null,
        email: o.email ?? null,
      })
    }
  }

  // ODCHODY
  if (type === "odchody" || includeOtherType) {
    const where =
      kind === "planned"
        ? {
            deletedAt: null,
            actualEnd: null,
            plannedEnd: { gte: monthStart, lte: monthEnd },
          }
        : { deletedAt: null, actualEnd: { gte: monthStart, lte: monthEnd } }

    const rows = await prisma.employeeOffboarding.findMany({
      where,
      orderBy: [
        kind === "planned" ? { plannedEnd: "asc" } : { actualEnd: "asc" },
        { surname: "asc" },
      ],
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
      },
    })

    for (const o of rows) {
      const key = `offboarding_${kind}-${o.id}`
      const sentAt = sentMap.get(key) ?? null
      out.push({
        id: o.id,
        name: o.name,
        surname: o.surname,
        titleBefore: o.titleBefore ?? null,
        titleAfter: o.titleAfter ?? null,
        date:
          (kind === "planned" ? o.plannedEnd : o.actualEnd)?.toISOString() ??
          null,
        position: o.positionName ?? null,
        department: o.department ?? null,
        type: "offboarding",
        isPlanned: kind === "planned",
        wasSent: Boolean(sentAt),
        sentDate: sentAt ? sentAt.toISOString() : null,
        email: null,
      })
    }
  }

  return NextResponse.json({ records: out })
}
