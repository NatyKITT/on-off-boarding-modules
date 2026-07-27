import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { canAccessInternalApp } from "@/lib/rbac"
import { logReportAccess } from "@/lib/report-access-log"
import {
  buildStatisticsReportFilename,
  renderStatisticsPdfBuffer,
} from "@/lib/reports/statistics-report-pdf"
import {
  getCustomView,
  getStatisticsOverview,
} from "@/lib/statistics/aggregate"
import { statisticsPdfRequestSchema } from "@/lib/statistics/pdf-request"
import type { StatDimension, StatMetric } from "@/lib/statistics/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

function bufferToArrayBuffer(buffer: Uint8Array): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength)
  new Uint8Array(arrayBuffer).set(buffer)

  return arrayBuffer
}

export async function POST(request: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  if (!canAccessInternalApp(session.user.role)) {
    return NextResponse.json(
      { status: "error", message: "Nemáte oprávnění exportovat statistiky." },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = statisticsPdfRequestSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { status: "error", message: "Neplatný požadavek." },
      { status: 400 }
    )
  }

  try {
    const { filters, content } = parsed.data
    const overview = await getStatisticsOverview(filters)

    const customView = content.customView
      ? {
          label: content.customView.label,
          result: await getCustomView({
            metric: content.customView.metric as StatMetric,
            dimension: content.customView.dimension as StatDimension,
            displayType: "table",
            filters: content.customView.filters,
          }),
        }
      : null

    const generatedByName =
      session.user.name ?? session.user.email ?? "Neznámý uživatel"
    const generatedAt = new Date()

    const buffer = await renderStatisticsPdfBuffer({
      kpis: overview.kpis,
      monthlyFlow: overview.monthlyFlow,
      departmentFluctuation: overview.departmentFluctuation,
      changesByTypeMonthly: overview.changesByTypeMonthly,
      processHealth: overview.processHealth,
      content: { ...content, customView },
      meta: {
        year: filters.year,
        fromMonth: filters.fromMonth,
        toMonth: filters.toMonth,
        generatedByName,
        generatedAt,
      },
    })

    const filename = buildStatisticsReportFilename(filters.year, generatedAt)
    const periodLabel =
      filters.fromMonth && filters.toMonth
        ? filters.fromMonth === filters.toMonth
          ? `${filters.fromMonth}/${filters.year}`
          : `${filters.fromMonth}–${filters.toMonth}/${filters.year}`
        : String(filters.year)

    await logReportAccess({
      reportType: "STATISTICS_REPORT",
      by: (session.user as { id?: string }).id ?? null,
      byName: generatedByName,
      byEmail: session.user.email ?? null,
      message: `PDF statistik za období ${periodLabel} bylo staženo (${filename}).`,
    })

    return new NextResponse(bufferToArrayBuffer(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("POST /api/statistiky/pdf error:", error)

    return NextResponse.json(
      { status: "error", message: "Nepodařilo se vygenerovat PDF." },
      { status: 500 }
    )
  }
}
