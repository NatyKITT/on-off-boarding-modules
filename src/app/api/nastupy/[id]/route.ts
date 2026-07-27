import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { Prisma } from "@prisma/client"
import { z, ZodError } from "zod"

import { env } from "@/env.mjs"

import { prisma } from "@/lib/db"
import {
  buildLinkedEmployeeChangeInfos,
  buildLinkedOffboardingInfo,
  normalizePersonalNumber,
  pickMostRelevantOffboarding,
} from "@/lib/employment-linking"
import { canReadOnboarding, canWriteOnboarding } from "@/lib/rbac"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

type RouteParams = {
  params: {
    id: string
  }
}

type OnboardingRecord = NonNullable<
  Awaited<ReturnType<typeof prisma.employeeOnboarding.findFirst>>
>

type UpdateData = Prisma.EmployeeOnboardingUncheckedUpdateInput

type RawOnboardingBody = {
  generatedSkippedPersonalNumbers?: unknown
  [key: string]: unknown
}

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

const probationExtensionTypeSchema = z.enum([
  "sick_leave",
  "vacation",
  "family_care",
  "maternity_parental",
  "other_obstacle",
  "unexcused_absence",
])

const probationExtensionSchema = z.object({
  id: z.string(),
  type: probationExtensionTypeSchema,
  from: z.string(),
  to: z.string(),
  days: z.number().int().nonnegative(),
  note: z.string().optional(),
})

const updateSchema = z.object({
  titleBefore: z.union([z.string(), z.null()]).optional(),
  name: z.string().optional(),
  surname: z.string().optional(),
  titleAfter: z.union([z.string(), z.null()]).optional(),
  email: z
    .preprocess(emptyToUndefined, z.string().email())
    .optional()
    .nullable(),
  phone: z.union([z.string(), z.null()]).optional(),

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

  startTime: z.union([z.string(), z.null()]).optional(),
  plannedStart: nullableDate,
  actualStart: nullableDate,

  probationEnd: nullableDate,
  hasCustomDates: z.boolean().optional(),
  probationExtensions: z.array(probationExtensionSchema).optional(),
  probationExtensionSummary: z.union([z.string(), z.null()]).optional(),

  supervisorManualOverride: z.boolean().optional(),
  supervisorName: z.union([z.string(), z.null()]).optional(),
  supervisorEmail: z
    .preprocess(emptyToUndefined, z.string().email())
    .optional()
    .nullable(),
  supervisorPosition: z.union([z.string(), z.null()]).optional(),
  supervisorDepartment: z.union([z.string(), z.null()]).optional(),
  supervisorUnitName: z.union([z.string(), z.null()]).optional(),

  mentorName: z.union([z.string(), z.null()]).optional(),
  mentorEmail: z
    .preprocess(emptyToUndefined, z.string().email())
    .optional()
    .nullable(),

  notes: z.union([z.string(), z.null()]).optional(),
  status: z.enum(["NEW", "IN_PROGRESS", "COMPLETED"]).optional(),
})

function toStr(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (value === null || value === undefined) return ""
  return String(value)
}

function buildFullName(parts: Array<string | null | undefined>): string | null {
  const full = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim()

  return full || null
}

function parseEmailList(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function getHrNotificationRecipients(): string[] {
  return parseEmailList(env.HR_NOTIFICATION_EMAILS)
}

function parseGeneratedSkippedPersonalNumbers(
  raw: RawOnboardingBody
): string[] {
  return Array.isArray(raw.generatedSkippedPersonalNumbers)
    ? raw.generatedSkippedPersonalNumbers
        .filter(
          (value: unknown): value is string =>
            typeof value === "string" &&
            value.trim() !== "" &&
            /^\d+$/.test(value.trim())
        )
        .map((value) => value.trim())
    : []
}

async function markPersonalNumbers(
  tx: Prisma.TransactionClient,
  generatedSkipped: string[],
  usedPersonalNumber?: string | null
) {
  if (generatedSkipped.length > 0) {
    await Promise.all(
      generatedSkipped.map((number) =>
        tx.personalNumberGap.upsert({
          where: { number },
          update: { status: "SKIPPED" },
          create: { number, status: "SKIPPED" },
        })
      )
    )
  }

  const used = usedPersonalNumber?.trim()

  if (used) {
    await tx.personalNumberGap.updateMany({
      where: { number: used, status: "SKIPPED" },
      data: { status: "USED", usedAt: new Date() },
    })
  }
}

async function resolveCancelledByName(
  cancelledBy: string | null
): Promise<string | null> {
  if (!cancelledBy) return null

  if (cancelledBy.startsWith("cm") && cancelledBy.length > 20) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: cancelledBy },
        select: { name: true, surname: true, email: true },
      })

      if (user?.name && user?.surname) return `${user.name} ${user.surname}`
      if (user?.email) return user.email
    } catch (error) {
      console.error("Error resolving cancelledBy user:", error)
    }
  }

  return cancelledBy
}

async function resolveDecisionActorName(
  value: string | null
): Promise<string | null> {
  if (!value) return null

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ id: value }, { email: value }],
      },
      select: { name: true, surname: true, email: true },
    })

    if (user?.name && user?.surname) return `${user.name} ${user.surname}`
    if (user?.email) return user.email
  } catch (error) {
    console.error("Error resolving probationStopDecisionBy user:", error)
  }

  return value
}

async function getLinkedOffboardingForOnboarding(
  personalNumber: string | null | undefined,
  probationEnd: Date | null | undefined
) {
  const normalizedPersonalNumber = normalizePersonalNumber(personalNumber)

  if (!normalizedPersonalNumber) {
    return buildLinkedOffboardingInfo({
      offboarding: null,
      probationEnd,
    })
  }

  const linkedOffboardings = await prisma.employeeOffboarding.findMany({
    where: {
      personalNumber: {
        not: null,
      },
      deletedAt: null,
    },
    select: {
      id: true,
      personalNumber: true,
      plannedEnd: true,
      actualEnd: true,
      probationStopDecision: true,
      probationStopDecisionAt: true,
      probationStopDecisionBy: true,
      probationStopNote: true,
    },
  })

  const matchingOffboardings = linkedOffboardings.filter(
    (offboarding) =>
      normalizePersonalNumber(offboarding.personalNumber) ===
      normalizedPersonalNumber
  )

  const linkedOffboardingInfo = buildLinkedOffboardingInfo({
    offboarding: pickMostRelevantOffboarding(matchingOffboardings),
    probationEnd,
  })

  if (linkedOffboardingInfo?.probationStopDecisionBy) {
    linkedOffboardingInfo.probationStopDecisionBy =
      await resolveDecisionActorName(
        linkedOffboardingInfo.probationStopDecisionBy
      )
  }

  return linkedOffboardingInfo
}

async function getLinkedChangesForPersonalNumber(
  personalNumber: string | null | undefined
) {
  const normalizedPersonalNumber = normalizePersonalNumber(personalNumber)

  if (!normalizedPersonalNumber) return []

  const changes = await prisma.employeeChange.findMany({
    where: {
      personalNumber: {
        not: null,
      },
      deletedAt: null,
      status: {
        not: "CANCELLED",
      },
    },
    orderBy: [{ effectiveDate: "desc" }, { id: "desc" }],
  })

  return buildLinkedEmployeeChangeInfos(
    changes.filter(
      (change) =>
        normalizePersonalNumber(change.personalNumber) ===
        normalizedPersonalNumber
    )
  )
}

async function serializeOnboardingRecord(record: OnboardingRecord) {
  const linkedOffboarding = await getLinkedOffboardingForOnboarding(
    record.personalNumber,
    record.probationEnd
  )

  const linkedChanges = await getLinkedChangesForPersonalNumber(
    record.personalNumber
  )

  const cancelledByName = await resolveCancelledByName(record.cancelledBy)

  return {
    ...record,
    plannedStart: record.plannedStart?.toISOString() ?? null,
    actualStart: record.actualStart?.toISOString() ?? null,
    probationEnd: record.probationEnd?.toISOString() ?? null,
    hasCustomDates: record.hasCustomDates ?? false,
    probationExtensions: Array.isArray(record.probationExtensions)
      ? record.probationExtensions
      : [],
    probationExtensionSummary: record.probationExtensionSummary ?? null,
    mentorAssignedFrom: record.mentorAssignedFrom?.toISOString() ?? null,
    mentorAssignedTo: record.mentorAssignedTo?.toISOString() ?? null,
    mentorNotificationSentAt:
      record.mentorNotificationSentAt?.toISOString() ?? null,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
    cancelledBy: cancelledByName,
    cancelReason: record.cancelReason ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    deletedAt: record.deletedAt?.toISOString() ?? null,
    supervisorName: buildFullName([
      record.supervisorTitleBefore,
      record.supervisorName,
      record.supervisorSurname,
      record.supervisorTitleAfter,
    ]),
    supervisorEmail: record.supervisorEmail ?? null,
    supervisorPosition: record.supervisorPosition ?? null,
    supervisorDepartment: record.supervisorDepartment ?? null,
    supervisorUnitName: record.supervisorUnitName ?? null,
    mentorName: buildFullName([
      record.mentorTitleBefore,
      record.mentorName,
      record.mentorSurname,
      record.mentorTitleAfter,
    ]),
    mentorEmail: record.mentorEmail ?? null,
    linkedOffboarding,
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

  if (!canReadOnboarding(role)) {
    return NextResponse.json(
      { status: "error", message: "Nemáte oprávnění číst záznam nástupu." },
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
    const record = await prisma.employeeOnboarding.findFirst({
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
      data: await serializeOnboardingRecord(record),
    })
  } catch (error) {
    console.error("GET /nastupy/[id] error:", error)

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

  if (!canWriteOnboarding(role)) {
    return NextResponse.json(
      {
        status: "error",
        message: "Nemáte oprávnění upravovat záznam nástupu.",
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
    const raw: RawOnboardingBody = await request.json()
    const data = updateSchema.parse(raw)
    const generatedSkipped = parseGeneratedSkippedPersonalNumbers(raw)

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

    const updated = await prisma.$transaction(async (tx) => {
      const updateData: UpdateData = {
        updatedAt: new Date(),
      }

      for (const [key, value] of Object.entries(data)) {
        if (value === undefined) continue

        switch (key) {
          case "plannedStart": {
            if (value !== null) {
              updateData.plannedStart = value as Date
            }
            break
          }

          case "actualStart": {
            updateData.actualStart = value as Date | null
            break
          }

          case "hasCustomDates": {
            updateData.hasCustomDates = Boolean(value)
            break
          }

          case "probationExtensions": {
            updateData.probationExtensions = value as Prisma.InputJsonValue
            break
          }

          case "status": {
            updateData.status = value as "NEW" | "IN_PROGRESS" | "COMPLETED"
            break
          }

          case "personalNumber": {
            updateData.personalNumber =
              value == null ? null : String(value).trim() || null
            break
          }

          default: {
            ;(updateData as Record<string, unknown>)[key] = value
          }
        }
      }

      const completingNow =
        updateData.actualStart !== undefined &&
        before.actualStart === null &&
        updateData.actualStart !== null

      if (completingNow) {
        updateData.status = "COMPLETED"
      }

      const updatedRecord = await tx.employeeOnboarding.update({
        where: { id },
        data: updateData,
      })

      await markPersonalNumbers(
        tx,
        generatedSkipped,
        typeof updateData.personalNumber === "string"
          ? updateData.personalNumber
          : null
      )

      const beforeRec = before as unknown as Record<string, unknown>
      const updateRec = updateData as unknown as Record<string, unknown>

      const changes: Array<{
        field: string
        oldValue: string
        newValue: string
      }> = []

      for (const [key, newValue] of Object.entries(updateRec)) {
        if (key === "updatedAt") continue
        if (key === "probationExtensions") continue

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
        await tx.onboardingChangeLog.create({
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

      return updatedRecord
    })

    return NextResponse.json({
      status: "success",
      message: "Záznam byl úspěšně aktualizován.",
      data: await serializeOnboardingRecord(updated),
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

    console.error("PATCH /nastupy/[id] error:", err)

    return NextResponse.json(
      { status: "error", message: "Chyba při aktualizaci záznamu." },
      { status: 500 }
    )
  }
}

export async function DELETE(_: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Musíte být přihlášeni." },
      { status: 401 }
    )
  }

  const role = session.user.role ?? "USER"

  if (!canWriteOnboarding(role)) {
    return NextResponse.json(
      { status: "error", message: "Nemáte oprávnění mazat záznam nástupu." },
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

  const before = await prisma.employeeOnboarding.findFirst({
    where: {
      id,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      surname: true,
      actualStart: true,
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

  const userKey =
    (session.user as { id?: string; email?: string }).id ??
    session.user.email ??
    "unknown"

  const now = new Date()
  const hrRecipients = getHrNotificationRecipients()

  await prisma.$transaction(async (tx) => {
    await tx.employeeOnboarding.update({
      where: { id },
      data: {
        deletedAt: now,
        deletedBy: userKey,
        deleteReason: "Smazáno uživatelem",
      },
    })

    await tx.onboardingChangeLog.create({
      data: {
        employeeId: before.id,
        userId: userKey,
        action: "DELETED",
        field: "deleted_at",
        oldValue: null,
        newValue: now.toISOString(),
      },
    })

    if (hrRecipients.length > 0) {
      try {
        await tx.mailQueue.create({
          data: {
            type: "SYSTEM_NOTIFICATION",
            payload: {
              type: "employee_onboarding_deleted",
              employeeId: before.id,
              employeeName: `${before.name} ${before.surname}`,
              deletedBy: userKey,
              recipients: hrRecipients,
              subject: `Smazán záznam nástupu - ${before.name} ${before.surname}`,
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
