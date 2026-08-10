import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { Prisma } from "@prisma/client"
import { z, ZodError } from "zod"

import { prisma } from "@/lib/db"
import {
  buildLinkedEmployeeChangeInfos,
  buildLinkedOnboardingInfo,
  normalizePersonalNumber,
  pickMostRelevantOnboarding,
} from "@/lib/employment-linking"
import {
  normalizePersonSnapshot,
  toSupervisorFields,
} from "@/lib/person-snapshot"
import {
  getUserKey,
  getUserLabel,
  syncLinkedProbationAfterOffboardingDecision,
} from "@/lib/probation-evaluation-request"
import { canReadOffboarding, canWriteOffboarding } from "@/lib/rbac"
import { resolveSupervisorFromPositionNum } from "@/lib/systemizace-superior"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const emptyToUndefined = (v: unknown) =>
  v === null
    ? undefined
    : typeof v === "string" && v.trim() === ""
      ? undefined
      : v

const base = z.object({
  titleBefore: z.union([z.string(), z.null()]).optional(),
  name: z.string(),
  surname: z.string(),
  titleAfter: z.union([z.string(), z.null()]).optional(),

  userEmail: z
    .preprocess(emptyToUndefined, z.string().email())
    .optional()
    .nullable(),
  userName: z.union([z.string(), z.null()]).optional(),
  personalNumber: z.union([z.string(), z.null()]).optional(),

  positionNum: z.string(),
  positionName: z.string().optional(),
  department: z.string().optional(),
  unitName: z.string().optional(),

  supervisorName: z.union([z.string(), z.null()]).optional(),
  supervisorEmail: z
    .preprocess(emptyToUndefined, z.string().email())
    .optional()
    .nullable(),
  supervisorPosition: z.union([z.string(), z.null()]).optional(),
  supervisorDepartment: z.union([z.string(), z.null()]).optional(),
  supervisorUnitName: z.union([z.string(), z.null()]).optional(),

  notes: z.union([z.string(), z.null()]).optional(),
  noticeEnd: z.preprocess(emptyToUndefined, z.coerce.date()).optional(),
  noticeMonths: z.coerce.number().optional(),
  hasCustomDates: z.boolean().optional(),

  probationStopDecision: z.enum(["STOP", "KEEP"]).optional(),
  probationStopNote: z.union([z.string(), z.null()]).optional(),
})

const createPlannedSchema = base.extend({
  plannedEnd: z.preprocess(
    emptyToUndefined,
    z.coerce.date({
      required_error: "Datum plánovaného odchodu je povinné.",
      invalid_type_error: "Neplatné datum plánovaného odchodu.",
    })
  ),
  actualEnd: z.preprocess(emptyToUndefined, z.coerce.date()).optional(),
})

const createActualSchema = base.extend({
  plannedEnd: z.preprocess(emptyToUndefined, z.coerce.date()).optional(),
  actualEnd: z.preprocess(
    emptyToUndefined,
    z.coerce.date({
      required_error: "Datum skutečného odchodu je povinné.",
      invalid_type_error: "Neplatné datum skutečného odchodu.",
    })
  ),
})

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

async function buildOffboardingSupervisorFields(
  data: z.infer<typeof base>,
  manualOverride: boolean
) {
  if (manualOverride) {
    const hasSnapshot =
      data.supervisorName ||
      data.supervisorEmail ||
      data.supervisorPosition ||
      data.supervisorDepartment ||
      data.supervisorUnitName

    if (!hasSnapshot) return createEmptySupervisorOverrideFields()

    const snapshot = normalizePersonSnapshot(
      {
        source: "MANUAL" as const,
        name: data.supervisorName ?? null,
        email: data.supervisorEmail ?? null,
        position: data.supervisorPosition ?? null,
        department: data.supervisorDepartment ?? null,
        unitName: data.supervisorUnitName ?? null,
      },
      "MANUAL"
    )

    return toSupervisorFields(snapshot, true)
  }

  const resolved = await resolveSupervisorFromPositionNum(data.positionNum)
  return resolved?.fields ?? {}
}

type OffboardingRecord = Awaited<
  ReturnType<typeof prisma.employeeOffboarding.findMany>
>[number]

type LinkablePersonalNumber = {
  personalNumber: string | null
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

function serializeOffboardingRecord(
  offboarding: OffboardingRecord,
  linkedOnboarding: ReturnType<typeof buildLinkedOnboardingInfo>,
  linkedChanges: ReturnType<typeof buildLinkedEmployeeChangeInfos> = []
) {
  return {
    ...offboarding,
    plannedEnd: offboarding.plannedEnd?.toISOString() ?? null,
    actualEnd: offboarding.actualEnd?.toISOString() ?? null,
    noticeEnd: offboarding.noticeEnd?.toISOString() ?? null,
    noticeMonths: offboarding.noticeMonths ?? 2,
    hasCustomDates: offboarding.hasCustomDates ?? false,
    createdAt: offboarding.createdAt.toISOString(),
    updatedAt: offboarding.updatedAt.toISOString(),
    linkedOnboarding,
    linkedChanges,
  }
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

  const matchingOnboardings = linkedOnboardings.filter(
    (onboarding) =>
      normalizePersonalNumber(onboarding.personalNumber) ===
      normalizedPersonalNumber
  )

  return buildLinkedOnboardingInfo({
    onboarding: pickMostRelevantOnboarding(matchingOnboardings),
    exitDate,
  })
}

async function findActiveProbationOnboarding(
  personalNumber: string | null | undefined,
  exitDate: Date | null | undefined
) {
  const normalizedPersonalNumber = normalizePersonalNumber(personalNumber)

  if (!normalizedPersonalNumber || !exitDate) return null

  const candidates = await prisma.employeeOnboarding.findMany({
    where: {
      personalNumber: {
        not: null,
      },
      deletedAt: null,
      status: {
        not: "CANCELLED",
      },
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

  const matching = candidates.filter(
    (onboarding) =>
      normalizePersonalNumber(onboarding.personalNumber) ===
      normalizedPersonalNumber
  )

  const info = buildLinkedOnboardingInfo({
    onboarding: pickMostRelevantOnboarding(matching),
    exitDate,
  })

  return info?.exitDuringProbation ? info : null
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

export async function GET() {
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
      { status: "error", message: "Nemáte oprávnění číst seznam odchodů." },
      { status: 403 }
    )
  }

  try {
    const offboardings = await prisma.employeeOffboarding.findMany({
      where: { deletedAt: null },
      orderBy: [{ plannedEnd: "desc" }, { id: "desc" }],
    })

    const personalNumbers = collectPersonalNumbers(offboardings)

    const linkedOnboardings =
      personalNumbers.length > 0
        ? await prisma.employeeOnboarding.findMany({
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

    const onboardingsByPersonalNumber = groupByPersonalNumber(linkedOnboardings)

    const changesByPersonalNumber = groupByPersonalNumber(linkedEmployeeChanges)

    const data = offboardings.map((offboarding) => {
      const personalNumber = normalizePersonalNumber(offboarding.personalNumber)

      const linkedOnboarding = pickMostRelevantOnboarding(
        personalNumber
          ? (onboardingsByPersonalNumber.get(personalNumber) ?? [])
          : []
      )

      const linkedChanges = buildLinkedEmployeeChangeInfos(
        personalNumber
          ? (changesByPersonalNumber.get(personalNumber) ?? [])
          : []
      )

      const exitDate = offboarding.actualEnd ?? offboarding.plannedEnd

      return serializeOffboardingRecord(
        offboarding,
        buildLinkedOnboardingInfo({
          onboarding: linkedOnboarding,
          exitDate,
        }),
        linkedChanges
      )
    })

    return NextResponse.json({ status: "success", data })
  } catch (err) {
    console.error("Chyba při načítání odchodů:", err)

    return NextResponse.json(
      { status: "error", message: "Nepodařilo se načíst seznam odchodů." },
      { status: 500 }
    )
  }
}

async function recordProbationDecisionSideEffects(
  tx: Prisma.TransactionClient,
  args: {
    offboardingId: number
    onboardingId: number
    decision: "STOP" | "KEEP"
    actorId: string
    actorName: string
  }
) {
  await tx.offboardingChangeLog.create({
    data: {
      employeeId: args.offboardingId,
      userId: args.actorId,
      action: "STATUS_CHANGED",
      field: "probationStopDecision",
      oldValue: null,
      newValue: args.decision,
    },
  })

  await syncLinkedProbationAfterOffboardingDecision(tx, {
    onboardingId: args.onboardingId,
    actorId: args.actorId,
    actorName: args.actorName,
  })
}

export async function POST(request: NextRequest) {
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
      { status: "error", message: "Nemáte oprávnění vytvářet záznam odchodu." },
      { status: 403 }
    )
  }

  try {
    const raw = await request.json()
    const hasManualSupervisorOverride = raw.supervisorManualOverride === true
    const isActual =
      raw.actualEnd != null && String(raw.actualEnd).trim() !== ""

    if (isActual) {
      const data = createActualSchema.parse(raw)
      const planned = data.plannedEnd ?? data.actualEnd
      const supervisorFields = await buildOffboardingSupervisorFields(
        data,
        hasManualSupervisorOverride
      )

      const pendingProbation = await findActiveProbationOnboarding(
        data.personalNumber,
        data.actualEnd
      )

      if (pendingProbation && data.probationStopDecision === undefined) {
        return NextResponse.json({
          status: "confirm_required",
          confirmKind: "probation_stop",
          linkedOnboarding: pendingProbation,
        })
      }

      const actorId = getUserKey({
        id: (session.user as { id?: string }).id,
        email: session.user.email,
      })
      const actorName = getUserLabel({
        name: session.user.name,
        email: session.user.email,
      })

      const created = await prisma.$transaction(async (tx) => {
        const record = await tx.employeeOffboarding.create({
          data: {
            name: data.name,
            surname: data.surname,
            titleBefore: data.titleBefore ?? null,
            titleAfter: data.titleAfter ?? null,

            plannedEnd: planned,
            actualEnd: data.actualEnd,
            noticeEnd: data.noticeEnd ?? null,
            noticeMonths: data.noticeMonths ?? 2,
            hasCustomDates: data.hasCustomDates ?? false,

            positionNum: data.positionNum,
            positionName: data.positionName ?? "",
            department: data.department ?? "",
            unitName: data.unitName ?? "",
            ...supervisorFields,

            userEmail: data.userEmail ?? null,
            userName: data.userName ?? null,
            personalNumber:
              normalizePersonalNumber(data.personalNumber) || null,

            notes: data.notes ?? null,
            status: "COMPLETED",

            probationStopDecision: pendingProbation
              ? (data.probationStopDecision ?? null)
              : null,
            probationStopDecisionAt:
              pendingProbation && data.probationStopDecision
                ? new Date()
                : null,
            probationStopDecisionBy:
              pendingProbation && data.probationStopDecision ? actorId : null,
            probationStopNote: pendingProbation
              ? (data.probationStopNote ?? null)
              : null,
          },
        })

        if (pendingProbation && data.probationStopDecision) {
          await recordProbationDecisionSideEffects(tx, {
            offboardingId: record.id,
            onboardingId: pendingProbation.id,
            decision: data.probationStopDecision,
            actorId,
            actorName,
          })
        }

        await tx.offboardingChangeLog.create({
          data: {
            employeeId: record.id,
            userId: actorId,
            action: "CREATED",
            field: "initial_creation",
            oldValue: null,
            newValue: JSON.stringify({
              type: "actual_offboarding",
              name: `${data.name} ${data.surname}`,
              position: data.positionName,
              actualEnd: data.actualEnd.toISOString(),
            }),
          },
        })

        return record
      })

      const linkedOnboarding = await getLinkedOnboardingForOffboarding(
        created.personalNumber,
        created.actualEnd ?? created.plannedEnd
      )

      const linkedChanges = await getLinkedChangesForPersonalNumber(
        created.personalNumber
      )

      return NextResponse.json({
        status: "success",
        data: serializeOffboardingRecord(
          created,
          linkedOnboarding,
          linkedChanges
        ),
      })
    }

    const data = createPlannedSchema.parse(raw)
    const supervisorFields = await buildOffboardingSupervisorFields(
      data,
      hasManualSupervisorOverride
    )

    const pendingProbation = await findActiveProbationOnboarding(
      data.personalNumber,
      data.plannedEnd
    )

    if (pendingProbation && data.probationStopDecision === undefined) {
      return NextResponse.json({
        status: "confirm_required",
        confirmKind: "probation_stop",
        linkedOnboarding: pendingProbation,
      })
    }

    const actorId = getUserKey({
      id: (session.user as { id?: string }).id,
      email: session.user.email,
    })
    const actorName = getUserLabel({
      name: session.user.name,
      email: session.user.email,
    })

    const created = await prisma.$transaction(async (tx) => {
      const record = await tx.employeeOffboarding.create({
        data: {
          name: data.name,
          surname: data.surname,
          titleBefore: data.titleBefore ?? null,
          titleAfter: data.titleAfter ?? null,

          plannedEnd: data.plannedEnd,
          actualEnd: data.actualEnd ?? null,
          noticeEnd: data.noticeEnd ?? null,
          noticeMonths: data.noticeMonths ?? 2,
          hasCustomDates: data.hasCustomDates ?? false,

          positionNum: data.positionNum,
          positionName: data.positionName ?? "",
          department: data.department ?? "",
          unitName: data.unitName ?? "",
          ...supervisorFields,

          userEmail: data.userEmail ?? null,
          userName: data.userName ?? null,
          personalNumber: data.personalNumber ?? null,

          notes: data.notes ?? null,
          status: "NEW",

          probationStopDecision: pendingProbation
            ? (data.probationStopDecision ?? null)
            : null,
          probationStopDecisionAt:
            pendingProbation && data.probationStopDecision ? new Date() : null,
          probationStopDecisionBy:
            pendingProbation && data.probationStopDecision ? actorId : null,
          probationStopNote: pendingProbation
            ? (data.probationStopNote ?? null)
            : null,
        },
      })

      if (pendingProbation && data.probationStopDecision) {
        await recordProbationDecisionSideEffects(tx, {
          offboardingId: record.id,
          onboardingId: pendingProbation.id,
          decision: data.probationStopDecision,
          actorId,
          actorName,
        })
      }

      await tx.offboardingChangeLog.create({
        data: {
          employeeId: record.id,
          userId: actorId,
          action: "CREATED",
          field: "initial_creation",
          oldValue: null,
          newValue: JSON.stringify({
            type: "planned_offboarding",
            name: `${data.name} ${data.surname}`,
            position: data.positionName,
            plannedEnd: data.plannedEnd.toISOString(),
          }),
        },
      })

      return record
    })

    const linkedOnboarding = await getLinkedOnboardingForOffboarding(
      created.personalNumber,
      created.actualEnd ?? created.plannedEnd
    )

    const linkedChanges = await getLinkedChangesForPersonalNumber(
      created.personalNumber
    )

    return NextResponse.json({
      status: "success",
      data: serializeOffboardingRecord(
        created,
        linkedOnboarding,
        linkedChanges
      ),
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

    console.error("Chyba při vytváření odchodu:", err)

    return NextResponse.json(
      { status: "error", message: "Chyba při vytváření odchodu." },
      { status: 500 }
    )
  }
}
