import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { prisma } from "@/lib/db"
import { getEmployees } from "@/lib/eos-employees"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const querySchema = z.object({
  number: z
    .string()
    .trim()
    .min(1, "Číslo je povinné.")
    .regex(/^\d+$/, "Osobní číslo musí obsahovat jen číslice."),
})

type CheckResponse =
  | { ok: true }
  | { ok: false; usedBy?: string; message?: string }

type EosEmployee = {
  personalNumber: string | null
  titleBefore?: string | null
  name?: string | null
  surname?: string | null
  titleAfter?: string | null
}

function buildFullName(args: {
  titleBefore?: string | null
  name?: string | null
  surname?: string | null
  titleAfter?: string | null
}): string {
  return [
    args.titleBefore ?? "",
    args.name ?? "",
    args.surname ?? "",
    args.titleAfter ?? "",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const rawNumber = url.searchParams.get("number")

    const parsed = querySchema.safeParse({ number: rawNumber })
    if (!parsed.success) {
      return NextResponse.json<CheckResponse>(
        {
          ok: false,
          usedBy: undefined,
          message: "Neplatné osobní číslo.",
        },
        { status: 400 }
      )
    }

    const personalNumber = parsed.data.number

    try {
      const employees = (await getEmployees(personalNumber)) as
        | EosEmployee[]
        | null

      if (Array.isArray(employees) && employees.length > 0) {
        const eosEmployee = employees.find(
          (e) => e.personalNumber === personalNumber
        )

        if (eosEmployee) {
          const usedBy = buildFullName(eosEmployee)
          return NextResponse.json<CheckResponse>({
            ok: false,
            usedBy: usedBy || undefined,
          })
        }
      }
    } catch (e) {
      console.error("EOS kontrola osobního čísla selhala:", e)
    }

    const user = await prisma.user.findFirst({
      where: { personalNumber },
      select: {
        name: true,
        surname: true,
      },
    })

    if (user) {
      const usedBy = buildFullName({
        titleBefore: null,
        name: user.name ?? null,
        surname: user.surname ?? null,
        titleAfter: null,
      })
      return NextResponse.json<CheckResponse>({
        ok: false,
        usedBy: usedBy || undefined,
      })
    }

    const onboarding = await prisma.employeeOnboarding.findFirst({
      where: {
        personalNumber,
        deletedAt: null,
      },
      select: {
        titleBefore: true,
        name: true,
        surname: true,
        titleAfter: true,
      },
      orderBy: { createdAt: "desc" },
    })

    if (onboarding) {
      const usedBy = buildFullName(onboarding)
      return NextResponse.json<CheckResponse>({
        ok: false,
        usedBy: usedBy || undefined,
      })
    }

    const offboarding = await prisma.employeeOffboarding.findFirst({
      where: {
        personalNumber,
        deletedAt: null,
      },
      select: {
        titleBefore: true,
        name: true,
        surname: true,
        titleAfter: true,
      },
      orderBy: { createdAt: "desc" },
    })

    if (offboarding) {
      const usedBy = buildFullName(offboarding)
      return NextResponse.json<CheckResponse>({
        ok: false,
        usedBy: usedBy || undefined,
      })
    }

    const gap = await prisma.personalNumberGap.findUnique({
      where: { number: personalNumber },
      select: { status: true },
    })

    if (gap?.status === "USED") {
      return NextResponse.json<CheckResponse>({
        ok: false,
        usedBy: undefined,
      })
    }

    return NextResponse.json<CheckResponse>({ ok: true })
  } catch (error) {
    console.error("Chyba při ověřování osobního čísla:", error)
    return NextResponse.json<CheckResponse>(
      {
        ok: false,
        usedBy: undefined,
        message: "Chyba při ověřování osobního čísla.",
      },
      { status: 500 }
    )
  }
}
