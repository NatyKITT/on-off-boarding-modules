import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { getProbationFormType } from "@/lib/probation"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  { params }: { params: { hash: string } }
) {
  try {
    const { hash } = params

    if (!hash || hash.length < 32) {
      return NextResponse.json({ error: "Invalid hash" }, { status: 400 })
    }

    const onboarding = await prisma.employeeOnboarding.findUnique({
      where: { probationEvaluationHash: hash },
      select: {
        id: true,
        titleBefore: true,
        name: true,
        surname: true,
        titleAfter: true,
        positionName: true,
        positionType: true,
        department: true,
        unitName: true,
        actualStart: true,
        probationEnd: true,
        probationHashExpiresAt: true,
        probationHashUsedAt: true,
        probationEvaluations: {
          select: {
            id: true,
            createdAt: true,
          },
        },
      },
    })

    if (!onboarding) {
      return NextResponse.json({ error: "Formulář nenalezen" }, { status: 404 })
    }

    if (
      onboarding.probationHashExpiresAt &&
      new Date() > onboarding.probationHashExpiresAt
    ) {
      return NextResponse.json(
        {
          error: "Formulář vypršel",
          message:
            "Lhůta pro vyplnění formuláře již uplynula. Kontaktujte HR oddělení.",
        },
        { status: 410 }
      )
    }

    if (onboarding.probationEvaluations.length > 0) {
      return NextResponse.json(
        {
          error: "Formulář již vyplněn",
          message: "Tento formulář již byl vyplněn. Děkujeme.",
          submittedAt: onboarding.probationEvaluations[0].createdAt,
        },
        { status: 410 }
      )
    }

    const formType = getProbationFormType(onboarding.positionType)

    return NextResponse.json({
      success: true,
      onboarding: {
        id: onboarding.id,
        titleBefore: onboarding.titleBefore,
        name: onboarding.name,
        surname: onboarding.surname,
        titleAfter: onboarding.titleAfter,
        positionName: onboarding.positionName,
        department: onboarding.department,
        unitName: onboarding.unitName,
        actualStart: onboarding.actualStart,
        probationEnd: onboarding.probationEnd,
      },
      formType,
      expiresAt: onboarding.probationHashExpiresAt,
    })
  } catch (error) {
    console.error("Error fetching probation evaluation form:", error)

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
