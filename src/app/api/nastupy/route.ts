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

const base = z.object({
  titleBefore: z.union([z.string(), z.null()]).optional(),
  name: z.string().min(1, "Jméno je povinné"),
  surname: z.string().min(1, "Příjmení je povinné"),
  titleAfter: z.union([z.string(), z.null()]).optional(),
  email: z
    .preprocess(emptyToUndefined, z.string().email())
    .optional()
    .nullable(),
  phone: z.union([z.string(), z.null()]).optional(),

  positionNum: z.string().min(1, "Číslo pozice je povinné"),
  positionName: z.string().optional(),
  department: z.string().optional(),
  unitName: z.string().optional(),

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
})

const createPlannedSchema = base.extend({
  plannedStart: z.preprocess(
    emptyToUndefined,
    z.coerce.date({
      required_error: "Datum plánovaného nástupu je povinné.",
      invalid_type_error: "Neplatné datum plánovaného nástupu.",
    })
  ),
})

const createActualSchema = base.extend({
  plannedStart: z.preprocess(emptyToUndefined, z.coerce.date()).optional(),
  actualStart: z.preprocess(
    emptyToUndefined,
    z.coerce.date({
      required_error: "Datum skutečného nástupu je povinné.",
      invalid_type_error: "Neplatné datum skutečného nástupu.",
    })
  ),
})

type SessionUser = {
  id?: string | null
  email?: string | null
}

type RawOnboardingBody = {
  actualStart?: string | null
  generatedSkippedPersonalNumbers?: unknown
  supervisorManualOverride?: boolean
  [key: string]: unknown
}

type OnboardingRecord = Awaited<
  ReturnType<typeof prisma.employeeOnboarding.findMany>
>[number]

type LinkablePersonalNumber = {
  personalNumber: string | null
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

function buildFullName(parts: Array<string | null | undefined>): string | null {
  const full = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim()

  return full || null
}

function collectPersonalNumbers<T extends LinkablePersonalNumber>(rows: T[]) {
  return Array.from(
    new Set(
      rows
        .map((row) => normalizePersonalNumber(row.personalNumber))
        .filter((value): value is string => value.length > 0)
    )
  )
}

function groupByPersonalNumber<T extends LinkablePersonalNumber>(rows: T[]) {
  const map = new Map<string, T[]>()

  for (const row of rows) {
    const personalNumber = normalizePersonalNumber(row.personalNumber)

    if (!personalNumber) continue

    const current = map.get(personalNumber) ?? []
    current.push(row)
    map.set(personalNumber, current)
  }

  return map
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

async function serializeOnboardingRecord(
  record: OnboardingRecord,
  linkedOffboarding: ReturnType<typeof buildLinkedOffboardingInfo> = null,
  linkedChanges: ReturnType<typeof buildLinkedEmployeeChangeInfos> = []
) {
  const cancelledByName = await resolveCancelledByName(record.cancelledBy)

  return {
    ...record,
    plannedStart: record.plannedStart?.toISOString() ?? null,
    actualStart: record.actualStart?.toISOString() ?? null,
    probationEnd: record.probationEnd?.toISOString() ?? null,
    hasCustomDates: record.hasCustomDates,
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

async function serializeOnboardingRecordWithLinks(record: OnboardingRecord) {
  const linkedOffboarding = await getLinkedOffboardingForOnboarding(
    record.personalNumber,
    record.probationEnd
  )

  const linkedChanges = await getLinkedChangesForPersonalNumber(
    record.personalNumber
  )

  return serializeOnboardingRecord(record, linkedOffboarding, linkedChanges)
}

async function resolveSupervisor(positionNum: string) {
  return await resolveSupervisorFromPositionNum(positionNum)
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

function createEmptySupervisorOverrideFields() {
  return {
    supervisorManualOverride: true,
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

async function buildPersonFields(
  data: z.infer<typeof base>,
  manualOverride: boolean
) {
  const resolvedSupervisor = manualOverride
    ? null
    : await resolveSupervisor(data.positionNum)

  const supervisorSnapshot = manualOverride
    ? data.supervisorName ||
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
    : null

  const supervisorFields = manualOverride
    ? supervisorSnapshot
      ? toSupervisorFields(supervisorSnapshot, true)
      : createEmptySupervisorOverrideFields()
    : (resolvedSupervisor?.fields ?? {})

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

  return {
    supervisorFields,
    mentorFields: mentorSnapshot ? toMentorFields(mentorSnapshot) : {},
    mentorAssignedFrom: mentorSnapshot ? new Date() : null,
  }
}

async function markPersonalNumbers(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
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

export async function GET() {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Unauthorized" },
      { status: 401 }
    )
  }

  if (!canReadOnboarding(session.user.role)) {
    return NextResponse.json(
      {
        status: "error",
        message: "Nemáte oprávnění zobrazit nástupy.",
      },
      { status: 403 }
    )
  }

  try {
    const records = await prisma.employeeOnboarding.findMany({
      where: { deletedAt: null },
      orderBy: [{ plannedStart: "desc" }, { id: "desc" }],
    })

    const personalNumbers = collectPersonalNumbers(records)

    const linkedOffboardings =
      personalNumbers.length > 0
        ? await prisma.employeeOffboarding.findMany({
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
            },
          })
        : []

    const linkedEmployeeChanges =
      personalNumbers.length > 0
        ? await prisma.employeeChange.findMany({
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
        : []

    const offboardingsByPersonalNumber =
      groupByPersonalNumber(linkedOffboardings)

    const changesByPersonalNumber = groupByPersonalNumber(linkedEmployeeChanges)

    const data = await Promise.all(
      records.map(async (record) => {
        const personalNumber = normalizePersonalNumber(record.personalNumber)

        const linkedOffboarding = pickMostRelevantOffboarding(
          personalNumber
            ? (offboardingsByPersonalNumber.get(personalNumber) ?? [])
            : []
        )

        const linkedChanges = buildLinkedEmployeeChangeInfos(
          personalNumber
            ? (changesByPersonalNumber.get(personalNumber) ?? [])
            : []
        )

        return serializeOnboardingRecord(
          record,
          buildLinkedOffboardingInfo({
            offboarding: linkedOffboarding,
            probationEnd: record.probationEnd,
          }),
          linkedChanges
        )
      })
    )

    return NextResponse.json({ status: "success", data })
  } catch (error) {
    console.error("Error fetching onboarding records:", error)

    return NextResponse.json(
      { status: "error", message: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
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
        message: "Nemáte oprávnění vytvářet nástupy.",
      },
      { status: 403 }
    )
  }

  try {
    const raw: RawOnboardingBody = await request.json()
    const hasManualSupervisorOverride = raw.supervisorManualOverride === true
    const isActual =
      raw.actualStart != null && String(raw.actualStart).trim() !== ""
    const generatedSkipped = parseGeneratedSkippedPersonalNumbers(raw)

    const createdBy = ((session.user as SessionUser).id ??
      session.user.email ??
      "unknown") as string

    if (isActual) {
      const data = createActualSchema.parse(raw)
      const planned = data.plannedStart ?? data.actualStart
      const { supervisorFields, mentorFields, mentorAssignedFrom } =
        await buildPersonFields(data, hasManualSupervisorOverride)

      const created = await prisma.$transaction(async (tx) => {
        const newEmployee = await tx.employeeOnboarding.create({
          data: {
            name: data.name,
            surname: data.surname,
            titleBefore: data.titleBefore ?? null,
            titleAfter: data.titleAfter ?? null,
            email: data.email ?? null,
            phone: data.phone ?? null,
            plannedStart: planned,
            actualStart: data.actualStart,
            startTime: data.startTime ?? null,
            probationEnd: data.probationEnd ?? null,
            hasCustomDates: data.hasCustomDates ?? false,
            probationExtensions: (data.probationExtensions ??
              []) as Prisma.InputJsonValue,
            probationExtensionSummary: data.probationExtensionSummary ?? null,
            positionNum: data.positionNum,
            positionName: data.positionName ?? "",
            department: data.department ?? "",
            unitName: data.unitName ?? "",
            notes: data.notes ?? null,
            userEmail: data.userEmail ?? null,
            userName: data.userName ?? null,
            personalNumber:
              normalizePersonalNumber(data.personalNumber) || null,
            ...supervisorFields,
            ...mentorFields,
            mentorAssignedFrom,
            status: "COMPLETED",
          },
        })

        await markPersonalNumbers(
          tx,
          generatedSkipped,
          normalizePersonalNumber(data.personalNumber) || null
        )

        await tx.onboardingChangeLog.create({
          data: {
            employeeId: newEmployee.id,
            userId: createdBy,
            action: "CREATED",
            field: "initial_creation",
            oldValue: null,
            newValue: JSON.stringify({
              type: "actual_onboarding",
              name: `${data.name} ${data.surname}`,
              position: data.positionName,
              actualStart: data.actualStart.toISOString(),
            }),
          },
        })

        const hrRecipients = getHrNotificationRecipients()

        if (hrRecipients.length > 0) {
          await tx.mailQueue.create({
            data: {
              type: "SYSTEM_NOTIFICATION",
              payload: {
                type: "employee_created_actual",
                employeeId: newEmployee.id,
                employeeName: `${data.name} ${data.surname}`,
                createdBy,
                recipients: hrRecipients,
                subject: `Vytvořen skutečný nástup - ${data.name} ${data.surname}`,
              },
              priority: 5,
              createdBy,
            },
          })
        }

        return newEmployee
      })

      return NextResponse.json({
        status: "success",
        data: await serializeOnboardingRecordWithLinks(created),
      })
    }

    const data = createPlannedSchema.parse(raw)
    const { supervisorFields, mentorFields, mentorAssignedFrom } =
      await buildPersonFields(data, hasManualSupervisorOverride)

    const created = await prisma.$transaction(async (tx) => {
      const newEmployee = await tx.employeeOnboarding.create({
        data: {
          name: data.name,
          surname: data.surname,
          titleBefore: data.titleBefore ?? null,
          titleAfter: data.titleAfter ?? null,
          email: data.email ?? null,
          phone: data.phone ?? null,
          plannedStart: data.plannedStart,
          actualStart: null,
          startTime: data.startTime ?? null,
          probationEnd: data.probationEnd ?? null,
          hasCustomDates: data.hasCustomDates ?? false,
          probationExtensions: (data.probationExtensions ??
            []) as Prisma.InputJsonValue,
          probationExtensionSummary: data.probationExtensionSummary ?? null,
          positionNum: data.positionNum,
          positionName: data.positionName ?? "",
          department: data.department ?? "",
          unitName: data.unitName ?? "",
          notes: data.notes ?? null,
          userEmail: data.userEmail ?? null,
          userName: data.userName ?? null,
          personalNumber: data.personalNumber ?? null,
          ...supervisorFields,
          ...mentorFields,
          mentorAssignedFrom,
          status: "NEW",
        },
      })

      await markPersonalNumbers(tx, generatedSkipped, data.personalNumber)

      await tx.onboardingChangeLog.create({
        data: {
          employeeId: newEmployee.id,
          userId: createdBy,
          action: "CREATED",
          field: "initial_creation",
          oldValue: null,
          newValue: JSON.stringify({
            type: "planned_onboarding",
            name: `${data.name} ${data.surname}`,
            position: data.positionName,
            plannedStart: data.plannedStart.toISOString(),
          }),
        },
      })

      const hrRecipients = getHrNotificationRecipients()

      if (hrRecipients.length > 0) {
        await tx.mailQueue.create({
          data: {
            type: "SYSTEM_NOTIFICATION",
            payload: {
              type: "employee_created_planned",
              employeeId: newEmployee.id,
              employeeName: `${data.name} ${data.surname}`,
              createdBy,
              recipients: hrRecipients,
              subject: `Vytvořen plánovaný nástup - ${data.name} ${data.surname}`,
            },
            priority: 5,
            createdBy,
          },
        })
      }

      return newEmployee
    })

    return NextResponse.json({
      status: "success",
      data: await serializeOnboardingRecordWithLinks(created),
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

    console.error("Chyba při vytváření nástupu:", err)

    return NextResponse.json(
      {
        status: "error",
        message: "Chyba při vytváření nástupu.",
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
