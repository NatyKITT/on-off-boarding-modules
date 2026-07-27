import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import {
  EmployeeChangeAudience,
  EmployeeChangeStatus,
  EmployeeChangeType,
} from "@prisma/client"
import { z, ZodError } from "zod"

import { prisma } from "@/lib/db"
import { canReadEmployeeChanges, canWriteEmployeeChanges } from "@/lib/rbac"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

type RouteParams = { params: { id: string } }

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value

const updateSchema = z.object({
  type: z.nativeEnum(EmployeeChangeType).optional(),
  audience: z.nativeEnum(EmployeeChangeAudience).optional().nullable(),
  effectiveDate: z.coerce.date().optional(),

  titleBefore: z.preprocess(emptyToNull, z.string().nullable().optional()),
  name: z.string().trim().min(1, "Jméno je povinné.").optional(),
  surname: z.string().trim().min(1, "Příjmení je povinné.").optional(),
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

function normalizePersonalNumber(value: string | null | undefined) {
  return value?.trim() ?? ""
}

function toStr(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (value === null || value === undefined) return ""
  return String(value)
}

function serializeChange(
  record: {
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
      appliedBy?: string | null
    }>
  },
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

async function getLinkCounts(personalNumber: string | null) {
  const pn = normalizePersonalNumber(personalNumber)

  if (!pn) {
    return {
      onboardingMatchesCount: 0,
      offboardingMatchesCount: 0,
    }
  }

  const [onboardingMatchesCount, offboardingMatchesCount] = await Promise.all([
    prisma.employeeOnboarding.count({
      where: {
        deletedAt: null,
        personalNumber: pn,
      },
    }),
    prisma.employeeOffboarding.count({
      where: {
        deletedAt: null,
        personalNumber: pn,
      },
    }),
  ])

  return {
    onboardingMatchesCount,
    offboardingMatchesCount,
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

  if (!canReadEmployeeChanges(session.user.role)) {
    return NextResponse.json(
      { status: "error", message: "Nemáte oprávnění číst záznam změny." },
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
    const record = await prisma.employeeChange.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        targets: {
          select: {
            id: true,
            targetType: true,
            targetId: true,
            appliedAt: true,
            appliedBy: true,
          },
        },
      },
    })

    if (!record) {
      return NextResponse.json(
        { status: "error", message: "Záznam nenalezen." },
        { status: 404 }
      )
    }

    const counts = await getLinkCounts(record.personalNumber)

    return NextResponse.json({
      status: "success",
      data: serializeChange(record, counts),
    })
  } catch (error) {
    console.error("GET /api/zmeny/[id] error:", error)

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

  if (!canWriteEmployeeChanges(session.user.role)) {
    return NextResponse.json(
      { status: "error", message: "Nemáte oprávnění upravovat záznam změny." },
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

    const existing = await prisma.employeeChange.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    })

    if (!existing) {
      return NextResponse.json(
        { status: "error", message: "Záznam nenalezen." },
        { status: 404 }
      )
    }

    const userKey =
      (session.user as { id?: string; email?: string }).id ??
      session.user.email ??
      "unknown"

    const updated = await prisma.employeeChange.update({
      where: {
        id,
      },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: {
        targets: {
          select: {
            id: true,
            targetType: true,
            targetId: true,
            appliedAt: true,
            appliedBy: true,
          },
        },
      },
    })

    const existingRec = existing as unknown as Record<string, unknown>
    const dataRec = data as unknown as Record<string, unknown>

    for (const [key, newValue] of Object.entries(dataRec)) {
      if (newValue === undefined) continue

      const oldStr = toStr(existingRec[key])
      const newStr = toStr(newValue)

      if (oldStr === newStr) continue

      await prisma.employeeChangeLog.create({
        data: {
          employeeId: id,
          userId: userKey,
          action: "UPDATED",
          field: key,
          oldValue: oldStr || null,
          newValue: newStr || null,
        },
      })
    }

    const counts = await getLinkCounts(updated.personalNumber)

    return NextResponse.json({
      status: "success",
      message: "Záznam byl úspěšně aktualizován.",
      data: serializeChange(updated, counts),
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

    console.error("PATCH /api/zmeny/[id] error:", error)

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

  if (!canWriteEmployeeChanges(session.user.role)) {
    return NextResponse.json(
      { status: "error", message: "Nemáte oprávnění mazat záznam změny." },
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

  const before = await prisma.employeeChange.findUnique({
    where: {
      id,
    },
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

  const deletedAt = new Date()

  await prisma.$transaction(async (tx) => {
    await tx.employeeChange.update({
      where: {
        id,
      },
      data: {
        deletedAt,
        deletedBy: userKey,
        deleteReason: "Smazáno uživatelem",
        updatedAt: deletedAt,
      },
    })

    await tx.employeeChangeLog.create({
      data: {
        employeeId: before.id,
        userId: userKey,
        action: "DELETED",
        field: "deleted_at",
        oldValue: null,
        newValue: deletedAt.toISOString(),
      },
    })
  })

  return NextResponse.json({
    status: "success",
    message: "Záznam byl úspěšně smazán.",
    data: {
      id: before.id,
      name: `${before.name} ${before.surname}`,
    },
  })
}
