import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import { normalizePersonalNumber } from "@/lib/employment-linking"
import { canReadEmployeeChanges } from "@/lib/rbac"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET(
  _: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  if (!canReadEmployeeChanges(session.user.role)) {
    return NextResponse.json(
      { status: "error", message: "Nemáte oprávnění číst vazby změny." },
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
    const change = await prisma.employeeChange.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        personalNumber: true,
      },
    })

    if (!change) {
      return NextResponse.json(
        { status: "error", message: "Záznam nenalezen." },
        { status: 404 }
      )
    }

    const personalNumber = normalizePersonalNumber(change.personalNumber)

    if (!personalNumber) {
      return NextResponse.json({
        status: "success",
        data: {
          changeId: id,
          personalNumber: null,
          onboardingMatches: [],
          offboardingMatches: [],
          message: "Změna nemá osobní číslo.",
        },
      })
    }

    const [onboardingMatches, offboardingMatches] = await Promise.all([
      prisma.employeeOnboarding.findMany({
        where: {
          personalNumber,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          surname: true,
          titleBefore: true,
          titleAfter: true,
          personalNumber: true,
          positionNum: true,
          positionName: true,
          department: true,
          unitName: true,
          plannedStart: true,
          actualStart: true,
        },
        orderBy: [{ plannedStart: "desc" }, { id: "desc" }],
      }),
      prisma.employeeOffboarding.findMany({
        where: {
          personalNumber,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          surname: true,
          titleBefore: true,
          titleAfter: true,
          personalNumber: true,
          positionNum: true,
          positionName: true,
          department: true,
          unitName: true,
          plannedEnd: true,
          actualEnd: true,
        },
        orderBy: [{ plannedEnd: "desc" }, { id: "desc" }],
      }),
    ])

    const total = onboardingMatches.length + offboardingMatches.length

    return NextResponse.json({
      status: "success",
      data: {
        changeId: id,
        personalNumber,
        onboardingMatches: onboardingMatches.map((match) => ({
          ...match,
          plannedStart: match.plannedStart?.toISOString() ?? null,
          actualStart: match.actualStart?.toISOString() ?? null,
        })),
        offboardingMatches: offboardingMatches.map((match) => ({
          ...match,
          plannedEnd: match.plannedEnd?.toISOString() ?? null,
          actualEnd: match.actualEnd?.toISOString() ?? null,
        })),
        message:
          total > 0
            ? `Nalezeno ${total} souvisejících záznamů se shodným osobním číslem.`
            : "Žádné záznamy se shodným osobním číslem nebyly nalezeny.",
        infoOnly: true,
      },
    })
  } catch (err) {
    console.error("GET /api/zmeny/[id]/dopad error:", err)

    return NextResponse.json(
      { status: "error", message: "Nepodařilo se načíst dopad." },
      { status: 500 }
    )
  }
}
