import { NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  // --- Typy ---
  type MonthlyQueuePayload = {
    year: number
    month: number
    [k: string]: unknown
  }

  const isMonthlyQueuePayload = (v: unknown): v is MonthlyQueuePayload => {
    if (typeof v !== "object" || v === null) return false
    const r = v as Record<string, unknown>
    return typeof r.year === "number" && typeof r.month === "number"
  }

  type QueueDetail = {
    method: "mailQueue"
    status: "QUEUED" | "PROCESSING" | "SENT" | "FAILED" | "CANCELLED"
    sentAt: Date | null
    createdAt: Date
    createdBy: string | null
    jobId: number
  }

  type ReportDetail = {
    method: "monthlyReport"
    reportType: string
    recipients: unknown
    sentAt: Date | null
    createdAt: Date
    generatedBy: string
    reportId: number
  }

  type MonthRow = {
    month: string // "YYYY-MM"
    queueJob: QueueDetail | null
    monthlyReport: ReportDetail | null
    hasBeenSent: boolean
  }

  try {
    // 1) Stáhnout joby i reporty
    const [mailQueueJobs, monthlyReports] = await Promise.all([
      prisma.mailQueue.findMany({
        where: { type: "MONTHLY_SUMMARY" },
        select: {
          id: true,
          payload: true,
          status: true,
          sentAt: true,
          createdAt: true,
          createdBy: true,
        },
        orderBy: { createdAt: "desc" },
        take: 1000,
      }),
      prisma.monthlyReport.findMany({
        select: {
          id: true,
          month: true,
          reportType: true,
          recipients: true,
          generatedBy: true,
          sentAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 1000,
      }),
    ])

    // 2) Z mail queue extrahovat měsíce
    const queueMonths = new Set<string>()
    const jobDetails = new Map<string, QueueDetail>()

    for (const job of mailQueueJobs) {
      const p = job.payload
      if (isMonthlyQueuePayload(p)) {
        const monthKey = `${p.year}-${String(p.month).padStart(2, "0")}`
        queueMonths.add(monthKey)

        if (!jobDetails.has(monthKey)) {
          jobDetails.set(monthKey, {
            method: "mailQueue",
            status: job.status as QueueDetail["status"],
            sentAt: job.sentAt,
            createdAt: job.createdAt,
            createdBy: job.createdBy ?? null,
            jobId: job.id,
          })
        }
      }
    }

    // 3) Z monthlyReports
    const reportMonths = new Set<string>()
    const reportDetails = new Map<string, ReportDetail>()

    for (const report of monthlyReports) {
      // report.month by měl být "YYYY-MM"
      reportMonths.add(report.month)
      if (!reportDetails.has(report.month)) {
        reportDetails.set(report.month, {
          method: "monthlyReport",
          reportType: report.reportType,
          recipients: report.recipients,
          sentAt: report.sentAt,
          createdAt: report.createdAt,
          generatedBy: report.generatedBy,
          reportId: report.id,
        })
      }
    }

    // 4) Sloučit a zmapovat
    const allMonths = new Set<string>([...queueMonths, ...reportMonths])

    const monthsWithDetails: MonthRow[] = Array.from(allMonths).map((month) => {
      const q = jobDetails.get(month) ?? null
      const r = reportDetails.get(month) ?? null

      const hasBeenSent =
        (q?.status === "SENT" && q.sentAt != null) || r?.sentAt != null

      return {
        month,
        queueJob: q,
        monthlyReport: r,
        hasBeenSent,
      }
    })

    // 5) Seřadit od nejnovějšího (lexikograficky stačí pro "YYYY-MM")
    monthsWithDetails.sort((a, b) => b.month.localeCompare(a.month))

    return NextResponse.json({
      status: "success",
      data: monthsWithDetails,
      summary: {
        totalMonths: allMonths.size,
        sentViaQueue: queueMonths.size,
        sentViaReports: reportMonths.size,
        totalSent: monthsWithDetails.filter((m) => m.hasBeenSent).length,
      },
    })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("GET /api/reporty/mesicni/odeslano error:", e)
    return NextResponse.json(
      {
        status: "error",
        message: "Nelze načíst odeslané měsíce.",
        error: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
