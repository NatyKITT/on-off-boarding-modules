import { NextResponse } from "next/server"
import { auth } from "@/auth"
import type { EmploymentDocumentType } from "@prisma/client"

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
          },
        },
        probationEvaluationRequest: {
          select: {
            id: true,
            status: true,
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
      })
    } else {
      const { status, statusLabel } = probationStatusInfo(
        onboarding.probationEvaluationRequest.status
      )

      documents.push({
        key: `onboarding-${onboarding.id}-probation`,
        kind: "probation_evaluation",
        documentType: null,
        label: "Hodnocení zkušební doby",
        status,
        statusLabel,
        recordId: onboarding.id,
        documentId: onboarding.probationEvaluationRequest.id,
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
      })
    } else {
      const { status, statusLabel } = exitChecklistStatusInfo(
        offboarding.exitChecklist.header,
        offboarding.exitChecklist.items
      )

      documents.push({
        key: `offboarding-${offboarding.id}-checklist`,
        kind: "exit_checklist",
        documentType: null,
        label: "Výstupní list",
        status,
        statusLabel,
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
      cancelledAt: null,
      documents,
    }
  })

  return NextResponse.json({
    rows: [...onboardingRows, ...offboardingRows],
  })
}
