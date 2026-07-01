import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { EmployeeChangeAudience, EmployeeChangeStatus } from "@prisma/client"
import { endOfMonth, startOfMonth } from "date-fns"
import { z } from "zod"

import { prisma } from "@/lib/db"
import {
  buildEmployeeChangeReportSubject,
  logEmailHistory,
  renderEmployeeChangeReportHtml,
  sendMail,
  type EmployeeChangeEmailRecord,
  type EmployeeChangeReportAudience,
} from "@/lib/email"
import { recipientsFor } from "@/lib/email-config"
import { canSendMonthlyReports } from "@/lib/rbac"

type ReportAudience =
  | typeof EmployeeChangeAudience.ONBOARDING_GROUP
  | typeof EmployeeChangeAudience.ALL_EMPLOYEES

const RECORD_TYPE = "employee_change"
const REPORT_TYPE_PREFIX = "employee_changes"

const bodySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  audience: z.enum([
    EmployeeChangeAudience.ONBOARDING_GROUP,
    EmployeeChangeAudience.ALL_EMPLOYEES,
  ]),
  records: z
    .array(
      z.object({
        id: z.number().int(),
      })
    )
    .min(1),
  mode: z.enum(["selected", "all", "unsentOnly"]),
  recipients: z.array(z.string().email()).optional(),
  subject: z.string().optional(),
})

function getUserKey(user: { id?: string | null; email?: string | null }) {
  return user.id ?? user.email ?? "unknown"
}

function getReportType(audience: ReportAudience) {
  return `${REPORT_TYPE_PREFIX}_${audience.toLowerCase()}`
}

async function getReportRecipients(
  audience: ReportAudience,
  extraRecipients?: string[]
) {
  const baseRecipients =
    audience === EmployeeChangeAudience.ONBOARDING_GROUP
      ? await recipientsFor("planned")
      : await recipientsFor("all")

  return Array.from(
    new Set(
      [...(baseRecipients ?? []), ...(extraRecipients ?? [])].filter(Boolean)
    )
  )
}

function toEmailRecord(change: {
  id: number
  type: "POSITION" | "NAME" | "NAME_AND_POSITION"
  status: string
  audience: string | null
  effectiveDate: Date

  titleBefore: string | null
  name: string
  surname: string
  titleAfter: string | null

  personalNumber: string | null

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
}): EmployeeChangeEmailRecord {
  return {
    id: change.id,
    type: change.type,
    status: change.status,
    audience: change.audience,

    effectiveDate: change.effectiveDate,

    titleBefore: change.titleBefore,
    name: change.name,
    surname: change.surname,
    titleAfter: change.titleAfter,

    personalNumber: change.personalNumber,

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
  }
}

export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canSendMonthlyReports(session.user.role)) {
    return NextResponse.json(
      { error: "Nemáte oprávnění odesílat měsíční reporty změn." },
      { status: 403 }
    )
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Neplatná data požadavku." },
      { status: 400 }
    )
  }

  const { month, audience, records, mode, recipients, subject } = parsed.data

  const [year, monthNumber] = month.split("-").map(Number)

  if (!Number.isFinite(year) || !Number.isFinite(monthNumber)) {
    return NextResponse.json(
      { error: "Neplatný měsíc reportu." },
      { status: 400 }
    )
  }

  const monthStart = startOfMonth(new Date(year, monthNumber - 1))
  const monthEnd = endOfMonth(monthStart)

  try {
    const reportType = getReportType(audience)
    const requestedIds = Array.from(new Set(records.map((record) => record.id)))

    const existingReport = await prisma.monthlyReport.findUnique({
      where: {
        month_reportType: {
          month,
          reportType,
        },
      },
      include: {
        records: {
          where: {
            recordType: RECORD_TYPE,
          },
          select: {
            recordId: true,
          },
        },
      },
    })

    const alreadySentIds = new Set(
      existingReport?.records.map((record) => record.recordId) ?? []
    )

    const idsToSend =
      mode === "unsentOnly"
        ? requestedIds.filter((id) => !alreadySentIds.has(id))
        : requestedIds

    if (idsToSend.length === 0) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "Žádné nové změny",
      })
    }

    const changes = await prisma.employeeChange.findMany({
      where: {
        id: {
          in: idsToSend,
        },
        deletedAt: null,
        status: {
          not: EmployeeChangeStatus.CANCELLED,
        },
        effectiveDate: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      orderBy: [{ effectiveDate: "asc" }, { surname: "asc" }, { id: "asc" }],
    })

    if (changes.length === 0) {
      return NextResponse.json(
        { error: "Nebyly nalezeny žádné změny k odeslání." },
        { status: 404 }
      )
    }

    const reportRecipients = await getReportRecipients(audience, recipients)

    if (!reportRecipients.length) {
      return NextResponse.json({ error: "Žádní příjemci" }, { status: 400 })
    }

    const createdBy = getUserKey(session.user)

    const finalSubject =
      subject ||
      buildEmployeeChangeReportSubject({
        month,
        audience: audience as EmployeeChangeReportAudience,
      })

    const emailRecords = changes.map(toEmailRecord)

    const html = await renderEmployeeChangeReportHtml({
      records: emailRecords,
      month,
      audience: audience as EmployeeChangeReportAudience,
    })

    await sendMail({
      bcc: reportRecipients,
      subject: finalSubject,
      html,
    })

    const savedReport = await prisma.monthlyReport.upsert({
      where: {
        month_reportType: {
          month,
          reportType,
        },
      },
      update: {
        recipients: reportRecipients,
        generatedBy: createdBy,
        sentAt: new Date(),
        data: {
          audience,
          count: changes.length,
          recordIds: changes.map((change) => change.id),
        },
      },
      create: {
        month,
        reportType,
        recipients: reportRecipients,
        generatedBy: createdBy,
        sentAt: new Date(),
        data: {
          audience,
          count: changes.length,
          recordIds: changes.map((change) => change.id),
        },
      },
    })

    await Promise.all(
      changes.map((change) =>
        prisma.monthlyReportRecord.upsert({
          where: {
            recordType_recordId_monthlyReportId: {
              recordType: RECORD_TYPE,
              recordId: change.id,
              monthlyReportId: savedReport.id,
            },
          },
          update: {
            sentAt: new Date(),
            sentBy: createdBy,
          },
          create: {
            monthlyReportId: savedReport.id,
            recordType: RECORD_TYPE,
            recordId: change.id,
            sentAt: new Date(),
            sentBy: createdBy,
          },
        })
      )
    )

    await Promise.all(
      changes.map((change) =>
        logEmailHistory({
          changeId: change.id,
          emailType: "EMPLOYEE_CHANGE_SUMMARY",
          recipients: reportRecipients,
          subject: finalSubject,
          content: html,
          status: "SENT",
          createdBy,
        })
      )
    )

    await prisma.employeeChange.updateMany({
      where: {
        id: {
          in: changes.map((change) => change.id),
        },
      },
      data: {
        emailSentAt: new Date(),
        emailSentBy: createdBy,
      },
    })

    return NextResponse.json({
      ok: true,
      sent: changes.length,
      recipients: reportRecipients,
    })
  } catch (error) {
    console.error("POST /api/zmeny/reporty/mesicni/odeslat error:", error)

    await logEmailHistory({
      emailType: "EMPLOYEE_CHANGE_SUMMARY",
      recipients: [],
      subject: "Report změn (ERROR)",
      content: "",
      status: "FAILED",
      error: error instanceof Error ? error.message : String(error),
      createdBy: getUserKey(session.user),
    })

    return NextResponse.json(
      { error: "Chyba při odesílání reportu změn." },
      { status: 500 }
    )
  }
}
