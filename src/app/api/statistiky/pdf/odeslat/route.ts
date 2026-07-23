import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { EMAIL_FOOTER_HTML, logEmailHistory, sendMail } from "@/lib/email"
import { canAccessInternalApp } from "@/lib/rbac"
import {
  buildStatisticsReportFilename,
  buildStatisticsReportTitle,
  renderStatisticsPdfBuffer,
} from "@/lib/reports/statistics-report-pdf"
import {
  getCustomView,
  getStatisticsOverview,
} from "@/lib/statistics/aggregate"
import { statisticsPdfEmailRequestSchema } from "@/lib/statistics/pdf-request"
import type { StatDimension, StatMetric } from "@/lib/statistics/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

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
      { status: "error", message: "Nemáte oprávnění odesílat statistiky." },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = statisticsPdfEmailRequestSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { status: "error", message: "Neplatný požadavek." },
      { status: 400 }
    )
  }

  try {
    const { filters, content, email } = parsed.data
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
    const title = buildStatisticsReportTitle(
      filters.year,
      filters.fromMonth,
      filters.toMonth
    )

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

    const html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #111827;">
        <h2 style="margin: 0 0 10px 0;">${title}</h2>

        <p style="margin: 0 0 12px 0;">
          Dobrý den,<br/>
          v příloze zasíláme vygenerovaný PDF export statistik.
        </p>

        <div style="margin: 12px 0 0 0; padding: 10px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;">
          <div style="font-size: 12px; color: #374151;">
            <div><strong>Odeslal(a):</strong> ${generatedByName}</div>
            <div><strong>Vygenerováno:</strong> ${generatedAt.toLocaleString("cs-CZ")}</div>
          </div>
        </div>

        <p style="margin: 14px 0 0 0; color: #6b7280; font-size: 12px; line-height: 1.5;">
          ${EMAIL_FOOTER_HTML}
        </p>
      </div>
    `

    await sendMail({
      to: [email],
      subject: title,
      html,
      attachments: [
        {
          filename: buildStatisticsReportFilename(filters.year, generatedAt),
          content: buffer,
          contentType: "application/pdf",
        },
      ],
    })

    await logEmailHistory({
      emailType: "STATISTICS_REPORT",
      recipients: [email],
      subject: title,
      content: html,
      status: "SENT",
      createdBy: session.user.id ?? session.user.email ?? "unknown",
    })

    return NextResponse.json({ status: "success", sentTo: email })
  } catch (error) {
    console.error("POST /api/statistiky/pdf/odeslat error:", error)

    return NextResponse.json(
      { status: "error", message: "Odeslání statistik se nezdařilo." },
      { status: 500 }
    )
  }
}
