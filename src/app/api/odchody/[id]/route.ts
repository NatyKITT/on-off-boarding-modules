import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { z, ZodError } from "zod"

import { prisma } from "@/lib/db"

type RouteParams = { params: { id: string } }

const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v

/** ---- Validace PATCH payloadu ---- */
const updateSchema = z.object({
  titleBefore: z.union([z.string(), z.null()]).optional(),
  name: z.string().min(1).optional(),
  surname: z.string().min(1).optional(),
  titleAfter: z.union([z.string(), z.null()]).optional(),
  phone: z.union([z.string(), z.null()]).optional(),
  positionNum: z.string().optional(),
  positionName: z.string().optional(),
  department: z.string().optional(),
  unitName: z.string().optional(),

  plannedEnd: z.preprocess(emptyToUndefined, z.coerce.date()).optional(),
  actualEnd: z.preprocess(emptyToUndefined, z.coerce.date()).optional(),
  noticePeriodEnd: z.preprocess(emptyToUndefined, z.coerce.date()).optional(),
  noticeEnd: z.preprocess(emptyToUndefined, z.coerce.date()).optional(),

  noticeMonths: z.number().optional(),
  hasCustomDates: z.boolean().optional(),

  userEmail: z
    .preprocess(emptyToUndefined, z.string().email())
    .optional()
    .nullable(),
  userName: z.union([z.string(), z.null()]).optional(),
  personalNumber: z.union([z.string(), z.null()]).optional(),
  notes: z.union([z.string(), z.null()]).optional(),
  status: z.enum(["NEW", "IN_PROGRESS", "COMPLETED"]).optional(),
})

/** ---- Typ pro update do Prisma (zarovnaný s DB schématem) ---- */
type UpdateData = {
  updatedAt: Date
  titleBefore?: string | null
  name?: string
  surname?: string
  titleAfter?: string | null
  phone?: string | null
  positionNum?: string
  positionName?: string
  department?: string
  unitName?: string

  plannedEnd?: Date
  actualEnd?: Date | null
  noticeEnd?: Date | null
  noticeMonths?: number | null
  hasCustomDates?: boolean

  userEmail?: string | null
  userName?: string | null
  personalNumber?: string | null
  notes?: string | null
  status?: "NEW" | "IN_PROGRESS" | "COMPLETED"
}

/** Pomocník na převod pro porovnání změn */
const toStr = (v: unknown) => {
  if (v === null || v === undefined) return ""
  if (v instanceof Date) return v.toISOString()
  if (typeof v === "boolean") return v ? "true" : "false"
  return String(v)
}

export async function GET(_: NextRequest, { params }: RouteParams) {
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
    const record = await prisma.employeeOffboarding.findUnique({
      where: { id, deletedAt: null },
    })

    if (!record) {
      return NextResponse.json(
        { status: "error", message: "Záznam nenalezen." },
        { status: 404 }
      )
    }

    return NextResponse.json({
      status: "success",
      data: {
        ...record,
        plannedEnd: record.plannedEnd?.toISOString() ?? null,
        actualEnd: record.actualEnd?.toISOString() ?? null,
        noticeEnd: record.noticeEnd?.toISOString() ?? null,
        noticeMonths: record.noticeMonths ?? 2,
        hasCustomDates: record.hasCustomDates ?? false,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      },
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

    const userKey =
      (session.user as { id?: string; email?: string }).id ??
      session.user.email ??
      "unknown"

    const before = await prisma.employeeOffboarding.findUnique({
      where: { id, deletedAt: null },
    })

    if (!before) {
      return NextResponse.json(
        { status: "error", message: "Záznam nenalezen." },
        { status: 404 }
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updateData: UpdateData = { updatedAt: new Date() }

      for (const [key, value] of Object.entries(data)) {
        if (value === undefined) continue

        switch (key) {
          case "noticePeriodEnd": {
            updateData.noticeEnd = value as Date
            break
          }
          case "noticeEnd": {
            if (!("noticePeriodEnd" in data)) {
              updateData.noticeEnd = value as Date
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
            updateData.actualEnd = value as Date
            break
          }
          case "hasCustomDates": {
            updateData.hasCustomDates = Boolean(value)
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

      const beforeRec: Record<string, unknown> = before as unknown as Record<
        string,
        unknown
      >
      const updateRec: Record<string, unknown> =
        updateData as unknown as Record<string, unknown>

      const changes: Array<{
        field: string
        oldValue: string
        newValue: string
      }> = []

      for (const [k, newVal] of Object.entries(updateRec)) {
        if (k === "updatedAt") continue
        const oldVal = beforeRec[k]
        const oldStr = toStr(oldVal)
        const newStr = toStr(newVal)
        if (oldStr !== newStr) {
          changes.push({ field: k, oldValue: oldStr, newValue: newStr })
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

      return updatedRecord
    })

    return NextResponse.json({
      status: "success",
      message: "Záznam byl úspěšně aktualizován.",
      data: {
        ...updated,
        plannedEnd: updated.plannedEnd?.toISOString() ?? null,
        actualEnd: updated.actualEnd?.toISOString() ?? null,
        noticeEnd: updated.noticeEnd?.toISOString() ?? null,
        noticeMonths: updated.noticeMonths ?? 2,
        hasCustomDates: updated.hasCustomDates ?? false,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
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
    console.error("PATCH /odchody/[id] error:", err)
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

  const id = Number(params.id)
  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { status: "error", message: "Neplatné ID." },
      { status: 400 }
    )
  }

  const before = await prisma.employeeOffboarding.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      surname: true,
      actualEnd: true,
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

    try {
      await tx.mailQueue.create({
        data: {
          type: "SYSTEM_NOTIFICATION",
          payload: {
            type: "employee_offboarding_deleted",
            employeeId: before.id,
            employeeName: `${before.name} ${before.surname}`,
            deletedBy: userKey,
            recipients: ["hr@company.com"],
            subject: `Smazán záznam odchodu - ${before.name} ${before.surname}`,
          },
          priority: 5,
          createdBy: userKey,
        },
      })
    } catch (mailErr) {
      console.warn("Warning: Could not create mail queue entry:", mailErr)
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
