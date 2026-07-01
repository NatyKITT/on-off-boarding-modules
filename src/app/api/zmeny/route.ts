import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import {
  EmployeeChangeAudience,
  EmployeeChangeStatus,
  EmployeeChangeType,
} from "@prisma/client"
import { z, ZodError } from "zod"

import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value

const createSchema = z.object({
  type: z.nativeEnum(EmployeeChangeType),
  audience: z.nativeEnum(EmployeeChangeAudience).optional().nullable(),
  effectiveDate: z.coerce.date(),

  titleBefore: z.preprocess(emptyToNull, z.string().nullable().optional()),
  name: z.string().trim().min(1, "Jméno je povinné."),
  surname: z.string().trim().min(1, "Příjmení je povinné."),
  titleAfter: z.preprocess(emptyToNull, z.string().nullable().optional()),
  personalNumber: z.preprocess(emptyToNull, z.string().nullable().optional()),

  oldTitleBefore: z.preprocess(emptyToNull, z.string().nullable().optional()),
  newTitleBefore: z.preprocess(emptyToNull, z.string().nullable().optional()),
  oldName: z.preprocess(emptyToNull, z.string().nullable().optional()),
  newName: z.preprocess(emptyToNull, z.string().nullable().optional()),
  oldSurname: z.preprocess(emptyToNull, z.string().nullable().optional()),
  newSurname: z.preprocess(emptyToNull, z.string().nullable().optional()),
  oldTitleAfter: z.preprocess(emptyToNull, z.string().nullable().optional()),
  newTitleAfter: z.preprocess(emptyToNull, z.string().nullable().optional()),

  oldDepartment: z.preprocess(emptyToNull, z.string().nullable().optional()),
  newDepartment: z.preprocess(emptyToNull, z.string().nullable().optional()),
  oldUnitName: z.preprocess(emptyToNull, z.string().nullable().optional()),
  newUnitName: z.preprocess(emptyToNull, z.string().nullable().optional()),
  oldPositionName: z.preprocess(emptyToNull, z.string().nullable().optional()),
  newPositionName: z.preprocess(emptyToNull, z.string().nullable().optional()),
  oldPositionNum: z.preprocess(emptyToNull, z.string().nullable().optional()),
  newPositionNum: z.preprocess(emptyToNull, z.string().nullable().optional()),

  notes: z.preprocess(emptyToNull, z.string().nullable().optional()),
})

type EmployeeChangeWithTargets = {
  id: number
  type: EmployeeChangeType
  status: EmployeeChangeStatus
  audience: EmployeeChangeAudience | null
  effectiveDate: Date

  titleBefore: string | null
  name: string
  surname: string
  titleAfter: string | null
  personalNumber: string | null

  oldTitleBefore: string | null
  newTitleBefore: string | null
  oldName: string | null
  newName: string | null
  oldSurname: string | null
  newSurname: string | null
  oldTitleAfter: string | null
  newTitleAfter: string | null

  oldDepartment: string | null
  newDepartment: string | null
  oldUnitName: string | null
  newUnitName: string | null
  oldPositionName: string | null
  newPositionName: string | null
  oldPositionNum: string | null
  newPositionNum: string | null

  notes: string | null

  appliedAt: Date | null
  appliedBy: string | null
  emailSentAt: Date | null
  emailSentBy: string | null

  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  deletedBy: string | null
  deleteReason: string | null

  targets?: Array<{
    id: number
    targetType: string
    targetId: number
    appliedAt: Date
  }>
}

function normalizePersonalNumber(value: string | null | undefined) {
  return value?.trim() ?? ""
}

function addCount(map: Map<string, number>, personalNumber: string | null) {
  const normalized = normalizePersonalNumber(personalNumber)
  if (!normalized) return

  map.set(normalized, (map.get(normalized) ?? 0) + 1)
}

function uniquePersonalNumbers(rows: Array<{ personalNumber: string | null }>) {
  return Array.from(
    new Set(
      rows
        .map((row) => normalizePersonalNumber(row.personalNumber))
        .filter(Boolean)
    )
  )
}

function serializeChange(
  record: EmployeeChangeWithTargets,
  counts?: {
    onboardingMatchesCount: number
    offboardingMatchesCount: number
  }
) {
  const onboardingMatchesCount = counts?.onboardingMatchesCount ?? 0
  const offboardingMatchesCount = counts?.offboardingMatchesCount ?? 0

  return {
    ...record,
    effectiveDate: record.effectiveDate.toISOString(),
    appliedAt: record.appliedAt?.toISOString() ?? null,
    emailSentAt: record.emailSentAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    deletedAt: record.deletedAt?.toISOString() ?? null,
    targets:
      record.targets?.map((target) => ({
        ...target,
        appliedAt: target.appliedAt.toISOString(),
      })) ?? [],
    onboardingMatchesCount,
    offboardingMatchesCount,
    linkCandidateCount: onboardingMatchesCount + offboardingMatchesCount,
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

  try {
    const records = await prisma.employeeChange.findMany({
      where: {
        deletedAt: null,
      },
      orderBy: [{ effectiveDate: "desc" }, { id: "desc" }],
      include: {
        targets: {
          select: {
            id: true,
            targetType: true,
            targetId: true,
            appliedAt: true,
          },
        },
      },
    })

    const personalNumbers = uniquePersonalNumbers(records)
    const onboardingCountByPersonalNumber = new Map<string, number>()
    const offboardingCountByPersonalNumber = new Map<string, number>()

    if (personalNumbers.length > 0) {
      const [onboardings, offboardings] = await Promise.all([
        prisma.employeeOnboarding.findMany({
          where: {
            deletedAt: null,
            personalNumber: {
              in: personalNumbers,
            },
          },
          select: {
            personalNumber: true,
          },
        }),
        prisma.employeeOffboarding.findMany({
          where: {
            deletedAt: null,
            personalNumber: {
              in: personalNumbers,
            },
          },
          select: {
            personalNumber: true,
          },
        }),
      ])

      for (const onboarding of onboardings) {
        addCount(onboardingCountByPersonalNumber, onboarding.personalNumber)
      }

      for (const offboarding of offboardings) {
        addCount(offboardingCountByPersonalNumber, offboarding.personalNumber)
      }
    }

    const data = records.map((record) => {
      const personalNumber = normalizePersonalNumber(record.personalNumber)

      return serializeChange(record, {
        onboardingMatchesCount:
          onboardingCountByPersonalNumber.get(personalNumber) ?? 0,
        offboardingMatchesCount:
          offboardingCountByPersonalNumber.get(personalNumber) ?? 0,
      })
    })

    return NextResponse.json({
      status: "success",
      data,
    })
  } catch (error) {
    console.error("GET /api/zmeny error:", error)

    return NextResponse.json(
      { status: "error", message: "Nepodařilo se načíst změny." },
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
    const raw = await request.json()
    const data = createSchema.parse(raw)

    const created = await prisma.employeeChange.create({
      data: {
        type: data.type,
        status: EmployeeChangeStatus.DRAFT,
        audience: data.audience ?? null,

        effectiveDate: data.effectiveDate,

        titleBefore: data.titleBefore ?? null,
        name: data.name,
        surname: data.surname,
        titleAfter: data.titleAfter ?? null,
        personalNumber: data.personalNumber ?? null,

        oldTitleBefore: data.oldTitleBefore ?? null,
        newTitleBefore: data.newTitleBefore ?? null,
        oldName: data.oldName ?? null,
        newName: data.newName ?? null,
        oldSurname: data.oldSurname ?? null,
        newSurname: data.newSurname ?? null,
        oldTitleAfter: data.oldTitleAfter ?? null,
        newTitleAfter: data.newTitleAfter ?? null,

        oldDepartment: data.oldDepartment ?? null,
        newDepartment: data.newDepartment ?? null,
        oldUnitName: data.oldUnitName ?? null,
        newUnitName: data.newUnitName ?? null,
        oldPositionName: data.oldPositionName ?? null,
        newPositionName: data.newPositionName ?? null,
        oldPositionNum: data.oldPositionNum ?? null,
        newPositionNum: data.newPositionNum ?? null,

        notes: data.notes ?? null,
      },
      include: {
        targets: {
          select: {
            id: true,
            targetType: true,
            targetId: true,
            appliedAt: true,
          },
        },
      },
    })

    return NextResponse.json({
      status: "success",
      data: serializeChange(created),
    })
  } catch (error) {
    if (error instanceof ZodError) {
      const message = error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")

      return NextResponse.json(
        { status: "error", message: `Formulář obsahuje chyby: ${message}` },
        { status: 400 }
      )
    }

    console.error("POST /api/zmeny error:", error)

    return NextResponse.json(
      { status: "error", message: "Chyba při vytváření změny." },
      { status: 500 }
    )
  }
}
