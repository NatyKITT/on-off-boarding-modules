import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import { notifyExitChecklistSignersAvailableAgain } from "@/lib/exit-checklist-signature-notify"
import { buildManagerNotifyPromptForRemoval } from "@/lib/new-record-manager-watch"
import { getAppBaseUrlFromRequest } from "@/lib/probation-evaluation-request"
import { canWriteOffboarding } from "@/lib/rbac"

export const dynamic = "force-dynamic"

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
        message: "Nemáte oprávnění obnovovat zrušené odchody.",
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

    if (!before.cancelledAt) {
      return NextResponse.json(
        { status: "error", message: "Tento odchod není zrušen." },
        { status: 409 }
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      const newStatus = before.actualEnd ? "COMPLETED" : "NEW"

      const updatedRecord = await tx.employeeOffboarding.update({
        where: { id },
        data: {
          cancelledAt: null,
          cancelledBy: null,
          cancelReason: null,
          status: newStatus,
        },
      })

      await tx.offboardingChangeLog.create({
        data: {
          employeeId: id,
          userId: userKey,
          action: "RESTORED",
          field: "cancelled_at",
          oldValue: before.cancelledAt?.toISOString() ?? null,
          newValue: null,
        },
      })

      return updatedRecord
    })

    const managerNotifyPrompt =
      before.actualEnd === null
        ? await buildManagerNotifyPromptForRemoval({
            kind: "OFFBOARDING",
            recordId: id,
            reason: "RECORD_RESTORED",
          })
        : null

    try {
      await notifyExitChecklistSignersAvailableAgain(
        id,
        getAppBaseUrlFromRequest(req)
      )
    } catch (error) {
      console.error(
        "[ODCHODY-RESTORE-CANCELLED] Oznámení podepisujících se nepodařilo:",
        error
      )
    }

    return NextResponse.json({
      status: "success",
      message: "Odchod byl obnoven.",
      data: {
        id: updated.id,
        status: updated.status,
      },
      managerNotifyPrompt,
    })
  } catch (error) {
    console.error("Error restoring offboarding:", error)
    return NextResponse.json(
      {
        status: "error",
        message: "Chyba při obnovování odchodu.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
