import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import {
  getHrRecipientsFromEnv,
  sendEmploymentDocumentsUnlockedEmail,
  sendEmploymentDocumentsUnlockedHrEmail,
} from "@/lib/email"
import { ONBOARDING_TYPES, typeLabel } from "@/lib/employment-documents"
import { buildManagerNotifyPromptForRemoval } from "@/lib/new-record-manager-watch"
import { canWriteOnboarding } from "@/lib/rbac"
import { absoluteUrl } from "@/lib/url"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

interface Params {
  params: { id: string }
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  if (!canWriteOnboarding(session.user.role)) {
    return NextResponse.json(
      {
        status: "error",
        message: "Nemáte oprávnění vracet nástup do plánovaných.",
      },
      { status: 403 }
    )
  }

  const id = Number(params.id)
  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { status: "error", message: "Neplatné ID." },
      { status: 400 }
    )
  }

  try {
    const userKey =
      (session.user as { id?: string; email?: string }).id ??
      session.user.email ??
      "unknown"

    const before = await prisma.employeeOnboarding.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    })

    if (!before) {
      return NextResponse.json(
        { status: "error", message: "Záznam nenalezen." },
        { status: 404 }
      )
    }

    if (!before.actualStart) {
      return NextResponse.json(
        {
          status: "error",
          message: "Tento záznam je již v plánovaných nástupech.",
        },
        { status: 400 }
      )
    }

    const raw = await req.json().catch(() => ({}))
    const confirmUnlockChecklist =
      typeof (raw as Record<string, unknown>).confirmUnlockChecklist ===
      "boolean"
        ? ((raw as Record<string, unknown>).confirmUnlockChecklist as boolean)
        : null

    const documentsLocked = before.documentsReadinessStatus === "LOCKED"

    if (documentsLocked && confirmUnlockChecklist === null) {
      return NextResponse.json({
        status: "confirm_required",
        confirmKind: "unlock_documents_on_revert",
        message:
          "Nástupní dokumenty jsou uzamčené. Chcete je po vrácení do plánovaných odemknout a poslat nevyplněné dotazníky znovu k vyplnění?",
      })
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedRecord = await tx.employeeOnboarding.update({
        where: { id },
        data: {
          actualStart: null,
          status: "NEW",
          updatedAt: new Date(),
        },
      })

      await tx.onboardingChangeLog.create({
        data: {
          employeeId: id,
          userId: userKey,
          action: "REVERTED",
          field: "actualStart",
          oldValue: before.actualStart?.toISOString() || null,
          newValue: null,
        },
      })

      await tx.onboardingChangeLog.create({
        data: {
          employeeId: id,
          userId: userKey,
          action: "STATUS_CHANGED",
          field: "status",
          oldValue: before.status,
          newValue: "NEW",
        },
      })

      return updatedRecord
    })

    const managerNotifyPrompt = await buildManagerNotifyPromptForRemoval({
      kind: "ONBOARDING",
      recordId: id,
      reason: "RECORD_RESTORED",
    })

    if (documentsLocked && confirmUnlockChecklist === true) {
      try {
        const lockedDraftDocuments = await prisma.employmentDocument.findMany({
          where: {
            onboardingId: id,
            type: { in: ONBOARDING_TYPES },
            status: "DRAFT",
            isLocked: true,
          },
          select: { id: true, type: true, accessHash: true, expiresAt: true },
        })

        const now = new Date()

        await prisma.$transaction(async (tx) => {
          await tx.employeeOnboarding.update({
            where: { id },
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
        })

        const employeeName = [
          before.titleBefore,
          before.name,
          before.surname,
          before.titleAfter,
        ]
          .filter(Boolean)
          .join(" ")
          .trim()

        const unlockedDocumentLinks = lockedDraftDocuments
          .filter(
            (document) =>
              document.accessHash &&
              (!document.expiresAt || document.expiresAt > now)
          )
          .map((document) => ({
            label: typeLabel(document.type),
            url: absoluteUrl(`/dokumenty/${document.accessHash}`, req),
          }))

        if (before.userEmail) {
          await sendEmploymentDocumentsUnlockedEmail({
            to: before.userEmail,
            employeeName,
            employeePosition: before.positionName,
            employeeDepartment: before.department,
            employeeUnitName: before.unitName,
            documents: unlockedDocumentLinks,
          })
        }

        const hrRecipients = getHrRecipientsFromEnv()

        if (hrRecipients.length > 0) {
          await sendEmploymentDocumentsUnlockedHrEmail({
            to: hrRecipients,
            employeeName,
            employeePosition: before.positionName,
            employeeDepartment: before.department,
            employeeUnitName: before.unitName,
            documents: unlockedDocumentLinks,
          })
        }
      } catch (error) {
        console.error(
          "[NASTUPY-REVERT] Odemčení nástupních dokumentů se nepodařilo:",
          error
        )
      }
    }

    const responseData = {
      ...updated,
      plannedStart: updated.plannedStart?.toISOString() || null,
      actualStart: updated.actualStart?.toISOString() || null,
      probationEnd: updated.probationEnd?.toISOString() || null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    }

    return NextResponse.json({
      status: "success",
      data: responseData,
      message: "Nástup byl vrácen do plánovaných.",
      managerNotifyPrompt,
    })
  } catch (err) {
    console.error("Chyba při vracení nástupu:", err)
    return NextResponse.json(
      {
        status: "error",
        message: "Chyba při vracení nástupu.",
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
