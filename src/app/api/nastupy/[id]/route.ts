import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { z, ZodError, ZodIssue } from "zod"

import { makeDiff } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { snapshotOnboarding } from "@/lib/snapshot"

const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v

const optionalDate = z
  .preprocess(emptyToUndefined, z.coerce.date())
  .refine((d) => !isNaN(d.getTime()), { message: "Neplatné datum." })
  .optional()

const optStr = z.union([z.string(), z.null()]).optional()

const updateSchema = z.object({
  titleBefore: optStr,
  name: z.string().optional(),
  surname: z.string().optional(),
  titleAfter: optStr,
  email: z
    .preprocess(emptyToUndefined, z.string().email())
    .optional()
    .nullable(),
  positionNum: z.string().optional(),
  positionName: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  unitName: z.string().optional().nullable(),
  plannedStart: optionalDate,

  // actual:
  actualStart: optionalDate,
  userEmail: z
    .preprocess(emptyToUndefined, z.string().email())
    .optional()
    .nullable(),
  userName: optStr,
  personalNumber: optStr,

  // společné:
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
  const record = await prisma.employeeOnboarding.findUnique({ where: { id } })
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
    const body = await request.json()
    const data = updateSchema.parse(body)

    const before = await prisma.employeeOnboarding.findUnique({ where: { id } })
    if (!before) {
      return NextResponse.json(
        { status: "error", message: "Záznam nenalezen." },
        { status: 404 }
      )
    }

    const patch: Record<string, unknown> = {}

    if (data.titleBefore !== undefined) patch.titleBefore = data.titleBefore
    if (data.name !== undefined) patch.name = data.name
    if (data.surname !== undefined) patch.surname = data.surname
    if (data.titleAfter !== undefined) patch.titleAfter = data.titleAfter
    if (data.email !== undefined) patch.email = data.email
    if (data.positionNum !== undefined) patch.positionNum = data.positionNum
    if (data.positionName !== undefined)
      patch.positionName = data.positionName ?? ""
    if (data.department !== undefined) patch.department = data.department ?? ""
    if (data.unitName !== undefined) patch.unitName = data.unitName ?? ""
    if (data.plannedStart !== undefined) patch.plannedStart = data.plannedStart

    if (data.actualStart !== undefined) patch.actualStart = data.actualStart
    if (data.userEmail !== undefined) patch.userEmail = data.userEmail
    if (data.userName !== undefined) patch.userName = data.userName
    if (data.personalNumber !== undefined)
      patch.personalNumber = data.personalNumber

    if (data.notes !== undefined) patch.notes = data.notes
    if (data.status !== undefined) patch.status = data.status

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.employeeOnboarding.update({
        where: { id },
        data: patch,
      })

      const fieldsToLog = [
        "plannedStart",
        "actualStart",
        "titleBefore",
        "name",
        "surname",
        "titleAfter",
        "email",
        "positionNum",
        "positionName",
        "department",
        "unitName",
        "userEmail",
        "userName",
        "personalNumber",
        "notes",
        "status",
      ] as const

      const diffs = makeDiff(before, u, fieldsToLog)
      if (diffs.length) {
        await tx.onboardingChangeLog.createMany({
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

  const before = await prisma.employeeOnboarding.findUnique({ where: { id } })
  if (!before) {
    return NextResponse.json(
      { status: "error", message: "Záznam nenalezen." },
      { status: 404 }
    )
  }
  if (before.actualStart) {
    return NextResponse.json(
      { status: "error", message: "Skutečné nástupy nelze mazat." },
      { status: 409 }
    )
  }

  const userKey =
    (session.user as { id?: string; email?: string }).id ??
    session.user.email ??
    "unknown"

  const oldValue = JSON.stringify({ data: snapshotOnboarding(before) })

  await prisma.$transaction(async (tx) => {
    await tx.onboardingChangeLog.create({
      data: {
        employeeId: before.id,
        userId: userKey,
        action: "DELETE",
        field: "*",
        oldValue,
        newValue: null,
      },
    })
    await tx.employeeOnboarding.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  })

  return new NextResponse(null, { status: 204 })
}
