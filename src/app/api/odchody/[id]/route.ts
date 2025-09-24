import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { z, ZodError, ZodIssue } from "zod"

import { makeDiff } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { snapshotOffboarding } from "@/lib/snapshot"

const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v

const optStr = z.union([z.string(), z.null()]).optional()
const optionalDate = z
  .preprocess(emptyToUndefined, z.coerce.date())
  .refine((d) => !isNaN(d.getTime()), { message: "Neplatné datum." })
  .optional()

const updateSchema = z.object({
  titleBefore: optStr,
  name: z.string().optional(),
  surname: z.string().optional(),
  titleAfter: optStr,
  positionNum: z.string().optional(),
  positionName: optStr,
  department: optStr,
  unitName: optStr,
  plannedEnd: optionalDate,
  actualEnd: optionalDate,
  userEmail: z
    .preprocess(emptyToUndefined, z.string().email())
    .nullable()
    .optional(),
  userName: optStr,
  personalNumber: optStr,
  notes: optStr,
  status: z.enum(["NEW", "IN_PROGRESS", "COMPLETED"]).optional(),
})

interface Params {
  params: { id: string }
}

export async function GET(_: NextRequest, { params }: Params) {
  const id = Number(params.id)
  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { status: "error", message: "Neplatné ID." },
      { status: 400 }
    )
  }
  const record = await prisma.employeeOffboarding.findUnique({ where: { id } })
  if (!record) {
    return NextResponse.json(
      { status: "error", message: "Nenalezeno." },
      { status: 404 }
    )
  }
  return NextResponse.json({ status: "success", data: record })
}

export async function PATCH(request: NextRequest, { params }: Params) {
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

  try {
    const raw = await request.json()
    const data = updateSchema.parse(raw)

    const before = await prisma.employeeOffboarding.findUnique({
      where: { id },
    })
    if (!before) {
      return NextResponse.json(
        { status: "error", message: "Záznam nenalezen." },
        { status: 404 }
      )
    }

    const updateData: Record<string, unknown> = {}

    // mapping do updateData: jen co přijde, bez default "" !
    if (data.titleBefore !== undefined)
      updateData.titleBefore = data.titleBefore
    if (data.name !== undefined) updateData.name = data.name
    if (data.surname !== undefined) updateData.surname = data.surname
    if (data.titleAfter !== undefined) updateData.titleAfter = data.titleAfter
    if (data.positionNum !== undefined)
      updateData.positionNum = data.positionNum
    if (data.positionName !== undefined)
      updateData.positionName = data.positionName ?? ""
    if (data.department !== undefined)
      updateData.department = data.department ?? ""
    if (data.unitName !== undefined) updateData.unitName = data.unitName ?? ""
    if (data.plannedEnd !== undefined) updateData.plannedEnd = data.plannedEnd

    if (data.actualEnd !== undefined) updateData.actualEnd = data.actualEnd
    if (data.userEmail !== undefined) updateData.userEmail = data.userEmail
    if (data.userName !== undefined) updateData.userName = data.userName
    if (data.personalNumber !== undefined)
      updateData.personalNumber = data.personalNumber

    if (data.notes !== undefined) updateData.notes = data.notes ?? null
    if (data.status !== undefined) updateData.status = data.status

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.employeeOffboarding.update({
        where: { id },
        data: updateData,
      })

      const fieldsToLog = [
        "titleBefore",
        "name",
        "surname",
        "titleAfter",
        "positionNum",
        "positionName",
        "department",
        "unitName",
        "plannedEnd",
        "actualEnd",
        "userEmail",
        "userName",
        "personalNumber",
        "notes",
        "status",
      ] as const

      const diffs = makeDiff(before, u, fieldsToLog)
      if (diffs.length) {
        await tx.offboardingChangeLog.createMany({
          data: diffs.map((d) => ({
            employeeId: u.id,
            userId:
              (session.user as { id?: string; email?: string }).id ??
              session.user.email ??
              "unknown",
            action: "UPDATE",
            field: d.field,
            oldValue: d.oldValue ?? undefined,
            newValue: d.newValue ?? undefined,
          })),
        })
      }

      return u
    })

    return NextResponse.json({ status: "success", data: updated })
  } catch (err) {
    if (err instanceof ZodError) {
      const msg = err.issues
        .map((i: ZodIssue) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")
      return NextResponse.json(
        { status: "error", message: `Formulář obsahuje chyby: ${msg}` },
        { status: 400 }
      )
    }
    console.error("PATCH chyba:", err)
    return NextResponse.json(
      { status: "error", message: "Nelze aktualizovat." },
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

  const before = await prisma.employeeOffboarding.findUnique({ where: { id } })
  if (!before) {
    return NextResponse.json(
      { status: "error", message: "Záznam nenalezen." },
      { status: 404 }
    )
  }
  if (before.actualEnd) {
    return NextResponse.json(
      { status: "error", message: "Skutečné odchody nelze mazat." },
      { status: 409 }
    )
  }

  const userKey =
    (session.user as { id?: string; email?: string }).id ??
    session.user.email ??
    "unknown"

  const oldValue = JSON.stringify({ data: snapshotOffboarding(before) })

  await prisma.$transaction(async (tx) => {
    await tx.offboardingChangeLog.create({
      data: {
        employeeId: before.id,
        userId: userKey,
        action: "DELETE",
        field: "*",
        oldValue, // <<< normalizovaný snapshot
        newValue: null,
      },
    })
    await tx.employeeOffboarding.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  })

  return new NextResponse(null, { status: 204 })
}
