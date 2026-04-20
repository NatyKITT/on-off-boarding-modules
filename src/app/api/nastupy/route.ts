import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { z, ZodError } from "zod"

import { env } from "@/env.mjs"

import { prisma } from "@/lib/db"
import {
  normalizePersonSnapshot,
  toMentorFields,
  toSupervisorFields,
} from "@/lib/person-snapshot"
import { resolveSupervisorFromPositionNum } from "@/lib/systemizace-superior"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v

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

function serializeOnboardingRecord(
  record: Awaited<ReturnType<typeof prisma.employeeOnboarding.findMany>>[number]
) {
  return {
    ...record,
    plannedStart: record.plannedStart?.toISOString() ?? null,
    actualStart: record.actualStart?.toISOString() ?? null,
    probationEnd: record.probationEnd?.toISOString() ?? null,

    mentorAssignedFrom: record.mentorAssignedFrom?.toISOString() ?? null,
    mentorAssignedTo: record.mentorAssignedTo?.toISOString() ?? null,
    mentorNotificationSentAt:
      record.mentorNotificationSentAt?.toISOString() ?? null,

    probationEvaluationSentAt:
      record.probationEvaluationSentAt?.toISOString() ?? null,
    probationNotification21Sent:
      record.probationNotification21Sent?.toISOString() ?? null,
    probationNotificationHRSent:
      record.probationNotificationHRSent?.toISOString() ?? null,
    probationReminder1DaySent:
      record.probationReminder1DaySent?.toISOString() ?? null,
    probationCompletedNotified:
      record.probationCompletedNotified?.toISOString() ?? null,
    probationHashExpiresAt:
      record.probationHashExpiresAt?.toISOString() ?? null,
    probationHashUsedAt: record.probationHashUsedAt?.toISOString() ?? null,
    lastProbationReminder: record.lastProbationReminder?.toISOString() ?? null,

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

    mentorName: buildFullName([
      record.mentorTitleBefore,
      record.mentorName,
      record.mentorSurname,
      record.mentorTitleAfter,
    ]),
    mentorEmail: record.mentorEmail ?? null,
  }
}

async function resolveSupervisor(positionNum: string) {
  return await resolveSupervisorFromPositionNum(positionNum)
}

export async function GET() {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Unauthorized" },
      { status: 401 }
    )
  }

  try {
    const records = await prisma.employeeOnboarding.findMany({
      where: { deletedAt: null },
      orderBy: [{ plannedStart: "desc" }, { id: "desc" }],
    })

    const data = records.map((record) => serializeOnboardingRecord(record))

    return NextResponse.json({
      status: "success",
      data,
    })
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

  try {
    const raw: RawOnboardingBody = await request.json()
    const hasManualSupervisorOverride = raw.supervisorManualOverride === true

    const isActual =
      raw.actualStart != null && String(raw.actualStart).trim() !== ""

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

    const createdBy = ((session.user as SessionUser).id ??
      session.user.email ??
      "unknown") as string

    if (isActual) {
      const data = createActualSchema.parse(raw)
      const planned = data.plannedStart ?? data.actualStart

      const resolvedSupervisor = hasManualSupervisorOverride
        ? null
        : await resolveSupervisor(data.positionNum)

      const supervisorSnapshot = hasManualSupervisorOverride
        ? data.supervisorName || data.supervisorEmail
          ? normalizePersonSnapshot(
              {
                source: "MANUAL",
                name: data.supervisorName ?? null,
                email: data.supervisorEmail ?? null,
              },
              "MANUAL"
            )
          : null
        : null

      const supervisorFields = hasManualSupervisorOverride
        ? supervisorSnapshot
          ? toSupervisorFields(supervisorSnapshot, true)
          : {
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
        : (resolvedSupervisor?.fields ?? {})

      const mentorSnapshot =
        data.mentorName || data.mentorEmail
          ? normalizePersonSnapshot(
              {
                source: "MANUAL",
                name: data.mentorName ?? null,
                email: data.mentorEmail ?? null,
              },
              "MANUAL"
            )
          : null

      const mentorFields = mentorSnapshot ? toMentorFields(mentorSnapshot) : {}

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
            mentorAssignedFrom: mentorSnapshot ? new Date() : null,

            status: "COMPLETED",
          },
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

        if (data.personalNumber && data.personalNumber.trim() !== "") {
          await tx.personalNumberGap.updateMany({
            where: {
              number: data.personalNumber.trim(),
              status: "SKIPPED",
            },
            data: { status: "USED", usedAt: new Date() },
          })
        }

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
        data: serializeOnboardingRecord(created),
      })
    }

    const data = createPlannedSchema.parse(raw)

    const resolvedSupervisor = hasManualSupervisorOverride
      ? null
      : await resolveSupervisor(data.positionNum)

    const supervisorSnapshot = hasManualSupervisorOverride
      ? data.supervisorName || data.supervisorEmail
        ? normalizePersonSnapshot(
            {
              source: "MANUAL",
              name: data.supervisorName ?? null,
              email: data.supervisorEmail ?? null,
            },
            "MANUAL"
          )
        : null
      : null

    const supervisorFields = hasManualSupervisorOverride
      ? supervisorSnapshot
        ? toSupervisorFields(supervisorSnapshot, true)
        : {
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
      : (resolvedSupervisor?.fields ?? {})

    const mentorSnapshot =
      data.mentorName || data.mentorEmail
        ? normalizePersonSnapshot(
            {
              source: "MANUAL",
              name: data.mentorName ?? null,
              email: data.mentorEmail ?? null,
            },
            "MANUAL"
          )
        : null

    const mentorFields = mentorSnapshot ? toMentorFields(mentorSnapshot) : {}

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
          mentorAssignedFrom: mentorSnapshot ? new Date() : null,

          status: "NEW",
        },
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

      if (data.personalNumber && data.personalNumber.trim() !== "") {
        await tx.personalNumberGap.updateMany({
          where: {
            number: data.personalNumber.trim(),
            status: "SKIPPED",
          },
          data: { status: "USED", usedAt: new Date() },
        })
      }

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
      data: serializeOnboardingRecord(created),
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
