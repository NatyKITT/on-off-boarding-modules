import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { z, ZodError } from "zod"

import { prisma } from "@/lib/db"

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
  noticeMonths: z.number().optional(),
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

export async function GET() {
  try {
    const offboardings = await prisma.employeeOffboarding.findMany({
      where: { deletedAt: null },
      orderBy: { plannedEnd: "desc" },
    })
    return NextResponse.json({ status: "success", data: offboardings })
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
      return NextResponse.json({ status: "success", data: created })
    }

    const d = createPlannedSchema.parse(raw)
    const created = await prisma.employeeOffboarding.create({
      data: {
        name: d.name,
        surname: d.surname,
        titleBefore: d.titleBefore ?? null,
        titleAfter: d.titleAfter ?? null,

        plannedEnd: d.plannedEnd,
        actualEnd: d.actualEnd ?? null,
        noticeEnd: d.noticeEnd ?? null,
        noticeMonths: d.noticeMonths ?? 2,
        hasCustomDates: d.hasCustomDates ?? false,

        positionNum: d.positionNum,
        positionName: d.positionName ?? "",
        department: d.department ?? "",
        unitName: d.unitName ?? "",

        userEmail: d.userEmail ?? null,
        userName: d.userName ?? null,
        personalNumber: d.personalNumber ?? null,

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
    console.error("Chyba při vytváření odchodu:", err)
    return NextResponse.json(
      { status: "error", message: "Chyba při vytváření odchodu." },
      { status: 500 }
    )
  }
}
