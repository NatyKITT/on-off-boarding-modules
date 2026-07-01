import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { z, ZodError } from "zod"

import { prisma } from "@/lib/db"
import {
  buildLinkedEmployeeChangeInfos,
  buildLinkedOnboardingInfo,
  normalizePersonalNumber,
  pickMostRelevantOnboarding,
} from "@/lib/employment-linking"
import { canReadOffboarding, canWriteOffboarding } from "@/lib/rbac"

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

  notes: z.union([z.string(), z.null()]).optional(),
  noticeEnd: z.preprocess(emptyToUndefined, z.coerce.date()).optional(),
  noticeMonths: z.coerce.number().optional(),
  hasCustomDates: z.boolean().optional(),
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
                in: personalNumbers,
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
            },
          })
        : []

    const linkedEmployeeChanges =
      personalNumbers.length > 0
        ? await prisma.employeeChange.findMany({
            where: {
              personalNumber: {
                in: personalNumbers,
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
    const isActual =
      raw.actualEnd != null && String(raw.actualEnd).trim() !== ""

    if (isActual) {
      const data = createActualSchema.parse(raw)
      const planned = data.plannedEnd ?? data.actualEnd

      const created = await prisma.employeeOffboarding.create({
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

          userEmail: data.userEmail ?? null,
          userName: data.userName ?? null,
          personalNumber: data.personalNumber ?? null,

          notes: data.notes ?? null,
          status: "COMPLETED",
        },
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

    const created = await prisma.employeeOffboarding.create({
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

        userEmail: data.userEmail ?? null,
        userName: data.userName ?? null,
        personalNumber: data.personalNumber ?? null,

        notes: data.notes ?? null,
        status: "NEW",
      },
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
