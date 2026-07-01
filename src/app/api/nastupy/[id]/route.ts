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
import {
  normalizePersonSnapshot,
  toMentorFields,
  toSupervisorFields,
} from "@/lib/person-snapshot"
import { canReadOnboarding, canWriteOnboarding } from "@/lib/rbac"
import { resolveSupervisorFromPositionNum } from "@/lib/systemizace-superior"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

interface Params {
  params: { id: string }
}

type OnboardingRecord = NonNullable<
  Awaited<ReturnType<typeof prisma.employeeOnboarding.findFirst>>
>

const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v

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
  name: z.string().min(1, "Jméno je povinné").optional(),
  surname: z.string().min(1, "Příjmení je povinné").optional(),
  titleAfter: z.union([z.string(), z.null()]).optional(),

  email: z
    .preprocess(emptyToUndefined, z.string().email())
    .optional()
    .nullable(),

  phone: z.union([z.string(), z.null()]).optional(),

  positionNum: z.string().optional(),
  positionName: z.string().optional(),
  department: z.string().optional(),
  unitName: z.string().optional(),

  plannedStart: z.preprocess(emptyToUndefined, z.coerce.date()).optional(),
  actualStart: z.preprocess(emptyToUndefined, z.coerce.date()).optional(),
  startTime: z.union([z.string(), z.null()]).optional(),
  probationEnd: z.preprocess(emptyToUndefined, z.coerce.date()).optional(),
  hasCustomDates: z.boolean().optional(),
  probationExtensions: z.array(probationExtensionSchema).optional(),
  probationExtensionSummary: z.union([z.string(), z.null()]).optional(),

  userEmail: z
    .preprocess(emptyToUndefined, z.string().email())
    .optional()
    .nullable(),
  userName: z.union([z.string(), z.null()]).optional(),
  personalNumber: z.union([z.string(), z.null()]).optional(),

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
  status: z.enum(["NEW", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
})

type RawOnboardingBody = {
  generatedSkippedPersonalNumbers?: unknown
  supervisorManualOverride?: boolean
  [key: string]: unknown
}

function parseEmailList(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((item: string) => item.trim())
    .filter(Boolean)
}

function getHrNotificationRecipients(): string[] {
  return parseEmailList(env.HR_NOTIFICATION_EMAILS)
}

function buildFullName(parts: Array<string | null | undefined>): string | null {
  const full = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
  return full || null
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
      personalNumber: normalizedPersonalNumber,
      deletedAt: null,
    },
    select: {
      id: true,
      personalNumber: true,
      plannedEnd: true,
      actualEnd: true,
    },
  })

  return buildLinkedOffboardingInfo({
    offboarding: pickMostRelevantOffboarding(linkedOffboardings),
    probationEnd,
  })
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

async function serializeOnboarding(record: OnboardingRecord) {
  const linkedOffboarding = await getLinkedOffboardingForOnboarding(
    record.personalNumber,
    record.probationEnd
  )

  const linkedChanges = await getLinkedChangesForPersonalNumber(
    record.personalNumber
  )

  return {
    ...record,
    plannedStart: record.plannedStart?.toISOString() || null,
    actualStart: record.actualStart?.toISOString() || null,
    probationEnd: record.probationEnd?.toISOString() || null,
    hasCustomDates: record.hasCustomDates,
    probationExtensions: Array.isArray(record.probationExtensions)
      ? record.probationExtensions
      : [],
    probationExtensionSummary: record.probationExtensionSummary ?? null,

    mentorAssignedFrom: record.mentorAssignedFrom?.toISOString() || null,
    mentorAssignedTo: record.mentorAssignedTo?.toISOString() || null,
    mentorNotificationSentAt:
      record.mentorNotificationSentAt?.toISOString() || null,

    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),

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

    cancelledAt: record.cancelledAt?.toISOString() ?? null,
    cancelledBy: record.cancelledBy ?? null,
    cancelReason: record.cancelReason ?? null,

    linkedOffboarding,
    linkedChanges,
  }
}

async function resolveSupervisor(positionNum?: string | null) {
  const normalized = positionNum?.trim()
  if (!normalized) return null
  return await resolveSupervisorFromPositionNum(normalized)
}

function getEmptySupervisorFields(): Prisma.EmployeeOnboardingUncheckedUpdateInput {
  return {
    supervisorManualOverride: false,
    supervisorSource: null,
    supervisorGid: null,
    supervisorTitleBefore: null,
    supervisorName: null,
    supervisorSurname: null,
    supervisorTitleAfter: null,
    supervisorEmail: null,
    supervisorPosition: null,
    supervisorDepartment: null,
    supervisorUnitName: null,
    supervisorPersonalNumber: null,
  }
}

function getEmptyMentorFields(): Prisma.EmployeeOnboardingUncheckedUpdateInput {
  return {
    mentorSource: null,
    mentorGid: null,
    mentorTitleBefore: null,
    mentorName: null,
    mentorSurname: null,
    mentorTitleAfter: null,
    mentorEmail: null,
    mentorPosition: null,
    mentorDepartment: null,
    mentorUnitName: null,
    mentorPersonalNumber: null,
  }
}

export async function GET(_: NextRequest, { params }: Params) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  if (!canReadOnboarding(session.user.role)) {
    return NextResponse.json(
      {
        status: "error",
        message: "Nemáte oprávnění zobrazit nástup.",
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
      data: await serializeOnboarding(record),
    })
  } catch (error) {
    console.error("Chyba při načítání záznamu:", error)
    return NextResponse.json(
      { status: "error", message: "Nepodařilo se načíst záznam." },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
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
        message: "Nemáte oprávnění upravovat nástupy.",
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

    const generatedSkipped: string[] = Array.isArray(
      raw.generatedSkippedPersonalNumbers
    )
      ? raw.generatedSkippedPersonalNumbers
          .filter(
            (v: unknown): v is string =>
              typeof v === "string" && v.trim() !== "" && /^\d+$/.test(v.trim())
          )
          .map((v: string) => v.trim())
      : []

    const data = updateSchema.parse(raw)

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

    const effectivePositionNum = data.positionNum ?? before.positionNum
    const hasManualSupervisorOverride = raw.supervisorManualOverride === true

    const resolvedSupervisor =
      !hasManualSupervisorOverride && data.positionNum !== undefined
        ? await resolveSupervisor(effectivePositionNum)
        : null

    const updated = await prisma.$transaction(async (tx) => {
      const updateData: Prisma.EmployeeOnboardingUncheckedUpdateInput = {
        updatedAt: new Date(),
      }

      const oldPersonalNumber = (before.personalNumber ?? "").trim() || null
      let newPersonalNumber: string | null = oldPersonalNumber

      if (data.titleBefore !== undefined)
        updateData.titleBefore = data.titleBefore
      if (data.name !== undefined) updateData.name = data.name
      if (data.surname !== undefined) updateData.surname = data.surname
      if (data.titleAfter !== undefined) updateData.titleAfter = data.titleAfter
      if (data.email !== undefined) updateData.email = data.email
      if (data.phone !== undefined) updateData.phone = data.phone

      if (data.positionNum !== undefined)
        updateData.positionNum = data.positionNum
      if (data.positionName !== undefined)
        updateData.positionName = data.positionName
      if (data.department !== undefined) updateData.department = data.department
      if (data.unitName !== undefined) updateData.unitName = data.unitName

      if (data.plannedStart !== undefined)
        updateData.plannedStart = data.plannedStart
      if (data.actualStart !== undefined)
        updateData.actualStart = data.actualStart
      if (data.startTime !== undefined) updateData.startTime = data.startTime
      if (data.probationEnd !== undefined)
        updateData.probationEnd = data.probationEnd

      if (data.hasCustomDates !== undefined) {
        updateData.hasCustomDates = data.hasCustomDates
      }
      if (data.probationExtensions !== undefined) {
        updateData.probationExtensions = (data.probationExtensions ??
          []) as Prisma.InputJsonValue
      }
      if (data.probationExtensionSummary !== undefined) {
        updateData.probationExtensionSummary =
          data.probationExtensionSummary ?? null
      }

      if (data.userEmail !== undefined) updateData.userEmail = data.userEmail
      if (data.userName !== undefined) updateData.userName = data.userName
      if (data.notes !== undefined) updateData.notes = data.notes
      if (data.status !== undefined) updateData.status = data.status

      if (data.personalNumber !== undefined) {
        const trimmed =
          data.personalNumber == null
            ? null
            : String(data.personalNumber).trim() || null

        newPersonalNumber = trimmed
        updateData.personalNumber = trimmed
      }

      if (hasManualSupervisorOverride) {
        const manualSupervisorSnapshot =
          data.supervisorName ||
          data.supervisorEmail ||
          data.supervisorPosition ||
          data.supervisorDepartment ||
          data.supervisorUnitName
            ? (() => {
                const snapshotInput = {
                  source: "MANUAL" as const,
                  name: data.supervisorName ?? null,
                  email: data.supervisorEmail ?? null,
                  position: data.supervisorPosition ?? null,
                  positionName: data.supervisorPosition ?? null,
                  department: data.supervisorDepartment ?? null,
                  unitName: data.supervisorUnitName ?? null,
                }

                return normalizePersonSnapshot(snapshotInput, "MANUAL")
              })()
            : null

        Object.assign(
          updateData,
          getEmptySupervisorFields(),
          manualSupervisorSnapshot
            ? toSupervisorFields(manualSupervisorSnapshot, true)
            : {},
          { supervisorManualOverride: true }
        )
      } else if (resolvedSupervisor?.fields) {
        Object.assign(
          updateData,
          getEmptySupervisorFields(),
          resolvedSupervisor.fields,
          { supervisorManualOverride: false }
        )
      } else if (data.positionNum !== undefined) {
        Object.assign(updateData, getEmptySupervisorFields(), {
          supervisorManualOverride: false,
        })
      }

      if (data.mentorName !== undefined || data.mentorEmail !== undefined) {
        const mentorSnapshot =
          data.mentorName || data.mentorEmail
            ? normalizePersonSnapshot(
                {
                  source: "MANUAL" as const,
                  name: data.mentorName ?? null,
                  email: data.mentorEmail ?? null,
                },
                "MANUAL"
              )
            : null

        Object.assign(
          updateData,
          getEmptyMentorFields(),
          mentorSnapshot ? toMentorFields(mentorSnapshot) : {}
        )

        updateData.mentorAssignedFrom = mentorSnapshot
          ? (before.mentorAssignedFrom ?? new Date())
          : null
      }

      if (data.actualStart && !before.actualStart) {
        updateData.status = "COMPLETED"
      }

      const updatedRecord = await tx.employeeOnboarding.update({
        where: { id },
        data: updateData,
      })

      if (generatedSkipped.length > 0) {
        await Promise.all(
          generatedSkipped.map((num: string) =>
            tx.personalNumberGap.upsert({
              where: { number: num },
              update: { status: "SKIPPED" },
              create: { number: num, status: "SKIPPED" },
            })
          )
        )
      }

      if (oldPersonalNumber && oldPersonalNumber !== newPersonalNumber) {
        await tx.personalNumberGap.updateMany({
          where: { number: oldPersonalNumber, status: "USED" },
          data: { status: "SKIPPED", usedAt: null },
        })
      }

      if (newPersonalNumber && newPersonalNumber !== oldPersonalNumber) {
        await tx.personalNumberGap.updateMany({
          where: { number: newPersonalNumber, status: "SKIPPED" },
          data: { status: "USED", usedAt: new Date() },
        })
      }

      const changes: {
        field: string
        oldValue: string
        newValue: string
      }[] = []

      for (const [key, newValueRaw] of Object.entries(data)) {
        if (newValueRaw === undefined) continue

        const oldValue = before[key as keyof typeof before]

        let oldStr: unknown = oldValue
        let newVal: unknown = newValueRaw

        if (key === "personalNumber") {
          newVal = newPersonalNumber
        }

        if (oldStr instanceof Date) oldStr = oldStr.toISOString()
        if (newVal instanceof Date) newVal = newVal.toISOString()

        const oldS = oldStr == null ? "" : String(oldStr)
        const newS = newVal == null ? "" : String(newVal)

        if (oldS !== newS) {
          changes.push({
            field: key,
            oldValue: oldS,
            newValue: newS,
          })
        }
      }

      for (const change of changes) {
        await tx.onboardingChangeLog.create({
          data: {
            employeeId: id,
            userId: userKey,
            action:
              data.actualStart && !before.actualStart
                ? "STATUS_CHANGED"
                : "UPDATED",
            field: change.field,
            oldValue: change.oldValue || null,
            newValue: change.newValue || null,
          },
        })
      }

      if (data.actualStart && !before.actualStart) {
        await tx.onboardingChangeLog.create({
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

      const hrRecipients = getHrNotificationRecipients()
      if (hrRecipients.length > 0) {
        await tx.mailQueue.create({
          data: {
            type: "SYSTEM_NOTIFICATION",
            payload: {
              type: "employee_updated",
              employeeId: updatedRecord.id,
              employeeName: `${updatedRecord.name} ${updatedRecord.surname}`,
              updatedBy: userKey,
              recipients: hrRecipients,
              subject: `Upraven nástup - ${updatedRecord.name} ${updatedRecord.surname}`,
            },
            priority: 5,
            createdBy: userKey,
          },
        })
      }

      return updatedRecord
    })

    return NextResponse.json({
      status: "success",
      data: await serializeOnboarding(updated),
      message: "Záznam byl úspěšně aktualizován.",
    })
  } catch (err) {
    if (err instanceof ZodError) {
      const msg = err.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")

      return NextResponse.json(
        { status: "error", message: `Formulář obsahuje chyby: ${msg}` },
        { status: 400 }
      )
    }

    console.error("Chyba při aktualizaci záznamu:", err)
    return NextResponse.json(
      {
        status: "error",
        message: "Chyba při aktualizaci záznamu.",
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Musíte být přihlášeni." },
      { status: 401 }
    )
  }

  if (!canWriteOnboarding(session.user.role)) {
    return NextResponse.json(
      {
        status: "error",
        message: "Nemáte oprávnění mazat nástupy.",
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

  const before = await prisma.employeeOnboarding.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      surname: true,
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

  await prisma.$transaction(async (tx) => {
    const deletedAt = new Date()

    await tx.employeeOnboarding.update({
      where: { id },
      data: {
        deletedAt,
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
        newValue: deletedAt.toISOString(),
      },
    })

    const hrRecipients = getHrNotificationRecipients()
    if (hrRecipients.length > 0) {
      await tx.mailQueue.create({
        data: {
          type: "SYSTEM_NOTIFICATION",
          payload: {
            type: "employee_deleted",
            employeeId: before.id,
            employeeName: `${before.name} ${before.surname}`,
            deletedBy: userKey,
            recipients: hrRecipients,
            subject: `Smazán záznam zaměstnance - ${before.name} ${before.surname}`,
          },
          priority: 5,
          createdBy: userKey,
        },
      })
    }
  })

  return NextResponse.json({
    status: "success",
    message: "Záznam byl úspěšně smazán.",
    data: {
      id: before.id,
      name: `${before.name} ${before.surname}`,
      deletedAt: new Date().toISOString(),
      deletedBy: userKey,
    },
  })
}
