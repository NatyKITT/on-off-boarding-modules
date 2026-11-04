import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import {
  getHrRecipientsFromEnv,
  sendEmploymentDocumentsUnlockedEmail,
  sendEmploymentDocumentsUnlockedHrEmail,
} from "@/lib/email"
import { ONBOARDING_TYPES, typeLabel } from "@/lib/employment-documents"
import { recomputeOnboardingReadiness } from "@/lib/onboarding-readiness"
import { canManageEmploymentDocuments } from "@/lib/rbac"
import { absoluteUrl } from "@/lib/url"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function getNumericId(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ message: "Nejste přihlášeni." }, { status: 401 })
  }

  if (!canManageEmploymentDocuments(session.user.role)) {
    return NextResponse.json(
      { message: "Nemáte oprávnění odemknout dokumenty." },
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

  if (existing.documentsReadinessStatus !== "LOCKED") {
    return NextResponse.json(
      { message: "Dokumenty nejsou uzamčené." },
      { status: 400 }
    )
  }

  const unlockedBy = session.user.name ?? session.user.email ?? "unknown"
  const userId = (session.user as { id?: string }).id
  const now = new Date()

  const lockedDraftDocuments = await prisma.employmentDocument.findMany({
    where: {
      onboardingId,
      type: { in: ONBOARDING_TYPES },
      status: "DRAFT",
      isLocked: true,
    },
    select: { id: true, type: true, accessHash: true, expiresAt: true },
  })

  await prisma.$transaction(async (tx) => {
    await tx.employeeOnboarding.update({
      where: { id: onboardingId },
      data: {
        documentsReadinessStatus: "READY",
        documentsLockedAt: null,
        documentsLockedBy: null,
      },
    })

    if (lockedDraftDocuments.length > 0) {
      await tx.employmentDocument.updateMany({
        where: {
          id: { in: lockedDraftDocuments.map((document) => document.id) },
        },
        data: { isLocked: false },
      })
    }

    if (userId) {
      await tx.onboardingChangeLog.create({
        data: {
          employeeId: onboardingId,
          userId,
          action: "UPDATED",
          field: "documents_readiness",
          oldValue: "LOCKED",
          newValue: `Odemčeno (${unlockedBy})`,
        },
      })
    }
  })

  await recomputeOnboardingReadiness(onboardingId)

  const unlockedDocumentLinks = lockedDraftDocuments
    .filter(
      (document) =>
        document.accessHash && (!document.expiresAt || document.expiresAt > now)
    )
    .map((document) => ({
      label: typeLabel(document.type),
      url: absoluteUrl(`/dokumenty/${document.accessHash}`, req),
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
      await sendEmploymentDocumentsUnlockedEmail({
        to: existing.userEmail,
        employeeName,
        employeePosition: existing.positionName,
        employeeDepartment: existing.department,
        employeeUnitName: existing.unitName,
        documents: unlockedDocumentLinks,
      })
    } catch (error) {
      console.error(
        "[DOCUMENTS-UNLOCK] E-mail zaměstnanci se nepodařilo odeslat:",
        error
      )
    }
  }

  const hrRecipients = getHrRecipientsFromEnv()

  if (hrRecipients.length > 0) {
    try {
      await sendEmploymentDocumentsUnlockedHrEmail({
        to: hrRecipients,
        employeeName,
        employeePosition: existing.positionName,
        employeeDepartment: existing.department,
        employeeUnitName: existing.unitName,
        documents: unlockedDocumentLinks,
      })
    } catch (error) {
      console.error(
        "[DOCUMENTS-UNLOCK] E-mail pro HR se nepodařilo odeslat:",
        error
      )
    }
  }

  return NextResponse.json({ ok: true })
}
