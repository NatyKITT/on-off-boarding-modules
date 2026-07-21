import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/auth"
import { z } from "zod"

import { logEmailHistory, sendMail } from "@/lib/email"
import { canSendMonthlyReports } from "@/lib/rbac"
import {
  buildReportSections,
  reportSectionSelectionSchema,
} from "@/lib/reports/pdf-report-data"
import {
  buildReportFilename,
  buildReportTitle,
  renderPdfReportBuffer,
} from "@/lib/reports/pdf-report-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const payloadSchema = z.object({
  sections: z.array(reportSectionSelectionSchema).min(1),
  email: z.string().email(),
})

export async function POST(request: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { message: "Nejste přihlášen(a)." },
      { status: 401 }
    )
  }

  if (!canSendMonthlyReports(session.user.role)) {
    return NextResponse.json(
      { message: "Nemáte oprávnění odesílat reporty." },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = payloadSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { message: "Neplatný požadavek." },
      { status: 400 }
    )
  }

  const { sections: requested, email } = parsed.data
  const sections = await buildReportSections(requested)

  if (sections.length === 0) {
    return NextResponse.json(
      { message: "Pro vybrané záznamy se nepodařilo najít žádná data." },
      { status: 400 }
    )
  }

  const generatedByName =
    session.user.name ?? session.user.email ?? "Neznámý uživatel"
  const generatedAt = new Date()
  const title = buildReportTitle(sections)

  try {
    const buffer = await renderPdfReportBuffer(sections, {
      generatedByName,
      generatedAt,
    })

    const html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #111827;">
        <h2 style="margin: 0 0 10px 0;">${title}</h2>

        <p style="margin: 0 0 12px 0;">
          Dobrý den,<br/>
          v příloze zasíláme vygenerovaný PDF report.
        </p>

        <div style="margin: 12px 0 0 0; padding: 10px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;">
          <div style="font-size: 12px; color: #374151;">
            <div><strong>Odeslal(a):</strong> ${generatedByName}</div>
            <div><strong>Vygenerováno:</strong> ${generatedAt.toLocaleString("cs-CZ")}</div>
          </div>
        </div>

        <p style="margin: 14px 0 0 0; color: #6b7280; font-size: 12px;">
          Tento e-mail byl automaticky vygenerován systémem On-Off-Boarding Modul ÚMČ Praha 6.
        </p>
      </div>
    `

    await sendMail({
      to: [email],
      subject: title,
      html,
      attachments: [
        {
          filename: buildReportFilename(sections, generatedAt),
          content: buffer,
          contentType: "application/pdf",
        },
      ],
    })

    await logEmailHistory({
      emailType: "GENERIC_EMAIL",
      recipients: [email],
      subject: title,
      content: html,
      status: "SENT",
      createdBy: session.user.id ?? session.user.email ?? "unknown",
    })

    return NextResponse.json({ ok: true, sentTo: email })
  } catch (error) {
    console.error("POST /api/reporty/pdf/odeslat error:", error)

    return NextResponse.json(
      { message: "Odeslání reportu se nezdařilo." },
      { status: 500 }
    )
  }
}
