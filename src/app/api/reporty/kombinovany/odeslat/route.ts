import { NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import {
  buildCombinedReportIcsAttachment,
  logEmailHistory,
  renderCombinedReportHtml,
  sendMail,
  type EmailRecord,
  type EmployeeChangeEmailRecord,
  type EmployeeChangeReportAudience,
} from "@/lib/email"
import { recipientsFor } from "@/lib/email-config"
import { canSendMonthlyReports } from "@/lib/rbac"

type Audience = "ONBOARDING_GROUP" | "ALL_EMPLOYEES"
type Mode = "selected" | "all" | "unsentOnly"
type RecordKind = "planned" | "actual"

type IncomingOnboarding = {
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
}

type IncomingOffboarding = IncomingOnboarding

type IncomingChange = {
  id: number
  type: "POSITION" | "NAME" | "NAME_AND_POSITION" | "MATERNITY_LEAVE"
  status: string
  personalNumber: string | null
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
}

function getUserKey(user: { id?: string | null; email?: string | null }) {
  return user.id ?? user.email ?? "unknown"
}

function filterByMode<T extends { wasSent: boolean }>(
  rows: T[],
  mode: Mode
): T[] {
  if (mode === "unsentOnly") return rows.filter((r) => !r.wasSent)
  return rows
}

async function ensureMonthlyReport(args: {
  month: string
  reportType: string
  generatedBy: string
}) {
  const existing = await prisma.monthlyReport.findUnique({
    where: {
      month_reportType: { month: args.month, reportType: args.reportType },
    },
  })

  if (existing) return existing

  return prisma.monthlyReport.create({
    data: {
      month: args.month,
      reportType: args.reportType,
      recipients: [],
      generatedBy: args.generatedBy,
      data: {},
    },
  })
}

async function recordSent(args: {
  monthlyReportId: number
  recordType: string
  recordId: number
  sentBy: string
}) {
  await prisma.monthlyReportRecord.upsert({
    where: {
      recordType_recordId_monthlyReportId: {
        recordType: args.recordType,
        recordId: args.recordId,
        monthlyReportId: args.monthlyReportId,
      },
    },
    update: { sentAt: new Date(), sentBy: args.sentBy },
    create: {
      monthlyReportId: args.monthlyReportId,
      recordType: args.recordType,
      recordId: args.recordId,
      sentAt: new Date(),
      sentBy: args.sentBy,
    },
  })

  await prisma.monthlyReport.update({
    where: { id: args.monthlyReportId },
    data: { sentAt: new Date() },
  })
}

function toEmailRecord(
  r: IncomingOnboarding,
  type: "onboarding" | "offboarding"
): EmailRecord {
  return {
    id: r.id,
    type,
    name: r.name,
    surname: r.surname,
    titleBefore: r.titleBefore,
    titleAfter: r.titleAfter,
    position: r.position,
    department: r.department,
    date: r.date,
    personalNumber: r.personalNumber,
    positionNum: r.positionNum,
  }
}

export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canSendMonthlyReports(session.user.role)) {
    return NextResponse.json(
      { error: "Nemáte oprávnění odesílat měsíční reporty." },
      { status: 403 }
    )
  }

  const body = (await request.json().catch(() => null)) as {
    months: string[]
    audience: Audience
    mode: Mode
    onboardings: IncomingOnboarding[]
    offboardings: IncomingOffboarding[]
    changes: IncomingChange[]
  } | null

  if (!body || !Array.isArray(body.months) || body.months.length === 0) {
    return NextResponse.json({ error: "Neplatný požadavek." }, { status: 400 })
  }

  const { months, audience, mode } = body
  const changeAudience: EmployeeChangeReportAudience = audience

  const onboardings = filterByMode(body.onboardings ?? [], mode)
  const offboardings = filterByMode(body.offboardings ?? [], mode)
  const changes = filterByMode(body.changes ?? [], mode)

  if (!onboardings.length && !offboardings.length && !changes.length) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Žádné záznamy k odeslání",
    })
  }

  const sentBy = getUserKey(session.user)
  const totalSent = onboardings.length + offboardings.length + changes.length

  let recipients: string[]
  let html: string
  let text: string
  let subject: string

  try {
    recipients = Array.from(
      new Set(
        (
          await recipientsFor(
            audience === "ONBOARDING_GROUP" ? "planned" : "all"
          )
        ).filter(Boolean)
      )
    )

    if (!recipients.length) {
      return NextResponse.json({ error: "Žádní příjemci" }, { status: 400 })
    }

    const onboardingsPlanned = onboardings.filter((o) => o.kind === "planned")
    const onboardingsActual = onboardings.filter((o) => o.kind === "actual")
    const offboardingsPlanned = offboardings.filter((o) => o.kind === "planned")
    const offboardingsActual = offboardings.filter((o) => o.kind === "actual")

    const changeEmailRecords: EmployeeChangeEmailRecord[] = changes.map(
      (c) => ({
        id: c.id,
        type: c.type,
        status: c.status,
        audience: null,
        effectiveDate: c.effectiveDate,
        titleBefore: c.newTitleBefore ?? c.oldTitleBefore,
        name: c.newName ?? c.oldName ?? "",
        surname: c.newSurname ?? c.oldSurname ?? "",
        titleAfter: c.newTitleAfter ?? c.oldTitleAfter,
        personalNumber: c.personalNumber,
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
      })
    )

    const rendered = await renderCombinedReportHtml({
      months,
      onboardingsPlanned: onboardingsPlanned.map((o) =>
        toEmailRecord(o, "onboarding")
      ),
      onboardingsActual: onboardingsActual.map((o) =>
        toEmailRecord(o, "onboarding")
      ),
      offboardingsPlanned: offboardingsPlanned.map((o) =>
        toEmailRecord(o, "offboarding")
      ),
      offboardingsActual: offboardingsActual.map((o) =>
        toEmailRecord(o, "offboarding")
      ),
      changes: changeEmailRecords,
      changeAudience,
    })
    html = rendered.html
    text = rendered.text
    subject = rendered.subject

    const icsAttachment = buildCombinedReportIcsAttachment({
      records: [
        ...onboardingsPlanned.map((o) => toEmailRecord(o, "onboarding")),
        ...onboardingsActual.map((o) => toEmailRecord(o, "onboarding")),
        ...offboardingsPlanned.map((o) => toEmailRecord(o, "offboarding")),
        ...offboardingsActual.map((o) => toEmailRecord(o, "offboarding")),
      ],
      changes: changeEmailRecords,
    })

    await sendMail({
      bcc: recipients,
      subject,
      html,
      text,
      ...(icsAttachment ? { attachments: [icsAttachment] } : {}),
    })
  } catch (error) {
    console.error("POST /api/reporty/kombinovany/odeslat error:", error)

    await logEmailHistory({
      emailType: "MONTHLY_SUMMARY",
      recipients: [],
      subject: "Kombinovaný report (ERROR)",
      content: "",
      status: "FAILED",
      error: error instanceof Error ? error.message : String(error),
      createdBy: sentBy,
    })

    return NextResponse.json(
      { error: "Chyba při odesílání reportu." },
      { status: 500 }
    )
  }

  try {
    await logEmailHistory({
      emailType: "MONTHLY_SUMMARY",
      recipients,
      subject,
      content: html,
      status: "SENT",
      createdBy: sentBy,
    })

    const reportKeyOf = (month: string, reportType: string) =>
      `${month}::${reportType}`

    const neededReportKeys = new Set<string>([
      ...onboardings.map((o) => reportKeyOf(o.month, o.kind)),
      ...offboardings.map((o) => reportKeyOf(o.month, o.kind)),
      ...changes.map((c) =>
        reportKeyOf(c.month, `employee_changes_${audience.toLowerCase()}`)
      ),
    ])

    const monthlyReportIdByKey = new Map<string, number>()
    for (const key of neededReportKeys) {
      const [month, reportType] = key.split("::") as [string, string]
      const report = await ensureMonthlyReport({
        month,
        reportType,
        generatedBy: sentBy,
      })
      monthlyReportIdByKey.set(key, report.id)
    }

    await Promise.all([
      ...onboardings.map((o) =>
        recordSent({
          monthlyReportId: monthlyReportIdByKey.get(
            reportKeyOf(o.month, o.kind)
          )!,
          recordType: `onboarding_${o.kind}`,
          recordId: o.id,
          sentBy,
        })
      ),
      ...offboardings.map((o) =>
        recordSent({
          monthlyReportId: monthlyReportIdByKey.get(
            reportKeyOf(o.month, o.kind)
          )!,
          recordType: `offboarding_${o.kind}`,
          recordId: o.id,
          sentBy,
        })
      ),
      ...changes.map((c) =>
        recordSent({
          monthlyReportId: monthlyReportIdByKey.get(
            reportKeyOf(c.month, `employee_changes_${audience.toLowerCase()}`)
          )!,
          recordType: "employee_change",
          recordId: c.id,
          sentBy,
        })
      ),
    ])

    if (changes.length > 0) {
      await prisma.employeeChange.updateMany({
        where: { id: { in: changes.map((c) => c.id) } },
        data: { emailSentAt: new Date(), emailSentBy: sentBy },
      })
    }
  } catch (error) {
    console.error(
      "POST /api/reporty/kombinovany/odeslat - e-mail odeslán, evidence v DB selhala:",
      error
    )
  }

  return NextResponse.json({ ok: true, sent: totalSent })
}
