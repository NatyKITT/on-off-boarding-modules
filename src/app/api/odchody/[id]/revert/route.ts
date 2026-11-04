import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import { getOrCreateChecklist } from "@/lib/exit-checklist"
import { notifyExitChecklistSignersAvailableAgain } from "@/lib/exit-checklist-signature-notify"
import { buildManagerNotifyPromptForRemoval } from "@/lib/new-record-manager-watch"
import { getAppBaseUrlFromRequest } from "@/lib/probation-evaluation-request"
import { canWriteOffboarding } from "@/lib/rbac"

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

  if (!canWriteOffboarding(session.user.role)) {
    return NextResponse.json(
      {
        status: "error",
        message: "Nemáte oprávnění vracet odchod do plánovaných.",
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

    const before = await prisma.employeeOffboarding.findFirst({
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

    if (!before.actualEnd) {
      return NextResponse.json(
        {
          status: "error",
          message: "Tento záznam je již v plánovaných odchodech.",
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

    const checklistResult = await getOrCreateChecklist(id)
    const checklistLocked = Boolean(checklistResult?.checklist.lockedAt)

    if (checklistLocked && confirmUnlockChecklist === null) {
      return NextResponse.json({
        status: "confirm_required",
        confirmKind: "unlock_exit_checklist_on_revert",
        message:
          "Výstupní list je uzamčený. Chcete ho po vrácení do plánovaných odemknout a poslat nepodepsaným informaci, že mohou znovu podepsat?",
      })
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedRecord = await tx.employeeOffboarding.update({
        where: { id },
        data: {
          actualEnd: null,
          status: "NEW",
          updatedAt: new Date(),
        },
      })

      await tx.offboardingChangeLog.create({
        data: {
          employeeId: id,
          userId: userKey,
          action: "REVERTED",
          field: "actualEnd",
          oldValue: before.actualEnd?.toISOString() || null,
          newValue: null,
        },
      })

      await tx.offboardingChangeLog.create({
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
      kind: "OFFBOARDING",
      recordId: id,
      reason: "RECORD_RESTORED",
    })

    if (checklistLocked && confirmUnlockChecklist === true && checklistResult) {
      try {
        await prisma.exitChecklist.update({
          where: { id: checklistResult.checklist.id },
          data: { lockedAt: null, lockedById: null },
        })

        await notifyExitChecklistSignersAvailableAgain(
          id,
          getAppBaseUrlFromRequest(req)
        )
      } catch (error) {
        console.error(
          "[ODCHODY-REVERT] Odemčení výstupního listu se nepodařilo:",
          error
        )
      }
    }

    const responseData = {
      ...updated,
      plannedEnd: updated.plannedEnd?.toISOString() || null,
      actualEnd: updated.actualEnd?.toISOString() || null,
      noticeEnd: updated.noticeEnd?.toISOString() || null,
      noticeMonths: updated.noticeMonths ?? 2,
      hasCustomDates: updated.hasCustomDates ?? false,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    }

    return NextResponse.json({
      status: "success",
      data: responseData,
      message: "Odchod byl vrácen do plánovaných.",
      managerNotifyPrompt,
    })
  } catch (err) {
    console.error("Chyba při vracení odchodu:", err)
    return NextResponse.json(
      {
        status: "error",
        message: "Chyba při vracení odchodu.",
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
