import { NextResponse } from "next/server"
import { auth } from "@/auth"
import type { EmploymentDocumentType } from "@prisma/client"
import { format } from "date-fns"
import { cs } from "date-fns/locale"

import type { ExitChecklistData } from "@/types/exit-checklist"

import { prisma } from "@/lib/db"
import { buildEmployeeMeta } from "@/lib/employee-meta"
import { ONBOARDING_TYPES, typeLabel } from "@/lib/employment-documents"
import { canEditInternalApp } from "@/lib/rbac"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

type DocumentStatusBucket = "not_created" | "draft" | "completed"

type DocumentSummary = {
  key: string
  kind: "onboarding_document" | "probation_evaluation" | "exit_checklist"
  documentType: EmploymentDocumentType | null
  label: string
  status: DocumentStatusBucket
  statusLabel: string
  recordId: number
  documentId: number | null
  note: string | null
}

function fmtNoteDate(date: Date | string | null | undefined) {
  if (!date) return null
  const value = typeof date === "string" ? new Date(date) : date
  return format(value, "d. M. yyyy", { locale: cs })
}

function isCronActor(by: string | null | undefined) {
  return by === "system-cron"
}

function buildSentNote(args: {
  sentAt: Date | null
  sentByName: string | null
  sentBy: string | null
  reminderAt?: Date | null
  reminderByName?: string | null
  reminderBy?: string | null
}): string | null {
  if (!args.sentAt) return "Zatím neodesláno"

  const sentActor = isCronActor(args.sentBy) ? "automaticky" : args.sentByName

  const parts = [
    `Odesláno ${fmtNoteDate(args.sentAt)}${sentActor ? ` (${sentActor})` : ""}`,
  ]

  if (args.reminderAt) {
    const reminderActor = isCronActor(args.reminderBy)
      ? "cron"
      : args.reminderByName

    parts.push(
      `připomínka ${fmtNoteDate(args.reminderAt)}${reminderActor ? ` (${reminderActor})` : ""}`
    )
  }

  return parts.join(" · ")
}

type PersonRow = {
  kind: "onboarding" | "offboarding"
  id: number
  fullName: string
  personalNumber: string | null
  department: string
  unitName: string
  plannedDate: string
  actualDate: string | null
  cancelledAt: string | null
  documents: DocumentSummary[]
}

function probationStatusInfo(status: string): {
  status: DocumentStatusBucket
  statusLabel: string
} {
  switch (status) {
    case "COMPLETED":
      return { status: "completed", statusLabel: "Vyplněno" }
    case "CANCELLED":
      return { status: "draft", statusLabel: "Zrušeno" }
    case "EXPIRED":
      return { status: "draft", statusLabel: "Vypršelo" }
    case "SENT":
      return { status: "draft", statusLabel: "Odesláno, čeká na vyplnění" }
    default:
      return { status: "draft", statusLabel: "Nevyplněno" }
  }
}

function exitChecklistStatusInfo(
  header: unknown,
  items: Array<{ signedAt: Date | null }>
): { status: DocumentStatusBucket; statusLabel: string } {
  const data = (header ?? {}) as Partial<ExitChecklistData>

  if (data.completedAt) {
    return { status: "completed", statusLabel: "Vyplněno" }
  }

  const signedCount = items.filter((item) => item.signedAt).length

  if (signedCount === 0) {
    return { status: "draft", statusLabel: "Nevyplněno" }
  }

  return { status: "draft", statusLabel: "Rozpracováno" }
}

export async function GET() {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { message: "Nejste přihlášen(a)." },
      { status: 401 }
    )
  }

  if (!canEditInternalApp(session.user.role)) {
    return NextResponse.json(
      { message: "Nemáte oprávnění zobrazit přehled dokumentů." },
      { status: 403 }
    )
  }

  const [onboardings, offboardings] = await Promise.all([
    prisma.employeeOnboarding.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        titleBefore: true,
        name: true,
        surname: true,
        titleAfter: true,
        personalNumber: true,
        department: true,
        unitName: true,
        plannedStart: true,
        actualStart: true,
        cancelledAt: true,
        documents: {
          select: {
            id: true,
            type: true,
            status: true,
            sentAt: true,
            sentBy: true,
            completedAt: true,
          },
        },
        probationEvaluationRequest: {
          select: {
            id: true,
            status: true,
            sentAt: true,
            sentBy: true,
            sentByName: true,
            lastReminderAt: true,
            lastReminderBy: true,
            lastReminderByName: true,
            completedAt: true,
            completedByName: true,
          },
        },
      },
      orderBy: { plannedStart: "desc" },
    }),
    prisma.employeeOffboarding.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        titleBefore: true,
        name: true,
        surname: true,
        titleAfter: true,
        personalNumber: true,
        department: true,
        unitName: true,
        plannedEnd: true,
        actualEnd: true,
        cancelledAt: true,
        exitChecklist: {
          select: {
            id: true,
            header: true,
            items: { select: { signedAt: true } },
          },
        },
      },
      orderBy: { plannedEnd: "desc" },
    }),
  ])

  const onboardingRows: PersonRow[] = onboardings.map((onboarding) => {
    const meta = buildEmployeeMeta(onboarding)
    const documentsByType = new Map(
      onboarding.documents.map((doc) => [doc.type, doc])
    )

    const documents: DocumentSummary[] = ONBOARDING_TYPES.map((type) => {
      const doc = documentsByType.get(type)

      if (!doc) {
        return {
          key: `onboarding-${onboarding.id}-doc-${type}`,
          kind: "onboarding_document",
          documentType: type,
          label: typeLabel(type),
          status: "not_created",
          statusLabel: "Nevytvořeno",
          recordId: onboarding.id,
          documentId: null,
          note: null,
        }
      }

      const isCompleted = doc.status !== "DRAFT"

      return {
        key: `onboarding-${onboarding.id}-doc-${type}`,
        kind: "onboarding_document",
        documentType: type,
        label: typeLabel(type),
        status: isCompleted ? "completed" : "draft",
        statusLabel: isCompleted ? "Vyplněno" : "Nevyplněno",
        recordId: onboarding.id,
        documentId: doc.id,
        note: isCompleted
          ? `Vyplněno ${fmtNoteDate(doc.completedAt) ?? ""}`.trim()
          : buildSentNote({
              sentAt: doc.sentAt,
              sentByName: doc.sentBy,
              sentBy: doc.sentBy,
            }),
      }
    })

    if (!onboarding.probationEvaluationRequest) {
      documents.push({
        key: `onboarding-${onboarding.id}-probation`,
        kind: "probation_evaluation",
        documentType: null,
        label: "Hodnocení zkušební doby",
        status: "not_created",
        statusLabel: "Nevytvořeno",
        recordId: onboarding.id,
        documentId: null,
        note: null,
      })
    } else {
      const request = onboarding.probationEvaluationRequest
      const { status, statusLabel } = probationStatusInfo(request.status)

      const note =
        request.status === "COMPLETED"
          ? `Vyplněno ${fmtNoteDate(request.completedAt) ?? ""}${
              request.completedByName ? ` (${request.completedByName})` : ""
            }`.trim()
          : buildSentNote({
              sentAt: request.sentAt,
              sentByName: request.sentByName,
              sentBy: request.sentBy,
              reminderAt: request.lastReminderAt,
              reminderByName: request.lastReminderByName,
              reminderBy: request.lastReminderBy,
            })

      documents.push({
        key: `onboarding-${onboarding.id}-probation`,
        kind: "probation_evaluation",
        documentType: null,
        label: "Hodnocení zkušební doby",
        status,
        statusLabel,
        recordId: onboarding.id,
        documentId: request.id,
        note,
      })
    }

    return {
      kind: "onboarding",
      id: onboarding.id,
      fullName: meta.fullName || `${onboarding.name} ${onboarding.surname}`,
      personalNumber: onboarding.personalNumber,
      department: onboarding.department,
      unitName: onboarding.unitName,
      plannedDate: onboarding.plannedStart.toISOString(),
      actualDate: onboarding.actualStart?.toISOString() ?? null,
      cancelledAt: onboarding.cancelledAt?.toISOString() ?? null,
      documents,
    }
  })

  const offboardingRows: PersonRow[] = offboardings.map((offboarding) => {
    const meta = buildEmployeeMeta(offboarding)
    const documents: DocumentSummary[] = []

    if (!offboarding.exitChecklist) {
      documents.push({
        key: `offboarding-${offboarding.id}-checklist`,
        kind: "exit_checklist",
        documentType: null,
        label: "Výstupní list",
        status: "not_created",
        statusLabel: "Nevytvořeno",
        recordId: offboarding.id,
        documentId: null,
        note: null,
      })
    } else {
      const { status, statusLabel } = exitChecklistStatusInfo(
        offboarding.exitChecklist.header,
        offboarding.exitChecklist.items
      )
      const headerData = (offboarding.exitChecklist.header ??
        {}) as Partial<ExitChecklistData>

      const note =
        status === "completed"
          ? `Vyplněno ${fmtNoteDate(headerData.completedAt) ?? ""}`.trim()
          : buildSentNote({
              sentAt: headerData.signatureRecipientsSentAt
                ? new Date(headerData.signatureRecipientsSentAt)
                : null,
              sentByName: headerData.signatureRecipientsSentByName ?? null,
              sentBy: headerData.signatureRecipientsSentByEmail ?? null,
            })

      documents.push({
        key: `offboarding-${offboarding.id}-checklist`,
        kind: "exit_checklist",
        documentType: null,
        label: "Výstupní list",
        status,
        statusLabel,
        note,
        recordId: offboarding.id,
        documentId: offboarding.exitChecklist.id,
      })
    }

    return {
      kind: "offboarding",
      id: offboarding.id,
      fullName: meta.fullName || `${offboarding.name} ${offboarding.surname}`,
      personalNumber: offboarding.personalNumber,
      department: offboarding.department,
      unitName: offboarding.unitName,
      plannedDate: offboarding.plannedEnd.toISOString(),
      actualDate: offboarding.actualEnd?.toISOString() ?? null,
      cancelledAt: offboarding.cancelledAt?.toISOString() ?? null,
      documents,
    }
  })

  return NextResponse.json({
    rows: [...onboardingRows, ...offboardingRows],
  })
}
