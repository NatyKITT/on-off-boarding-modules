import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { endOfMonth, format, startOfMonth } from "date-fns"
import { cs } from "date-fns/locale"
import { z } from "zod"

import { prisma } from "@/lib/db"

// ---------- Typy ----------
type OnboardingStatus = "NEW" | "IN_PROGRESS" | "COMPLETED"
type OffboardingStatus = "NEW" | "IN_PROGRESS" | "COMPLETED"
type ReportType = "onboarding" | "offboarding" | "combined"

type SessionUser = { id?: string | null; email?: string | null }

type OnbRow = {
  id: number
  name: string
  surname: string
  email: string | null
  positionName: string
  department: string
  unitName: string
  plannedStart: Date | null
  actualStart: Date | null
  status: OnboardingStatus
  createdAt: Date
}

type OffbRow = {
  id: number
  name: string
  surname: string
  userEmail: string | null
  positionName: string
  department: string
  unitName: string
  plannedEnd: Date | null
  actualEnd: Date | null
  status: OffboardingStatus
  createdAt: Date
}

type DeptBreakdown = Record<string, number>
type StatusBreakdown<S extends string> = Record<S | "NEW", number>

type OnbSection = {
  planned: OnbRow[]
  actual: OnbRow[]
  summary: {
    totalPlanned: number
    totalActual: number
    byDepartment: DeptBreakdown
    statusBreakdown: StatusBreakdown<OnboardingStatus>
  }
}

type OffbSection = {
  planned: OffbRow[]
  actual: OffbRow[]
  summary: {
    totalPlanned: number
    totalActual: number
    byDepartment: DeptBreakdown
    statusBreakdown: StatusBreakdown<OffboardingStatus>
  }
}

type MonthlyReportData = {
  onboarding?: OnbSection
  offboarding?: OffbSection
}

// ---------- Validace vstupu ----------
const bodySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/), // "2024-01"
  reportType: z.enum(["onboarding", "offboarding", "combined"]),
  recipients: z.array(z.string().email()).min(1),
  includeDetails: z.boolean().default(true),
  sendEmail: z.boolean().default(true),
})

// ---------- POST: vygeneruje report + případně enqueuuje email ----------
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  // pouze HR/ADMIN
  const me = await prisma.user.findUnique({
    where: { email: session.user.email! },
    select: { role: true },
  })
  if (!me || !["HR", "ADMIN"].includes(me.role)) {
    return NextResponse.json(
      { status: "error", message: "Nemáte oprávnění k této akci." },
      { status: 403 }
    )
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      {
        status: "error",
        message: "Neplatná data požadavku.",
        errors: parsed.error.errors,
      },
      { status: 400 }
    )
  }

  const { month, reportType, recipients, includeDetails, sendEmail } =
    parsed.data

  try {
    const monthDate = new Date(`${month}-01`)
    const monthStart = startOfMonth(monthDate)
    const monthEnd = endOfMonth(monthDate)

    const createdBy = ((session.user as SessionUser).id ??
      session.user.email ??
      "unknown") as string

    const reportData: MonthlyReportData = {}

    // ONBOARDING část
    if (reportType === "onboarding" || reportType === "combined") {
      const [plannedOnb, actualOnb] = await Promise.all([
        prisma.employeeOnboarding.findMany({
          where: {
            deletedAt: null,
            plannedStart: { gte: monthStart, lte: monthEnd },
          },
          select: {
            id: true,
            name: true,
            surname: true,
            email: true,
            positionName: true,
            department: true,
            unitName: true,
            plannedStart: true,
            actualStart: true,
            status: true,
            createdAt: true,
          },
          orderBy: { plannedStart: "asc" },
        }),
        prisma.employeeOnboarding.findMany({
          where: {
            deletedAt: null,
            actualStart: { gte: monthStart, lte: monthEnd },
          },
          select: {
            id: true,
            name: true,
            surname: true,
            email: true,
            positionName: true,
            department: true,
            unitName: true,
            plannedStart: true,
            actualStart: true,
            status: true,
            createdAt: true,
          },
          orderBy: { actualStart: "asc" },
        }),
      ])

      const planned = plannedOnb as unknown as OnbRow[]
      const actual = actualOnb as unknown as OnbRow[]

      reportData.onboarding = {
        planned,
        actual,
        summary: {
          totalPlanned: planned.length,
          totalActual: actual.length,
          byDepartment: groupByDepartment(planned),
          statusBreakdown: groupByStatus<OnboardingStatus>(planned, "NEW"),
        },
      }
    }

    // OFFBOARDING část
    if (reportType === "offboarding" || reportType === "combined") {
      const [plannedOffb, actualOffb] = await Promise.all([
        prisma.employeeOffboarding.findMany({
          where: {
            deletedAt: null,
            plannedEnd: { gte: monthStart, lte: monthEnd },
          },
          select: {
            id: true,
            name: true,
            surname: true,
            userEmail: true,
            positionName: true,
            department: true,
            unitName: true,
            plannedEnd: true,
            actualEnd: true,
            status: true,
            createdAt: true,
          },
          orderBy: { plannedEnd: "asc" },
        }),
        prisma.employeeOffboarding.findMany({
          where: {
            deletedAt: null,
            actualEnd: { gte: monthStart, lte: monthEnd },
          },
          select: {
            id: true,
            name: true,
            surname: true,
            userEmail: true,
            positionName: true,
            department: true,
            unitName: true,
            plannedEnd: true,
            actualEnd: true,
            status: true,
            createdAt: true,
          },
          orderBy: { actualEnd: "asc" },
        }),
      ])

      const planned = plannedOffb as unknown as OffbRow[]
      const actual = actualOffb as unknown as OffbRow[]

      reportData.offboarding = {
        planned,
        actual,
        summary: {
          totalPlanned: planned.length,
          totalActual: actual.length,
          byDepartment: groupByDepartment(planned),
          statusBreakdown: groupByStatus<OffboardingStatus>(planned, "NEW"),
        },
      }
    }

    // uložit report
    const monthlyReport = await prisma.monthlyReport.create({
      data: {
        month,
        reportType,
        recipients, // JSON column – Prisma se postará o serializaci
        generatedBy: createdBy,
        data: reportData, // JSON column
        sentAt: sendEmail ? new Date() : null,
      },
    })

    // enqueue do Resend workeru přes MailQueue
    if (sendEmail) {
      const monthNameCz = format(monthDate, "LLLL yyyy", { locale: cs })
      await prisma.mailQueue.create({
        data: {
          type: "MONTHLY_SUMMARY",
          payload: {
            reportId: monthlyReport.id,
            month,
            monthName: monthNameCz,
            reportType,
            recipients,
            data: reportData,
            includeDetails,
            subject: `Měsíční přehled ${getReportTypeName(reportType)} - ${monthNameCz}`,
          },
          priority: 4,
          createdBy,
        },
      })
    }

    return NextResponse.json({
      status: "success",
      message: sendEmail
        ? "Report byl vygenerován a odeslán."
        : "Report byl vygenerován.",
      data: {
        reportId: monthlyReport.id,
        month,
        reportType,
        recipients,
        summary: {
          onboarding: reportData.onboarding?.summary,
          offboarding: reportData.offboarding?.summary,
        },
      },
    })
  } catch (error) {
    console.error("Chyba při generování měsíčního reportu:", error)
    return NextResponse.json(
      {
        status: "error",
        message: "Chyba při generování reportu.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

// ---------- GET: seznam dostupných měsíců a existujících reportů ----------
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(req.url)
  const year = searchParams.get("year") || new Date().getFullYear().toString()

  try {
    const existingReports = await prisma.monthlyReport.findMany({
      where: { month: { startsWith: year } },
      select: {
        id: true,
        month: true,
        reportType: true,
        recipients: true,
        generatedBy: true,
        sentAt: true,
        createdAt: true,
      },
      orderBy: { month: "desc" },
    })

    const availableMonths = await getAvailableMonths(year)

    return NextResponse.json({
      status: "success",
      data: { existingReports, availableMonths, year },
    })
  } catch (error) {
    console.error("Chyba při načítání reportů:", error)
    return NextResponse.json(
      { status: "error", message: "Chyba při načítání dat." },
      { status: 500 }
    )
  }
}

// ---------- Helpery (bez any) ----------
function groupByDepartment<T extends { department: string | null | undefined }>(
  employees: T[]
): DeptBreakdown {
  return employees.reduce<DeptBreakdown>((acc, emp) => {
    const dept = emp.department || "Nespecifikováno"
    acc[dept] = (acc[dept] ?? 0) + 1
    return acc
  }, {})
}

function groupByStatus<S extends string>(
  employees: { status: S | null | undefined }[],
  fallback: S
): StatusBreakdown<S> {
  return employees.reduce<StatusBreakdown<S>>((acc, emp) => {
    const key = (emp.status ?? fallback) as S
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {} as StatusBreakdown<S>)
}

function getReportTypeName(type: ReportType) {
  switch (type) {
    case "onboarding":
      return "nástupy"
    case "offboarding":
      return "odchody"
    case "combined":
      return "nástupy a odchody"
  }
}

async function getAvailableMonths(year: string) {
  const startDate = new Date(`${year}-01-01`)
  const endDate = new Date(`${year}-12-31`)

  const [onb, offb] = await Promise.all([
    prisma.employeeOnboarding.findMany({
      where: {
        deletedAt: null,
        OR: [
          { plannedStart: { gte: startDate, lte: endDate } },
          { actualStart: { gte: startDate, lte: endDate } },
        ],
      },
      select: { plannedStart: true, actualStart: true },
    }),
    prisma.employeeOffboarding.findMany({
      where: {
        deletedAt: null,
        OR: [
          { plannedEnd: { gte: startDate, lte: endDate } },
          { actualEnd: { gte: startDate, lte: endDate } },
        ],
      },
      select: { plannedEnd: true, actualEnd: true },
    }),
  ])

  const months = new Set<string>()
  onb.forEach((r) => {
    if (r.plannedStart) months.add(format(r.plannedStart, "yyyy-MM"))
    if (r.actualStart) months.add(format(r.actualStart, "yyyy-MM"))
  })
  offb.forEach((r) => {
    if (r.plannedEnd) months.add(format(r.plannedEnd, "yyyy-MM"))
    if (r.actualEnd) months.add(format(r.actualEnd, "yyyy-MM"))
  })

  return Array.from(months).sort().reverse()
}
