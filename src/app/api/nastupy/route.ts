import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { z, ZodError } from "zod"

import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v

const base = z.object({
  titleBefore: z.union([z.string(), z.null()]).optional(),
  name: z.string().min(1, "Jméno je povinné"),
  surname: z.string().min(1, "Příjmení je povinné"),
  titleAfter: z.union([z.string(), z.null()]).optional(),
  email: z
    .preprocess(emptyToUndefined, z.string().email())
    .optional()
    .nullable(),
  phone: z.union([z.string(), z.null()]).optional(),
  positionNum: z.string().min(1, "Číslo pozice je povinné"),
  positionName: z.string().optional(),
  department: z.string().optional(),
  unitName: z.string().optional(),
  startTime: z.union([z.string(), z.null()]).optional(),
  probationEnd: z.preprocess(emptyToUndefined, z.coerce.date()).optional(),
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
  userEmail: z
    .preprocess(emptyToUndefined, z.string().email())
    .optional()
    .nullable(),
  userName: z.union([z.string(), z.null()]).optional(),
  personalNumber: z.union([z.string(), z.null()]).optional(),
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
  userEmail: z
    .preprocess(emptyToUndefined, z.string().email())
    .optional()
    .nullable(),
  userName: z.union([z.string(), z.null()]).optional(),
  personalNumber: z.union([z.string(), z.null()]).optional(),
})

type SessionUser = { id?: string | null; email?: string | null }

type RawOnboardingBody = {
  actualStart?: string | null
  generatedSkippedPersonalNumbers?: unknown
  [key: string]: unknown
}

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
    const raw: RawOnboardingBody = await request.json()

    const isActual =
      raw.actualStart != null && String(raw.actualStart).trim() !== ""

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

    const createdBy = ((session.user as SessionUser).id ??
      session.user.email ??
      "unknown") as string

    if (isActual) {
      const data = createActualSchema.parse(raw)
      const planned = data.plannedStart ?? data.actualStart

      const created = await prisma.$transaction(async (tx) => {
        const newEmployee = await tx.employeeOnboarding.create({
          data: {
            name: data.name,
            surname: data.surname,
            titleBefore: data.titleBefore ?? null,
            titleAfter: data.titleAfter ?? null,
            email: data.email ?? null,
            phone: data.phone ?? null,

            plannedStart: planned,
            actualStart: data.actualStart,
            startTime: data.startTime ?? null,
            probationEnd: data.probationEnd ?? null,

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

        if (data.personalNumber && data.personalNumber.trim() !== "") {
          await tx.personalNumberGap.updateMany({
            where: {
              number: data.personalNumber.trim(),
              status: "SKIPPED",
            },
            data: { status: "USED", usedAt: new Date() },
          })
        }

        await tx.onboardingChangeLog.create({
          data: {
            employeeId: newEmployee.id,
            userId: createdBy,
            action: "CREATED",
            field: "initial_creation",
            oldValue: null,
            newValue: JSON.stringify({
              type: "actual_onboarding",
              name: `${data.name} ${data.surname}`,
              position: data.positionName,
              actualStart: data.actualStart.toISOString(),
            }),
          },
        })

        return newEmployee
      })

      return NextResponse.json({ status: "success", data: created })
    }

    const d = createPlannedSchema.parse(raw)

    const created = await prisma.$transaction(async (tx) => {
      const newEmployee = await tx.employeeOnboarding.create({
        data: {
          name: d.name,
          surname: d.surname,
          titleBefore: d.titleBefore ?? null,
          titleAfter: d.titleAfter ?? null,
          email: d.email ?? null,
          phone: d.phone ?? null,

          plannedStart: d.plannedStart,
          actualStart: null,
          startTime: d.startTime ?? null,
          probationEnd: d.probationEnd ?? null,

          positionNum: d.positionNum,
          positionName: d.positionName ?? "",
          department: d.department ?? "",
          unitName: d.unitName ?? "",

          notes: d.notes ?? null,
          userEmail: d.userEmail ?? null,
          userName: d.userName ?? null,
          personalNumber: d.personalNumber ?? null,

          status: "NEW",
        },
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

      if (d.personalNumber && d.personalNumber.trim() !== "") {
        await tx.personalNumberGap.updateMany({
          where: {
            number: d.personalNumber.trim(),
            status: "SKIPPED",
          },
          data: { status: "USED", usedAt: new Date() },
        })
      }

      await tx.onboardingChangeLog.create({
        data: {
          employeeId: newEmployee.id,
          userId: createdBy,
          action: "CREATED",
          field: "initial_creation",
          oldValue: null,
          newValue: JSON.stringify({
            type: "planned_onboarding",
            name: `${d.name} ${d.surname}`,
            position: d.positionName,
            plannedStart: d.plannedStart.toISOString(),
          }),
        },
      })

      return newEmployee
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
      {
        status: "error",
        message: "Chyba při vytváření nástupu.",
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
