import type { EmploymentDocumentType } from "@prisma/client"
import { z } from "zod"

import type { ExitChecklistData } from "@/types/exit-checklist"

import { prisma } from "@/lib/db"

import type {
  ChangeReportRow,
  ChangeValues,
  DocFlag,
  FormStatus,
  OffboardingDocuments,
  OffboardingReportRow,
  OffboardingReportStatus,
  OnboardingDocuments,
  OnboardingReportRow,
  OnboardingReportStatus,
  PeriodInfo,
  ReportSection,
  ReportSelectionSection,
} from "./pdf-report-types"

const ONBOARDING_DOCUMENT_TYPES: Array<{
  type: EmploymentDocumentType
  label: string
}> = [
  { type: "AFFIDAVIT", label: "Čestné prohlášení" },
  { type: "PERSONAL_QUESTIONNAIRE", label: "Osobní dotazník" },
  { type: "PAYROLL_INFO", label: "Dotazník pro vedení mzdové agendy" },
]

function joinName(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || "—"
}

function joinNameOrNull(
  parts: Array<string | null | undefined>
): string | null {
  const joined = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
  return joined || null
}

function isoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function docFlag(done: boolean, at: Date | string | null | undefined): DocFlag {
  return { done, at: isoOrNull(at) }
}

function latestSentAtByRecipient(
  rows: Array<{
    onboardingEmployeeId?: number | null
    offboardingEmployeeId?: number | null
    sentAt: Date | null
    createdAt: Date
  }>,
  key: "onboardingEmployeeId" | "offboardingEmployeeId"
) {
  const map = new Map<number, Date>()

  for (const row of rows) {
    const recipientId = row[key]
    if (recipientId == null) continue

    const at = row.sentAt ?? row.createdAt
    const existing = map.get(recipientId)

    if (!existing || at > existing) {
      map.set(recipientId, at)
    }
  }

  return map
}

function changeTypeLabel(type: string): string {
  if (type === "NAME") return "Změna jména"
  if (type === "POSITION") return "Změna pozice"
  if (type === "NAME_AND_POSITION") return "Změna jména i pozice"
  return "Zaměstnanecká změna"
}

function mostRecentSignatureAt(
  header: ExitChecklistData | null
): string | null {
  if (!header?.signatures) return null

  const dates = [
    header.signatures.employee?.signedAt,
    header.signatures.manager?.signedAt,
    header.signatures.issuer?.signedAt,
  ].filter(Boolean) as string[]

  if (dates.length === 0) return null

  return dates.reduce((latest, current) =>
    new Date(current) > new Date(latest) ? current : latest
  )
}

export async function getOnboardingReportRows(
  ids: number[]
): Promise<Map<number, OnboardingReportRow>> {
  const result = new Map<number, OnboardingReportRow>()
  if (ids.length === 0) return result

  const records = await prisma.employeeOnboarding.findMany({
    where: { id: { in: ids } },
    include: {
      documents: true,
      probationEvaluationRequest: true,
    },
  })

  for (const record of records) {
    const status: OnboardingReportStatus = record.cancelledAt
      ? "cancelled"
      : record.actualStart
        ? "actual"
        : "planned"

    const date = status === "actual" ? record.actualStart : record.plannedStart

    let documents: OnboardingDocuments | null = null
    let probation: PeriodInfo | null = null

    if (status !== "cancelled") {
      const forms: FormStatus[] = ONBOARDING_DOCUMENT_TYPES.map(
        ({ type, label }) => {
          const doc = record.documents.find((d) => d.type === type)

          return {
            label,
            sent: docFlag(Boolean(doc?.sentAt), doc?.sentAt),
            filled: docFlag(
              Boolean(doc && doc.status !== "DRAFT"),
              doc?.completedAt
            ),
          }
        }
      )

      const request = record.probationEvaluationRequest

      documents = {
        forms,
        probationSent: docFlag(Boolean(request?.sentAt), request?.sentAt),
        probationFilled: docFlag(
          Boolean(request?.completedAt),
          request?.completedAt
        ),
      }

      probation = {
        months: record.probationMonths ?? null,
        isCustom: record.hasCustomDates,
        end: isoOrNull(record.probationEnd),
      }
    }

    result.set(record.id, {
      id: record.id,
      fullName: joinName([
        record.titleBefore,
        record.name,
        record.surname,
        record.titleAfter,
      ]),
      personalNumber: record.personalNumber,
      positionName: record.positionName,
      positionNum: record.positionNum,
      department: record.department,
      unitName: record.unitName,
      supervisorName: record.supervisorName,
      supervisorEmail: record.supervisorEmail,
      mentorName: record.mentorName,
      mentorEmail: record.mentorEmail,
      date: isoOrNull(date),
      startTime: record.startTime,
      email: record.email,
      probation,
      documents,
      cancelReason: record.cancelReason,
      cancelledAt: isoOrNull(record.cancelledAt),
      cancelledBy: record.cancelledBy,
    })
  }

  return result
}

export async function getOffboardingReportRows(
  ids: number[]
): Promise<Map<number, OffboardingReportRow>> {
  const result = new Map<number, OffboardingReportRow>()
  if (ids.length === 0) return result

  const [records, emailHistory] = await Promise.all([
    prisma.employeeOffboarding.findMany({
      where: { id: { in: ids } },
      include: { exitChecklist: true },
    }),
    prisma.emailHistory.findMany({
      where: {
        offboardingEmployeeId: { in: ids },
        emailType: {
          in: [
            "EXIT_CHECKLIST_SIGNATURE_INVITE",
            "EXIT_CHECKLIST_BEHALF_SIGNATURE",
          ],
        },
        status: "SENT",
      },
      select: { offboardingEmployeeId: true, sentAt: true, createdAt: true },
    }),
  ])

  const inviteSentMap = latestSentAtByRecipient(
    emailHistory,
    "offboardingEmployeeId"
  )

  for (const record of records) {
    const status: OffboardingReportStatus = record.cancelledAt
      ? "cancelled"
      : record.actualEnd
        ? "actual"
        : "planned"
    const date = status === "actual" ? record.actualEnd : record.plannedEnd

    const header = (record.exitChecklist?.header ??
      null) as ExitChecklistData | null

    const inviteSentAt = inviteSentMap.get(record.id) ?? null

    const allSignedDone = Boolean(
      header?.signatures?.employee?.signedAt &&
        header?.signatures?.manager?.signedAt &&
        header?.signatures?.issuer?.signedAt
    )

    result.set(record.id, {
      id: record.id,
      fullName: joinName([
        record.titleBefore,
        record.name,
        record.surname,
        record.titleAfter,
      ]),
      personalNumber: record.personalNumber,
      positionName: record.positionName,
      positionNum: record.positionNum,
      department: record.department,
      unitName: record.unitName,
      date: isoOrNull(date),
      userEmail: record.userEmail,
      userName: record.userName,
      notice: {
        months: record.noticeMonths ?? null,
        isCustom: record.hasCustomDates,
        end: isoOrNull(record.noticeEnd),
      },
      documents: {
        inviteSent: docFlag(Boolean(inviteSentAt), inviteSentAt),
        allSigned: docFlag(
          allSignedDone,
          allSignedDone ? mostRecentSignatureAt(header) : null
        ),
      } satisfies OffboardingDocuments,
      cancelReason: record.cancelReason,
      cancelledAt: isoOrNull(record.cancelledAt),
      cancelledBy: record.cancelledBy,
    })
  }

  return result
}

export async function getChangeReportRows(
  ids: number[]
): Promise<Map<number, ChangeReportRow>> {
  const result = new Map<number, ChangeReportRow>()
  if (ids.length === 0) return result

  const records = await prisma.employeeChange.findMany({
    where: { id: { in: ids } },
  })

  for (const record of records) {
    const oldValues: ChangeValues = {
      fullName: joinNameOrNull([
        record.oldTitleBefore,
        record.oldName,
        record.oldSurname,
        record.oldTitleAfter,
      ]),
      positionName: record.oldPositionName,
      positionNum: record.oldPositionNum,
      department: record.oldDepartment,
      unitName: record.oldUnitName,
    }

    const newValues: ChangeValues = {
      fullName: joinNameOrNull([
        record.newTitleBefore,
        record.newName,
        record.newSurname,
        record.newTitleAfter,
      ]),
      positionName: record.newPositionName,
      positionNum: record.newPositionNum,
      department: record.newDepartment,
      unitName: record.newUnitName,
    }

    result.set(record.id, {
      id: record.id,
      fullName: joinName([
        record.titleBefore,
        record.name,
        record.surname,
        record.titleAfter,
      ]),
      personalNumber: record.personalNumber,
      changeTypeLabel: changeTypeLabel(record.type),
      effectiveDate: isoOrNull(record.effectiveDate),
      oldValues,
      newValues,
      emailSentAt: isoOrNull(record.emailSentAt),
    })
  }

  return result
}

export const reportSectionSelectionSchema = z.object({
  module: z.enum(["nastup", "odchod", "zmena"]),
  status: z.enum(["planned", "actual", "cancelled"]).optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  ids: z.array(z.number().int()).min(1),
  includeDocuments: z.boolean().optional(),
})

export const reportSelectionPayloadSchema = z.object({
  sections: z.array(reportSectionSelectionSchema).min(1),
})

export async function buildReportSections(
  requested: ReportSelectionSection[]
): Promise<ReportSection[]> {
  const onboardingIds = requested
    .filter((section) => section.module === "nastup")
    .flatMap((section) => section.ids)
  const offboardingIds = requested
    .filter((section) => section.module === "odchod")
    .flatMap((section) => section.ids)
  const changeIds = requested
    .filter((section) => section.module === "zmena")
    .flatMap((section) => section.ids)

  const [onboardingRows, offboardingRows, changeRows] = await Promise.all([
    getOnboardingReportRows(onboardingIds),
    getOffboardingReportRows(offboardingIds),
    getChangeReportRows(changeIds),
  ])

  const sections: ReportSection[] = []

  for (const section of requested) {
    if (section.module === "nastup") {
      const rows = section.ids
        .map((id) => onboardingRows.get(id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row))

      if (rows.length === 0) continue

      sections.push({
        module: "nastup",
        status:
          section.status === "actual" || section.status === "cancelled"
            ? section.status
            : "planned",
        month: section.month,
        rows,
        includeDocuments: section.includeDocuments ?? false,
      })
    } else if (section.module === "odchod") {
      const rows = section.ids
        .map((id) => offboardingRows.get(id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row))

      if (rows.length === 0) continue

      sections.push({
        module: "odchod",
        status:
          section.status === "actual" || section.status === "cancelled"
            ? section.status
            : "planned",
        month: section.month,
        rows,
        includeDocuments: section.includeDocuments ?? false,
      })
    } else {
      const rows = section.ids
        .map((id) => changeRows.get(id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row))

      if (rows.length === 0) continue

      sections.push({
        module: "zmena",
        month: section.month,
        rows,
      })
    }
  }

  return sections
}
