import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

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

  const id = Number(params.id)
  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { status: "error", message: "Neplatné ID." },
      { status: 400 }
    )
  }

  try {
    const change = await prisma.employeeChange.findUnique({
      where: { id, deletedAt: null },
      select: { id: true, personalNumber: true },
    })

    if (!change) {
      return NextResponse.json(
        { status: "error", message: "Záznam nenalezen." },
        { status: 404 }
      )
    }

    if (!change.personalNumber?.trim()) {
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

    const pn = change.personalNumber.trim()

    const [onboardingMatches, offboardingMatches] = await Promise.all([
      prisma.employeeOnboarding.findMany({
        where: { personalNumber: pn, deletedAt: null },
        select: {
          id: true,
          name: true,
          surname: true,
          positionName: true,
          department: true,
          plannedStart: true,
          actualStart: true,
        },
      }),
      prisma.employeeOffboarding.findMany({
        where: { personalNumber: pn, deletedAt: null },
        select: {
          id: true,
          name: true,
          surname: true,
          positionName: true,
          department: true,
          plannedEnd: true,
          actualEnd: true,
        },
      }),
    ])

    const total = onboardingMatches.length + offboardingMatches.length

    return NextResponse.json({
      status: "success",
      data: {
        changeId: id,
        personalNumber: pn,
        onboardingMatches: onboardingMatches.map((m) => ({
          ...m,
          plannedStart: m.plannedStart?.toISOString() ?? null,
          actualStart: m.actualStart?.toISOString() ?? null,
        })),
        offboardingMatches: offboardingMatches.map((m) => ({
          ...m,
          plannedEnd: m.plannedEnd?.toISOString() ?? null,
          actualEnd: m.actualEnd?.toISOString() ?? null,
        })),
        message:
          total > 0
            ? `Nalezeno ${total} záznam${total === 1 ? "" : total < 5 ? "y" : "ů"} se shodným osobním číslem.`
            : "Žádné záznamy se shodným osobním číslem nebyly nalezeny.",
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
