import { NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import { getProbationFormType } from "@/lib/probation"

const HR_RECIPIENTS = Array.from(
  new Set(
    [
      ...(process.env.HR_NOTIFICATION_EMAILS || "").split(","),
      ...(process.env.HR_EMAILS || "").split(","),
    ]
      .map((x) => x.trim())
      .filter(Boolean)
  )
)

export const dynamic = "force-dynamic"

interface SubmitData {
  workPerformance: string
  socialBehavior: string
  recommendation: boolean
  reasonIfNo?: string
  evaluatorName: string
  evaluatorEmail: string
}

function buildEmployeeFullName(employee: {
  titleBefore?: string | null
  name: string
  surname: string
  titleAfter?: string | null
}) {
  return [
    employee.titleBefore ?? "",
    employee.name,
    employee.surname,
    employee.titleAfter ?? "",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

export async function POST(
  request: Request,
  { params }: { params: { hash: string } }
) {
  try {
    const { hash } = params
    const session = await auth()

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
        probationHashExpiresAt: true,
        probationEvaluations: {
          select: { id: true },
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
      return NextResponse.json({ error: "Formulář vypršel" }, { status: 410 })
    }

    if (onboarding.probationEvaluations.length > 0) {
      return NextResponse.json(
        { error: "Formulář již vyplněn" },
        { status: 410 }
      )
    }

    const body = (await request.json()) as SubmitData

    if (!body.workPerformance?.trim() || !body.socialBehavior?.trim()) {
      return NextResponse.json(
        { error: "Vyplňte všechna povinná pole." },
        { status: 400 }
      )
    }

    if (!body.evaluatorName?.trim() || !body.evaluatorEmail?.trim()) {
      return NextResponse.json(
        { error: "Vyplňte jméno a e-mail hodnotitele." },
        { status: 400 }
      )
    }

    if (!body.recommendation && !body.reasonIfNo?.trim()) {
      return NextResponse.json(
        { error: "Pokud nedoporučujete setrvání, uveďte důvod." },
        { status: 400 }
      )
    }

    const formType = getProbationFormType(onboarding.positionType)
    const evaluatedById = session?.user?.id || null
    const employeeName = buildEmployeeFullName(onboarding)

    const evaluation = await prisma.probationEvaluation.create({
      data: {
        onboardingId: onboarding.id,
        formType,
        workPerformance: body.workPerformance.trim(),
        socialBehavior: body.socialBehavior.trim(),
        recommendation: body.recommendation,
        reasonIfNo: body.reasonIfNo?.trim() || null,
        evaluatorName: body.evaluatorName.trim(),
        evaluatorEmail: body.evaluatorEmail.trim(),
        evaluatedById,
      },
    })

    await prisma.$transaction(async (tx) => {
      await tx.employeeOnboarding.update({
        where: { id: onboarding.id },
        data: {
          probationHashUsedAt: new Date(),
        },
      })

      await tx.employmentDocument.upsert({
        where: {
          onboardingId_type: {
            onboardingId: onboarding.id,
            type: "PROBATION_EVALUATION",
          },
        },
        update: {
          status: "COMPLETED",
          completedAt: new Date(),
          data: {
            formType,
            workPerformance: body.workPerformance.trim(),
            socialBehavior: body.socialBehavior.trim(),
            recommendation: body.recommendation,
            reasonIfNo: body.reasonIfNo?.trim() || null,
            evaluatorName: body.evaluatorName.trim(),
            evaluatorEmail: body.evaluatorEmail.trim(),
            evaluatedAt: new Date().toISOString(),
          },
        },
        create: {
          onboardingId: onboarding.id,
          type: "PROBATION_EVALUATION",
          status: "COMPLETED",
          completedAt: new Date(),
          data: {
            formType,
            workPerformance: body.workPerformance.trim(),
            socialBehavior: body.socialBehavior.trim(),
            recommendation: body.recommendation,
            reasonIfNo: body.reasonIfNo?.trim() || null,
            evaluatorName: body.evaluatorName.trim(),
            evaluatorEmail: body.evaluatorEmail.trim(),
            evaluatedAt: new Date().toISOString(),
          },
        },
      })

      await tx.onboardingChangeLog.create({
        data: {
          employeeId: onboarding.id,
          userId: evaluatedById || "external-evaluator",
          action: "CREATED",
          field: "probation_evaluation",
          newValue: `Formulář vyplněn (${formType}), doporučení: ${body.recommendation ? "ANO" : "NE"}, hodnotitel: ${body.evaluatorName}`,
        },
      })

      if (HR_RECIPIENTS.length > 0) {
        await tx.mailQueue.create({
          data: {
            type: "PROBATION_FORM_COMPLETED",
            payload: {
              recipients: HR_RECIPIENTS,
              employeeId: onboarding.id,
              employeeName,
              position: onboarding.positionName,
              department: onboarding.department,
              unitName: onboarding.unitName,
              recommendation: body.recommendation,
              evaluatorName: body.evaluatorName,
              evaluatorEmail: body.evaluatorEmail,
              formType,
              detailLink: `${process.env.NEXT_PUBLIC_APP_URL}/nastupy/${onboarding.id}`,
              subject: `Hodnocení ZD vyplněno - ${employeeName}`,
            },
            priority: 1,
            createdBy: evaluatedById || "external-evaluator",
          },
        })
      }
    })

    return NextResponse.json({
      success: true,
      message: "Formulář byl úspěšně odeslán. Děkujeme.",
      evaluation: {
        id: evaluation.id,
        recommendation: evaluation.recommendation,
      },
    })
  } catch (error) {
    console.error("Error submitting probation evaluation:", error)

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
