import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import {
  getHrRecipientsFromEnv,
  sendEmploymentDocumentsLockedEmail,
  sendEmploymentDocumentsLockedHrEmail,
} from "@/lib/email"
import { ONBOARDING_TYPES, typeLabel } from "@/lib/employment-documents"
import { canManageEmploymentDocuments } from "@/lib/rbac"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function getNumericId(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ message: "Nejste přihlášeni." }, { status: 401 })
  }

  if (!canManageEmploymentDocuments(session.user.role)) {
    return NextResponse.json(
      { message: "Nemáte oprávnění uzamknout dokumenty." },
      { status: 403 }
    )
  }

  const onboardingId = getNumericId(params.id)
  if (!onboardingId) {
    return NextResponse.json(
      { message: "Neplatné ID nástupu." },
      { status: 400 }
    )
  }

  const existing = await prisma.employeeOnboarding.findFirst({
    where: { id: onboardingId, deletedAt: null },
    select: {
      id: true,
      documentsReadinessStatus: true,
      titleBefore: true,
      name: true,
      surname: true,
      titleAfter: true,
      userEmail: true,
      positionName: true,
      department: true,
      unitName: true,
    },
  })

  if (!existing) {
    return NextResponse.json(
      { message: "Nástup nebyl nalezen." },
      { status: 404 }
    )
  }

  if (existing.documentsReadinessStatus === "LOCKED") {
    return NextResponse.json(
      { message: "Dokumenty už jsou uzamčené." },
      { status: 409 }
    )
  }

  const lockedBy = session.user.name ?? session.user.email ?? "unknown"
  const now = new Date()
  const userId = (session.user as { id?: string }).id

  const draftDocuments = await prisma.employmentDocument.findMany({
    where: {
      onboardingId,
      type: { in: ONBOARDING_TYPES },
      status: "DRAFT",
    },
    select: { id: true, type: true },
  })

  await prisma.$transaction(async (tx) => {
    await tx.employeeOnboarding.update({
      where: { id: onboardingId },
      data: {
        documentsReadinessStatus: "LOCKED",
        documentsLockedAt: now,
        documentsLockedBy: lockedBy,
      },
    })

    if (draftDocuments.length > 0) {
      await tx.employmentDocument.updateMany({
        where: { id: { in: draftDocuments.map((document) => document.id) } },
        data: { isLocked: true },
      })
    }

    if (userId) {
      await tx.onboardingChangeLog.create({
        data: {
          employeeId: onboardingId,
          userId,
          action: "UPDATED",
          field: "documents_readiness",
          oldValue: existing.documentsReadinessStatus,
          newValue: "LOCKED",
        },
      })
    }
  })

  const lockedDocumentLabels = draftDocuments.map((document) => ({
    label: typeLabel(document.type),
  }))

  const employeeName = [
    existing.titleBefore,
    existing.name,
    existing.surname,
    existing.titleAfter,
  ]
    .filter(Boolean)
    .join(" ")
    .trim()

  if (existing.userEmail) {
    try {
      await sendEmploymentDocumentsLockedEmail({
        to: existing.userEmail,
        employeeName,
        employeePosition: existing.positionName,
        employeeDepartment: existing.department,
        employeeUnitName: existing.unitName,
        documents: lockedDocumentLabels,
      })
    } catch (error) {
      console.error(
        "[DOCUMENTS-LOCK] E-mail zaměstnanci se nepodařilo odeslat:",
        error
      )
    }
  }

  const hrRecipients = getHrRecipientsFromEnv()

  if (hrRecipients.length > 0) {
    try {
      await sendEmploymentDocumentsLockedHrEmail({
        to: hrRecipients,
        employeeName,
        employeePosition: existing.positionName,
        employeeDepartment: existing.department,
        employeeUnitName: existing.unitName,
        documents: lockedDocumentLabels,
      })
    } catch (error) {
      console.error(
        "[DOCUMENTS-LOCK] E-mail pro HR se nepodařilo odeslat:",
        error
      )
    }
  }

  return NextResponse.json({ ok: true, lockedAt: now, lockedBy })
}
