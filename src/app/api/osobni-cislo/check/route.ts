import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { z } from "zod"

import { prisma } from "@/lib/db"
import { getEmployees } from "@/lib/eos-employees"
import { canReadInternalApp } from "@/lib/rbac"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const querySchema = z.object({
  number: z
    .string()
    .trim()
    .min(1, "Číslo je povinné.")
    .regex(/^\d+$/, "Osobní číslo musí obsahovat jen číslice."),
  excludeOnboardingId: z
    .string()
    .trim()
    .regex(/^\d+$/, "excludeOnboardingId musí být číslo.")
    .optional(),
  excludeOffboardingId: z
    .string()
    .trim()
    .regex(/^\d+$/, "excludeOffboardingId musí být číslo.")
    .optional(),
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

async function isCurrentRecordPersonalNumber(args: {
  personalNumber: string
  excludeOnboardingId: number | null
  excludeOffboardingId: number | null
}) {
  if (args.excludeOnboardingId) {
    const currentOnboarding = await prisma.employeeOnboarding.findUnique({
      where: { id: args.excludeOnboardingId },
      select: { personalNumber: true },
    })

    if (currentOnboarding?.personalNumber === args.personalNumber) {
      return true
    }
  }

  if (args.excludeOffboardingId) {
    const currentOffboarding = await prisma.employeeOffboarding.findUnique({
      where: { id: args.excludeOffboardingId },
      select: { personalNumber: true },
    })

    if (currentOffboarding?.personalNumber === args.personalNumber) {
      return true
    }
  }

  return false
}

export async function GET(request: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json<CheckResponse>(
      {
        ok: false,
        message: "Nejste přihlášeni.",
      },
      { status: 401 }
    )
  }

  if (!canReadInternalApp(session.user.role)) {
    return NextResponse.json<CheckResponse>(
      {
        ok: false,
        message: "Nemáte oprávnění ověřovat osobní čísla.",
      },
      { status: 403 }
    )
  }

  try {
    const rawNumber = request.nextUrl.searchParams.get("number")
    const rawExcludeOnboardingId =
      request.nextUrl.searchParams.get("excludeOnboardingId") ?? undefined
    const rawExcludeOffboardingId =
      request.nextUrl.searchParams.get("excludeOffboardingId") ?? undefined

    const parsed = querySchema.safeParse({
      number: rawNumber,
      excludeOnboardingId: rawExcludeOnboardingId,
      excludeOffboardingId: rawExcludeOffboardingId,
    })

    if (!parsed.success) {
      return NextResponse.json<CheckResponse>(
        {
          ok: false,
          message: "Neplatné osobní číslo.",
        },
        { status: 400 }
      )
    }

    const personalNumber = parsed.data.number
    const excludeOnboardingId = parsed.data.excludeOnboardingId
      ? Number(parsed.data.excludeOnboardingId)
      : null
    const excludeOffboardingId = parsed.data.excludeOffboardingId
      ? Number(parsed.data.excludeOffboardingId)
      : null

    const isCurrent = await isCurrentRecordPersonalNumber({
      personalNumber,
      excludeOnboardingId,
      excludeOffboardingId,
    })

    if (isCurrent) {
      return NextResponse.json<CheckResponse>({ ok: true })
    }

    try {
      const employees = (await getEmployees(personalNumber)) as
        | EosEmployee[]
        | null

      if (Array.isArray(employees) && employees.length > 0) {
        const eosEmployee = employees.find(
          (employee) => employee.personalNumber === personalNumber
        )

        if (eosEmployee) {
          const usedBy = buildFullName(eosEmployee)

          return NextResponse.json<CheckResponse>({
            ok: false,
            usedBy: usedBy || undefined,
          })
        }
      }
    } catch (error) {
      console.error("EOS kontrola osobního čísla selhala:", error)
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
        name: user.name ?? null,
        surname: user.surname ?? null,
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
        ...(excludeOnboardingId ? { id: { not: excludeOnboardingId } } : {}),
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
        ...(excludeOffboardingId ? { id: { not: excludeOffboardingId } } : {}),
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
        message: "Osobní číslo je již označené jako použité.",
      })
    }

    return NextResponse.json<CheckResponse>({ ok: true })
  } catch (error) {
    console.error("Chyba při ověřování osobního čísla:", error)

    return NextResponse.json<CheckResponse>(
      {
        ok: false,
        message: "Chyba při ověřování osobního čísla.",
      },
      { status: 500 }
    )
  }
}
