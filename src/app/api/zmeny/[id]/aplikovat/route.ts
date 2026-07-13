import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function POST(
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

    const personalNumber = change.personalNumber?.trim() || null

    if (!personalNumber) {
      return NextResponse.json({
        status: "success",
        message:
          "Změna byla uložena pouze jako informace. Nemá osobní číslo, proto k ní nelze dohledat nástupy ani odchody.",
        data: {
          changeId: id,
          personalNumber: null,
          appliedToOnboarding: 0,
          appliedToOffboarding: 0,
          infoOnly: true,
        },
      })
    }

    const [onboardingMatchesCount, offboardingMatchesCount] = await Promise.all(
      [
        prisma.employeeOnboarding.count({
          where: {
            deletedAt: null,
            personalNumber,
          },
        }),
        prisma.employeeOffboarding.count({
          where: {
            deletedAt: null,
            personalNumber,
          },
        }),
      ]
    )

    return NextResponse.json({
      status: "success",
      message:
        "Změna byla ponechána pouze jako informační vazba. Nástupy ani odchody nebyly přepsány.",
      data: {
        changeId: id,
        personalNumber,
        appliedToOnboarding: 0,
        appliedToOffboarding: 0,
        onboardingMatchesCount,
        offboardingMatchesCount,
        infoOnly: true,
      },
    })
  } catch (err) {
    console.error("POST /api/zmeny/[id]/aplikovat info-only error:", err)

    return NextResponse.json(
      {
        status: "error",
        message: "Chyba při načítání informační vazby změny.",
      },
      { status: 500 }
    )
  }
}
