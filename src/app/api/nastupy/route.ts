import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { z, ZodError } from "zod"

import { prisma } from "@/lib/db"

const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v

const base = z.object({
  titleBefore: z.union([z.string(), z.null()]).optional(),
  name: z.string(),
  surname: z.string(),
  titleAfter: z.union([z.string(), z.null()]).optional(),
  email: z.preprocess(emptyToUndefined, z.string().email()).optional(),
  positionNum: z.string(),
  positionName: z.string().optional(),
  department: z.string().optional(),
  unitName: z.string().optional(),
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
  userEmail: z.preprocess(emptyToUndefined, z.string().email()).optional(),
  userName: z.union([z.string(), z.null()]).optional(),
  personalNumber: z.union([z.string(), z.null()]).optional(),
})

export async function GET() {
  try {
    const onboardings = await prisma.employeeOnboarding.findMany({
      where: { deletedAt: null },
      orderBy: { plannedStart: "desc" },
    })
    return NextResponse.json({ status: "success", data: onboardings })
  } catch (err) {
    console.error("Chyba při načítání nástupů:", err)
    return NextResponse.json(
      { status: "error", message: "Nepodařilo se načíst seznam nástupů." },
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
    const isActual =
      raw.actualStart != null && String(raw.actualStart).trim() !== ""

    if (isActual) {
      const data = createActualSchema.parse(raw)
      const planned = data.plannedStart ?? data.actualStart

      const created = await prisma.employeeOnboarding.create({
        data: {
          name: data.name,
          surname: data.surname,
          titleBefore: data.titleBefore ?? null,
          titleAfter: data.titleAfter ?? null,
          email: data.email ?? null,

          plannedStart: planned,
          actualStart: data.actualStart,

          positionNum: data.positionNum,
          positionName: data.positionName ?? "",
          department: data.department ?? "",
          unitName: data.unitName ?? "",

          notes: data.notes ?? null,
          userEmail: data.userEmail ?? null,
          userName: data.userName ?? null,
          personalNumber: data.personalNumber ?? null,

          status: "COMPLETED",
        },
      })

      return NextResponse.json({ status: "success", data: created })
    }

    // create PLANNED
    const d = createPlannedSchema.parse(raw)

    const created = await prisma.employeeOnboarding.create({
      data: {
        name: d.name,
        surname: d.surname,
        titleBefore: d.titleBefore ?? null,
        titleAfter: d.titleAfter ?? null,
        email: d.email ?? null,

        plannedStart: d.plannedStart,
        actualStart: null,

        positionNum: d.positionNum,
        positionName: d.positionName ?? "",
        department: d.department ?? "",
        unitName: d.unitName ?? "",

        notes: d.notes ?? null,
        status: "NEW",
      },
    })

    return NextResponse.json({ status: "success", data: created })
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
      { status: "error", message: "Chyba při vytváření nástupu." },
      { status: 500 }
    )
  }
}
