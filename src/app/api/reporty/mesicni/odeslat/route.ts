import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { format } from "date-fns"
import { cs } from "date-fns/locale"

import { prisma } from "@/lib/db"
import {
  logEmailHistory,
  renderMonthlyReportHtml,
  sendMail,
  type EmailRecord,
} from "@/lib/email"
import { recipientsFor } from "@/lib/email-config"

type Kind = "planned" | "actual"
type Mode = "selected" | "all" | "unsentOnly"

type UiRecordIncoming = {
  id: number
  type: "onboarding" | "offboarding"
  name: string
  surname: string
  titleBefore?: string | null
  titleAfter?: string | null
  position: string | null
  department: string | null
  date: string | Date | null
  originKind: Kind
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await request.json()) as {
    month: string
    kind: Kind
    records: UiRecordIncoming[]
    mode: Mode
    sendToAll?: boolean
  }

  const { month, kind, records, mode, sendToAll } = body

  try {
    const channel = (sendToAll ? "all" : kind) as "planned" | "actual" | "all"
    let reportRecipients = await recipientsFor(channel)
    reportRecipients = Array.from(new Set(reportRecipients.filter(Boolean)))

    if (!reportRecipients.length) {
      return NextResponse.json({ error: "Žádní příjemci" }, { status: 400 })
    }

    const to = [
      process.env.RESEND_EMAIL_TO ??
        process.env.RESEND_EMAIL_FROM_HR ??
        process.env.EMAIL_FROM ??
        "no-reply@example.com",
    ]

    const ensureReport = async (reportKind: Kind) => {
      let rep = await prisma.monthlyReport.findUnique({
        where: { month_reportType: { month, reportType: reportKind } },
      })
      if (!rep) {
        const recips = await recipientsFor(reportKind)
        rep = await prisma.monthlyReport.create({
          data: {
            month,
            reportType: reportKind,
            recipients: Array.from(new Set(recips.filter(Boolean))),
            generatedBy:
              (session.user as { id?: string }).id ??
              session.user.email ??
              "unknown",
            data: {},
          },
        })
      }
      return rep
    }

    const hasPlanned = records.some((r) => r.originKind === "planned")
    const hasActual = records.some((r) => r.originKind === "actual")
    const reportPlanned = hasPlanned ? await ensureReport("planned") : null
    const reportActual = hasActual ? await ensureReport("actual") : null

    const existedPlanned = reportPlanned
      ? await prisma.monthlyReportRecord.findMany({
          where: { monthlyReportId: reportPlanned.id },
          select: { recordType: true, recordId: true },
        })
      : []
    const existedActual = reportActual
      ? await prisma.monthlyReportRecord.findMany({
          where: { monthlyReportId: reportActual.id },
          select: { recordType: true, recordId: true },
        })
      : []

    const alreadyPlanned = new Set(
      existedPlanned.map((e) => `${e.recordType}-${e.recordId}`)
    )
    const alreadyActual = new Set(
      existedActual.map((e) => `${e.recordType}-${e.recordId}`)
    )

    let payloadRows = records
    if (mode === "unsentOnly") {
      payloadRows = records.filter((r) => {
        const key = `${r.type}_${r.originKind}-${r.id}`
        return r.originKind === "planned"
          ? !alreadyPlanned.has(key)
          : !alreadyActual.has(key)
      })
    }

    if (payloadRows.length === 0) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "Žádné nové záznamy",
      })
    }

    const emailRecords: EmailRecord[] = payloadRows.map((r) => ({
      id: r.id,
      type: r.type === "onboarding" ? "onboarding" : "offboarding",
      name: r.name,
      surname: r.surname,
      titleBefore: r.titleBefore ?? null,
      titleAfter: r.titleAfter ?? null,
      position: r.position ?? null,
      department: r.department ?? null,
      date: r.date ?? null,
    }))

    const monthLabel = format(new Date(`${month}-01`), "LLLL yyyy", {
      locale: cs,
    })

    const subject = sendToAll
      ? `Měsíční report změn (plánované + skutečné) – ${monthLabel}`
      : `Měsíční report ${
          kind === "planned" ? "plánovaných" : "skutečných"
        } změn – ${monthLabel}`

    const html = await renderMonthlyReportHtml({
      records: emailRecords,
      month,
      kind: sendToAll ? "all" : kind,
    })

    await sendMail({
      to,
      bcc: reportRecipients,
      subject,
      html,
      from: process.env.RESEND_EMAIL_FROM_HR ?? process.env.EMAIL_FROM,
    })

    await Promise.all(
      payloadRows.map((r) => {
        const monthlyReportId =
          r.originKind === "planned" ? reportPlanned!.id : reportActual!.id
        return prisma.monthlyReportRecord.upsert({
          where: {
            recordType_recordId_monthlyReportId: {
              recordType: `${r.type}_${r.originKind}`,
              recordId: r.id,
              monthlyReportId,
            },
          },
          update: {
            sentAt: new Date(),
            sentBy: (session.user as { id?: string }).id ?? "unknown",
          },
          create: {
            monthlyReportId,
            recordType: `${r.type}_${r.originKind}`,
            recordId: r.id,
            sentBy: (session.user as { id?: string }).id ?? "unknown",
          },
        })
      })
    )

    if (reportPlanned)
      await prisma.monthlyReport.update({
        where: { id: reportPlanned.id },
        data: { sentAt: new Date() },
      })
    if (reportActual)
      await prisma.monthlyReport.update({
        where: { id: reportActual.id },
        data: { sentAt: new Date() },
      })

    await logEmailHistory({
      emailType: "MONTHLY_SUMMARY",
      recipients: reportRecipients,
      subject,
      content: html,
      status: "SENT",
      createdBy: (session.user as { id?: string }).id ?? "unknown",
    })

    return NextResponse.json({ ok: true, sent: payloadRows.length })
  } catch (e) {
    console.error(e)
    await logEmailHistory({
      emailType: "MONTHLY_SUMMARY",
      recipients: [],
      subject: "Monthly report (ERROR)",
      content: "",
      status: "FAILED",
      error: e instanceof Error ? e.message : String(e),
      createdBy: (session.user as { id?: string }).id ?? "unknown",
    })
    return NextResponse.json({ error: "Chyba při odesílání" }, { status: 500 })
  }
}
