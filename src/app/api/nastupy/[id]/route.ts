import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { z, ZodError } from "zod"

import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

interface Params {
  params: { id: string }
}

const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v

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
  userEmail: z
    .preprocess(emptyToUndefined, z.string().email())
    .optional()
    .nullable(),
  userName: z.union([z.string(), z.null()]).optional(),
  personalNumber: z.union([z.string(), z.null()]).optional(),
  notes: z.union([z.string(), z.null()]).optional(),
  status: z.enum(["NEW", "IN_PROGRESS", "COMPLETED"]).optional(),
})

type UpdateData = {
  updatedAt: Date
  titleBefore?: string | null
  name?: string
  surname?: string
  titleAfter?: string | null
  email?: string | null
  phone?: string | null
  positionNum?: string
  positionName?: string
  department?: string
  unitName?: string
  plannedStart?: Date
  actualStart?: Date
  startTime?: string | null
  probationEnd?: Date
  userEmail?: string | null
  userName?: string | null
  personalNumber?: string | null
  notes?: string | null
  status?: "NEW" | "IN_PROGRESS" | "COMPLETED"
}

type RawOnboardingBody = {
  generatedSkippedPersonalNumbers?: unknown
  [key: string]: unknown
}

export async function GET(_: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
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

    const responseData = {
      ...record,
      plannedStart: record.plannedStart?.toISOString() || null,
      actualStart: record.actualStart?.toISOString() || null,
      probationEnd: record.probationEnd?.toISOString() || null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    }

    return NextResponse.json({
      status: "success",
      data: responseData,
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

    const updated = await prisma.$transaction(async (tx) => {
      const updateData: UpdateData = {
        updatedAt: new Date(),
      }

      const oldPersonalNumber = (before.personalNumber ?? "").trim() || null
      let newPersonalNumber: string | null = oldPersonalNumber

      Object.keys(data).forEach((key) => {
        const value = data[key as keyof typeof data]
        if (value !== undefined) {
          ;(updateData as Record<string, unknown>)[key] = value
        }
      })

      if (data.personalNumber !== undefined) {
        const trimmed =
          data.personalNumber == null
            ? null
            : String(data.personalNumber).trim() || null
        newPersonalNumber = trimmed
        updateData.personalNumber = trimmed
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
        if (newValueRaw !== undefined) {
          const oldValue = before[key as keyof typeof before]

          let oldStr: unknown = oldValue
          let newVal: unknown = newValueRaw

          if (key === "personalNumber") {
            newVal = newPersonalNumber
          }

          if (oldStr instanceof Date) {
            oldStr = oldStr.toISOString()
          }
          if (newVal instanceof Date) {
            newVal = newVal.toISOString()
          }

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

      return updatedRecord
    })

    const responseData = {
      ...updated,
      plannedStart: updated.plannedStart?.toISOString() || null,
      actualStart: updated.actualStart?.toISOString() || null,
      probationEnd: updated.probationEnd?.toISOString() || null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    }

    return NextResponse.json({
      status: "success",
      data: responseData,
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

  await prisma.$transaction(async (tx) => {
    await tx.employeeOnboarding.update({
      where: { id },
      data: {
        deletedAt: new Date(),
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
        newValue: new Date().toISOString(),
      },
    })

    try {
      await tx.mailQueue.create({
        data: {
          type: "SYSTEM_NOTIFICATION",
          payload: {
            type: "employee_deleted",
            employeeId: before.id,
            employeeName: `${before.name} ${before.surname}`,
            deletedBy: userKey,
            recipients: ["hr@praha6.cz"],
            subject: `Smazán záznam zaměstnance - ${before.name} ${before.surname}`,
          },
          priority: 5,
          createdBy: userKey,
        },
      })
    } catch (mailError) {
      console.warn("Warning: Could not create mail queue entry:", mailError)
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
