import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import {
  buildLinkedOnboardingInfo,
  normalizePersonalNumber,
  pickMostRelevantOnboarding,
} from "@/lib/employment-linking"
import { syncLinkedProbationAfterOffboardingDecision } from "@/lib/probation-evaluation-request"
import { canWriteOffboarding } from "@/lib/rbac"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

type MaybeUser =
  | { id?: string | null; email?: string | null }
  | null
  | undefined

function getUserKey(user: MaybeUser): string {
  if (user && typeof user === "object") {
    if (typeof user.id === "string" && user.id.length > 0) return user.id
    if (typeof user.email === "string" && user.email.length > 0)
      return user.email
  }

  return "unknown"
}

function parseEmailList(value?: string): string[] {
  return (value ?? "")
    .split(/[;,]/)
    .map((email) => email.trim())
    .filter((email) => email.length > 0 && email.includes("@"))
}

function getHrNotificationRecipients(): string[] {
  return Array.from(
    new Set([
      ...parseEmailList(process.env.HR_NOTIFICATION_EMAILS),
      ...parseEmailList(process.env.HR_EMAILS),
    ])
  )
}

async function getLinkedOnboardingForOffboarding(
  personalNumber: string | null | undefined,
  exitDate: Date | null | undefined
) {
  const normalizedPersonalNumber = normalizePersonalNumber(personalNumber)

  if (!normalizedPersonalNumber) return null

  const linkedOnboardings = await prisma.employeeOnboarding.findMany({
    where: {
      personalNumber: {
        not: null,
      },
      deletedAt: null,
    },
    select: {
      id: true,
      personalNumber: true,
      plannedStart: true,
      actualStart: true,
      probationEnd: true,
      positionName: true,
      cancelledAt: true,
    },
  })

  const matching = linkedOnboardings.filter(
    (onboarding) =>
      normalizePersonalNumber(onboarding.personalNumber) ===
      normalizedPersonalNumber
  )

  return buildLinkedOnboardingInfo({
    onboarding: pickMostRelevantOnboarding(matching),
    exitDate,
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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
        message: "Nemáte oprávnění obnovovat odchody.",
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

  const createdBy = getUserKey(session.user as MaybeUser)
  const actorName =
    (session.user as { name?: string | null }).name?.trim() ||
    session.user.email ||
    createdBy

  const requestUrl = new URL(req.url)
  const confirmPause = requestUrl.searchParams.get("confirmPause") === "true"
  const isPreview = requestUrl.searchParams.get("preview") === "true"

  try {
    const employee = await prisma.employeeOffboarding.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        surname: true,
        personalNumber: true,
        plannedEnd: true,
        actualEnd: true,
        probationStopDecision: true,
        deletedAt: true,
        deletedBy: true,
        deleteReason: true,
      },
    })

    if (!employee) {
      return NextResponse.json(
        { status: "error", message: "Záznam nenalezen." },
        { status: 404 }
      )
    }

    if (!employee.deletedAt) {
      return NextResponse.json(
        { status: "error", message: "Záznam není smazán." },
        { status: 409 }
      )
    }

    // Obnovení odchodu se STOP rozhodnutím může znovu pozastavit zkušebku
    // navázaného nástupu - na to se HR musí nejdřív zeptat.
    let linkedOnboardingForPause: Awaited<
      ReturnType<typeof getLinkedOnboardingForOffboarding>
    > = null

    if (employee.probationStopDecision === "STOP") {
      linkedOnboardingForPause = await getLinkedOnboardingForOffboarding(
        employee.personalNumber,
        employee.actualEnd ?? employee.plannedEnd
      )
    }

    if (isPreview) {
      const normalizedPersonalNumber = normalizePersonalNumber(
        employee.personalNumber
      )
      const linkedChangesCount = normalizedPersonalNumber
        ? await prisma.employeeChange.count({
            where: {
              personalNumber: normalizedPersonalNumber,
              deletedAt: null,
              status: { not: "CANCELLED" },
            },
          })
        : 0
      const anyLinkedOnboarding =
        linkedOnboardingForPause ??
        (await getLinkedOnboardingForOffboarding(
          employee.personalNumber,
          employee.actualEnd ?? employee.plannedEnd
        ))

      return NextResponse.json({
        status: "success",
        data: {
          willPause: Boolean(linkedOnboardingForPause?.exitDuringProbation),
          linkedOnboarding: anyLinkedOnboarding,
          linkedChangesCount,
        },
      })
    }

    if (linkedOnboardingForPause?.exitDuringProbation && !confirmPause) {
      return NextResponse.json({
        status: "confirm_required",
        confirmKind: "probation_pause_on_restore",
        linkedOnboarding: linkedOnboardingForPause,
      })
    }

    if (employee.personalNumber) {
      const existing = await prisma.employeeOffboarding.findFirst({
        where: {
          personalNumber: employee.personalNumber,
          deletedAt: null,
        },
        select: { id: true },
      })

      if (existing) {
        return NextResponse.json(
          {
            status: "error",
            message: `Zaměstnanec s osobním číslem ${employee.personalNumber} již existuje v aktivních záznamech. Nelze obnovit.`,
          },
          { status: 409 }
        )
      }
    }

    const restoredAt = new Date()
    const hrRecipients = getHrNotificationRecipients()

    await prisma.$transaction(async (tx) => {
      await tx.employeeOffboarding.update({
        where: { id },
        data: {
          deletedAt: null,
          deletedBy: null,
          deleteReason: null,
          updatedAt: restoredAt,
        },
      })

      await tx.offboardingChangeLog.create({
        data: {
          employeeId: id,
          userId: createdBy,
          action: "RESTORED",
          field: "deleted_at",
          oldValue: employee.deletedAt?.toISOString() ?? null,
          newValue: null,
        },
      })

      await tx.offboardingChangeLog.create({
        data: {
          employeeId: id,
          userId: createdBy,
          action: "RESTORED",
          field: "restore_info",
          oldValue: JSON.stringify({
            deletedBy: employee.deletedBy,
            deleteReason: employee.deleteReason,
          }),
          newValue: JSON.stringify({
            restoredBy: createdBy,
            restoredAt: restoredAt.toISOString(),
          }),
        },
      })

      if (linkedOnboardingForPause) {
        await syncLinkedProbationAfterOffboardingDecision(tx, {
          onboardingId: linkedOnboardingForPause.id,
          actorId: createdBy,
          actorName,
        })
      }

      if (hrRecipients.length > 0) {
        await tx.mailQueue.create({
          data: {
            type: "SYSTEM_NOTIFICATION",
            payload: {
              kind: "employee_restored",
              employeeId: id,
              employeeName: `${employee.name} ${employee.surname}`,
              restoredBy: createdBy,
              restoredAt: restoredAt.toISOString(),
              originalDeletedBy: employee.deletedBy,
              originalDeleteReason: employee.deleteReason,
              recipients: hrRecipients,
              subject: `Obnoven záznam odchodu - ${employee.name} ${employee.surname}`,
            },
            priority: 3,
            createdBy,
          },
        })
      }
    })

    return NextResponse.json({
      status: "success",
      message: "Záznam byl úspěšně obnoven.",
      data: {
        id: employee.id,
        name: `${employee.name} ${employee.surname}`,
        restoredAt: restoredAt.toISOString(),
        restoredBy: createdBy,
      },
    })
  } catch (error) {
    console.error("Chyba při obnovování záznamu:", error)

    return NextResponse.json(
      {
        status: "error",
        message: "Chyba při obnovování záznamu.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
