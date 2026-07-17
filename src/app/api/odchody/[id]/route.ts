import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { Prisma } from "@prisma/client"
import { z, ZodError } from "zod"

import { prisma } from "@/lib/db"
import { getHrRecipientsFromEnv } from "@/lib/email"
import {
  buildLinkedEmployeeChangeInfos,
  buildLinkedOnboardingInfo,
  normalizePersonalNumber,
  pickMostRelevantOnboarding,
} from "@/lib/employment-linking"
import {
  getUserKey,
  getUserLabel,
  syncLinkedProbationAfterOffboardingDecision,
} from "@/lib/probation-evaluation-request"
import { canReadOffboarding, canWriteOffboarding } from "@/lib/rbac"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

type RouteParams = {
  params: {
    id: string
  }
}

type OffboardingRecord = NonNullable<
  Awaited<ReturnType<typeof prisma.employeeOffboarding.findFirst>>
>

type UpdateData = Prisma.EmployeeOffboardingUncheckedUpdateInput

const emptyToUndefined = (v: unknown) =>
  v === null
    ? undefined
    : typeof v === "string" && v.trim() === ""
      ? undefined
      : v

const emptyStringToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v

const nullableDate = z.preprocess(
  emptyStringToUndefined,
  z.union([z.null(), z.coerce.date()]).optional()
)

const updateSchema = z.object({
  titleBefore: z.union([z.string(), z.null()]).optional(),
  name: z.string().optional(),
  surname: z.string().optional(),
  titleAfter: z.union([z.string(), z.null()]).optional(),

  userEmail: z
    .preprocess(emptyToUndefined, z.string().email())
    .optional()
    .nullable(),
  userName: z.union([z.string(), z.null()]).optional(),
  personalNumber: z.union([z.string(), z.null()]).optional(),

  positionNum: z.string().optional(),
  positionName: z.string().optional(),
  department: z.string().optional(),
  unitName: z.string().optional(),

  plannedEnd: nullableDate,
  actualEnd: nullableDate,
  noticeEnd: nullableDate,
  noticePeriodEnd: nullableDate,

  noticeMonths: z.preprocess(emptyToUndefined, z.coerce.number()).optional(),
  hasCustomDates: z.boolean().optional(),

  notes: z.union([z.string(), z.null()]).optional(),
  status: z.enum(["NEW", "IN_PROGRESS", "COMPLETED"]).optional(),

  probationStopDecision: z.enum(["STOP", "KEEP"]).nullable().optional(),
  probationStopNote: z.union([z.string(), z.null()]).optional(),
})

function toStr(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (value === null || value === undefined) return ""
  return String(value)
}

async function getLinkedChangesForPersonalNumber(
  personalNumber: string | null | undefined
) {
  const normalizedPersonalNumber = normalizePersonalNumber(personalNumber)

  if (!normalizedPersonalNumber) return []

  const changes = await prisma.employeeChange.findMany({
    where: {
      personalNumber: normalizedPersonalNumber,
      deletedAt: null,
      status: {
        not: "CANCELLED",
      },
    },
    orderBy: [{ effectiveDate: "desc" }, { id: "desc" }],
  })

  return buildLinkedEmployeeChangeInfos(changes)
}

async function getLinkedOnboardingForOffboarding(
  personalNumber: string | null | undefined,
  exitDate: Date | null | undefined
) {
  const normalizedPersonalNumber = normalizePersonalNumber(personalNumber)

  if (!normalizedPersonalNumber) {
    return buildLinkedOnboardingInfo({
      onboarding: null,
      exitDate,
    })
  }

  const linkedOnboardings = await prisma.employeeOnboarding.findMany({
    where: {
      personalNumber: normalizedPersonalNumber,
      deletedAt: null,
    },
    select: {
      id: true,
      personalNumber: true,
      plannedStart: true,
      actualStart: true,
      probationEnd: true,
      positionName: true,
    },
  })

  return buildLinkedOnboardingInfo({
    onboarding: pickMostRelevantOnboarding(linkedOnboardings),
    exitDate,
  })
}

async function serializeOffboardingRecord(record: OffboardingRecord) {
  const linkedOnboarding = await getLinkedOnboardingForOffboarding(
    record.personalNumber,
    record.actualEnd ?? record.plannedEnd
  )

  const linkedChanges = await getLinkedChangesForPersonalNumber(
    record.personalNumber
  )

  return {
    ...record,
    plannedEnd: record.plannedEnd?.toISOString() ?? null,
    actualEnd: record.actualEnd?.toISOString() ?? null,
    noticeEnd: record.noticeEnd?.toISOString() ?? null,
    noticeMonths: record.noticeMonths ?? 2,
    hasCustomDates: record.hasCustomDates ?? false,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    linkedOnboarding,
    linkedChanges,
  }
}

export async function GET(_: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  const role = session.user.role ?? "USER"

  if (!canReadOffboarding(role)) {
    return NextResponse.json(
      { status: "error", message: "Nemáte oprávnění číst záznam odchodu." },
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
    const record = await prisma.employeeOffboarding.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    })

    if (!record) {
      return NextResponse.json(
        { status: "error", message: "Záznam nenalezen." },
        { status: 404 }
      )
    }

    return NextResponse.json({
      status: "success",
      data: await serializeOffboardingRecord(record),
    })
  } catch (error) {
    console.error("GET /odchody/[id] error:", error)

    return NextResponse.json(
      { status: "error", message: "Nepodařilo se načíst záznam." },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  const role = session.user.role ?? "USER"

  if (!canWriteOffboarding(role)) {
    return NextResponse.json(
      {
        status: "error",
        message: "Nemáte oprávnění upravovat záznam odchodu.",
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
    const raw = await request.json()
    const data = updateSchema.parse(raw)

    const userKey = getUserKey({
      id: (session.user as { id?: string }).id,
      email: session.user.email,
    })
    const userName = getUserLabel({
      name: session.user.name,
      email: session.user.email,
    })

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

    const updated = await prisma.$transaction(async (tx) => {
      const updateData: UpdateData = {
        updatedAt: new Date(),
      }

      for (const [key, value] of Object.entries(data)) {
        if (value === undefined) continue

        switch (key) {
          case "noticePeriodEnd": {
            updateData.noticeEnd = value as Date | null
            break
          }

          case "noticeEnd": {
            if (!("noticePeriodEnd" in data)) {
              updateData.noticeEnd = value as Date | null
            }
            break
          }

          case "plannedEnd": {
            if (value !== null) {
              updateData.plannedEnd = value as Date
            }
            break
          }

          case "actualEnd": {
            updateData.actualEnd = value as Date | null
            break
          }

          case "noticeMonths": {
            updateData.noticeMonths = value as number
            break
          }

          case "hasCustomDates": {
            updateData.hasCustomDates = Boolean(value)
            break
          }

          case "status": {
            updateData.status = value as "NEW" | "IN_PROGRESS" | "COMPLETED"
            break
          }

          case "probationStopDecision": {
            const decision = value as "STOP" | "KEEP" | null
            updateData.probationStopDecision = decision
            updateData.probationStopDecisionAt = decision ? new Date() : null
            updateData.probationStopDecisionBy = decision ? userKey : null
            break
          }

          default: {
            ;(updateData as Record<string, unknown>)[key] = value
          }
        }
      }

      const completingNow =
        updateData.actualEnd !== undefined &&
        before.actualEnd === null &&
        updateData.actualEnd !== null

      if (completingNow) {
        updateData.status = "COMPLETED"
      }

      const updatedRecord = await tx.employeeOffboarding.update({
        where: { id },
        data: updateData,
      })

      const beforeRec = before as unknown as Record<string, unknown>
      const updateRec = updateData as unknown as Record<string, unknown>

      const changes: Array<{
        field: string
        oldValue: string
        newValue: string
      }> = []

      for (const [key, newValue] of Object.entries(updateRec)) {
        if (key === "updatedAt") continue

        const oldValue = beforeRec[key]
        const oldStr = toStr(oldValue)
        const newStr = toStr(newValue)

        if (oldStr !== newStr) {
          changes.push({
            field: key,
            oldValue: oldStr,
            newValue: newStr,
          })
        }
      }

      for (const change of changes) {
        await tx.offboardingChangeLog.create({
          data: {
            employeeId: id,
            userId: userKey,
            action: completingNow ? "STATUS_CHANGED" : "UPDATED",
            field: change.field,
            oldValue: change.oldValue || null,
            newValue: change.newValue || null,
          },
        })
      }

      if (completingNow) {
        await tx.offboardingChangeLog.create({
          data: {
            employeeId: id,
            userId: userKey,
            action: "STATUS_CHANGED",
            field: "status",
            oldValue: before.status,
            newValue: "COMPLETED",
          },
        })
      }

      if (
        data.probationStopDecision !== undefined &&
        data.probationStopDecision !== before.probationStopDecision
      ) {
        const linkedOnboarding = await getLinkedOnboardingForOffboarding(
          updatedRecord.personalNumber,
          updatedRecord.actualEnd ?? updatedRecord.plannedEnd
        )

        if (linkedOnboarding) {
          await syncLinkedProbationAfterOffboardingDecision(tx, {
            onboardingId: linkedOnboarding.id,
            actorId: userKey,
            actorName: userName,
          })
        }
      }

      return updatedRecord
    })

    return NextResponse.json({
      status: "success",
      message: "Záznam byl úspěšně aktualizován.",
      data: await serializeOffboardingRecord(updated),
    })
  } catch (err) {
    if (err instanceof ZodError) {
      const msg = err.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")

      return NextResponse.json(
        { status: "error", message: `Formulář obsahuje chyby: ${msg}` },
        { status: 400 }
      )
    }

    console.error("PATCH /odchody/[id] error:", err)

    return NextResponse.json(
      { status: "error", message: "Chyba při aktualizaci záznamu." },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Musíte být přihlášeni." },
      { status: 401 }
    )
  }

  const role = session.user.role ?? "USER"

  if (!canWriteOffboarding(role)) {
    return NextResponse.json(
      { status: "error", message: "Nemáte oprávnění mazat záznam odchodu." },
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

  const confirmReactivate =
    new URL(request.url).searchParams.get("confirmReactivate") === "true"

  const before = await prisma.employeeOffboarding.findFirst({
    where: {
      id,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      surname: true,
      actualEnd: true,
      plannedEnd: true,
      personalNumber: true,
      probationStopDecision: true,
      deletedAt: true,
    },
  })

  if (!before) {
    return NextResponse.json(
      { status: "error", message: "Záznam nenalezen." },
      { status: 404 }
    )
  }

  if (before.deletedAt) {
    return NextResponse.json(
      { status: "error", message: "Záznam už je smazán." },
      { status: 409 }
    )
  }

  const userKey = getUserKey({
    id: (session.user as { id?: string }).id,
    email: session.user.email,
  })
  const userName = getUserLabel({
    name: session.user.name,
    email: session.user.email,
  })

  // Když tento odchod aktivně pozastavuje zkušebku navázaného nástupu, smazání
  // odchodu tu vazbu odstraní a zkušebka se má znovu rozjet - na to se HR musí
  // nejdřív zeptat, ať se to nestane jako vedlejší efekt jednoho kliknutí.
  let linkedOnboardingForReactivation: Awaited<
    ReturnType<typeof getLinkedOnboardingForOffboarding>
  > = null

  if (before.probationStopDecision === "STOP") {
    linkedOnboardingForReactivation = await getLinkedOnboardingForOffboarding(
      before.personalNumber,
      before.actualEnd ?? before.plannedEnd
    )
  }

  if (
    linkedOnboardingForReactivation?.exitDuringProbation &&
    !confirmReactivate
  ) {
    return NextResponse.json({
      status: "confirm_required",
      confirmKind: "probation_reactivate_on_delete",
      linkedOnboarding: linkedOnboardingForReactivation,
    })
  }

  const now = new Date()
  const hrRecipients = getHrRecipientsFromEnv()

  await prisma.$transaction(async (tx) => {
    await tx.employeeOffboarding.update({
      where: { id },
      data: {
        deletedAt: now,
        deletedBy: userKey,
        deleteReason: "Smazáno uživatelem",
      },
    })

    await tx.offboardingChangeLog.create({
      data: {
        employeeId: before.id,
        userId: userKey,
        action: "DELETED",
        field: "deleted_at",
        oldValue: null,
        newValue: now.toISOString(),
      },
    })

    if (linkedOnboardingForReactivation) {
      await syncLinkedProbationAfterOffboardingDecision(tx, {
        onboardingId: linkedOnboardingForReactivation.id,
        actorId: userKey,
        actorName: userName,
      })
    }

    if (hrRecipients.length > 0) {
      try {
        await tx.mailQueue.create({
          data: {
            type: "SYSTEM_NOTIFICATION",
            payload: {
              type: "employee_offboarding_deleted",
              employeeId: before.id,
              employeeName: `${before.name} ${before.surname}`,
              deletedBy: userKey,
              recipients: hrRecipients,
              subject: `Smazán záznam odchodu - ${before.name} ${before.surname}`,
            },
            priority: 5,
            createdBy: userKey,
          },
        })
      } catch (mailErr) {
        console.warn("Warning: Could not create mail queue entry:", mailErr)
      }
    }
  })

  return NextResponse.json({
    status: "success",
    message: "Záznam byl úspěšně smazán.",
    data: {
      id: before.id,
      name: `${before.name} ${before.surname}`,
      deletedAt: now.toISOString(),
      deletedBy: userKey,
    },
  })
}
