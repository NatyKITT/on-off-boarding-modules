import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import {
  buildPersonFullName,
  normalizePersonSnapshot,
  toSupervisorFields,
  type PersonSnapshot,
} from "@/lib/person-snapshot"
import {
  ensureProbationDocumentDraft,
  ensureProbationHash,
  getProbationFormType,
} from "@/lib/probation"

type Body = {
  onboardingId?: number
  supervisor?: Partial<PersonSnapshot>
}

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

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = (await req.json()) as Body
    const onboardingId = Number(body.onboardingId)

    if (!Number.isFinite(onboardingId)) {
      return NextResponse.json(
        { message: "Neplatné onboardingId" },
        { status: 400 }
      )
    }

    const supervisor = normalizePersonSnapshot(body.supervisor)

    if (!supervisor.name || !supervisor.surname || !supervisor.email) {
      return NextResponse.json(
        { message: "Vyplňte jméno, příjmení a e-mail vedoucího." },
        { status: 400 }
      )
    }

    const onboarding = await prisma.employeeOnboarding.findUnique({
      where: { id: onboardingId },
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
        probationEnd: true,
        probationEvaluationHash: true,
      },
    })

    if (!onboarding) {
      return NextResponse.json(
        { message: "Onboarding nebyl nalezen." },
        { status: 404 }
      )
    }

    const employeeName = buildEmployeeFullName(onboarding)
    const supervisorFullName = buildPersonFullName(supervisor)
    const formType = getProbationFormType(onboarding.positionType)

    let evaluationLink = ""

    await prisma.$transaction(async (tx) => {
      await ensureProbationDocumentDraft(tx, onboarding.id, formType)

      const { hash } = await ensureProbationHash(
        tx,
        onboarding.id,
        onboarding.probationEvaluationHash,
        onboarding.probationEnd
      )

      evaluationLink = `${process.env.NEXT_PUBLIC_APP_URL}/probation-evaluation/${hash}`

      await tx.employeeOnboarding.update({
        where: { id: onboarding.id },
        data: {
          ...toSupervisorFields(supervisor, supervisor.source !== "EOS"),
          probationEvaluationSentAt: new Date(),
          probationEvaluationSentBy: session.user.id || "manual",
        },
      })

      await tx.mailQueue.create({
        data: {
          type: "PROBATION_SUPERVISOR_21_DAYS",
          payload: {
            recipients: [supervisor.email],
            supervisorName: supervisorFullName,
            employeeId: onboarding.id,
            employeeName,
            position: onboarding.positionName,
            department: onboarding.department,
            unitName: onboarding.unitName,
            probationEndDate: onboarding.probationEnd?.toISOString() ?? null,
            evaluationLink,
            formType,
            subject: `Vyplňte hodnocení zkušební doby - ${employeeName}`,
            manualSend: true,
          },
          priority: 1,
          createdBy: session.user.id || "manual",
        },
      })

      if (HR_RECIPIENTS.length > 0) {
        await tx.mailQueue.create({
          data: {
            type: "PROBATION_HR_INFO_21_DAYS",
            payload: {
              recipients: HR_RECIPIENTS,
              employeeId: onboarding.id,
              employeeName,
              position: onboarding.positionName,
              department: onboarding.department,
              unitName: onboarding.unitName,
              supervisorName: supervisorFullName,
              supervisorEmail: supervisor.email,
              probationEndDate: onboarding.probationEnd?.toISOString() ?? null,
              evaluationLink,
              formType,
              subject: `Informace HR - ručně odesláno hodnocení ZD - ${employeeName}`,
              manualSend: true,
            },
            priority: 2,
            createdBy: session.user.id || "manual",
          },
        })
      }

      await tx.onboardingChangeLog.create({
        data: {
          employeeId: onboarding.id,
          userId: session.user.id || "manual",
          action: "PROBATION_EVALUATION_SENT",
          field: "probation_evaluation_send",
          oldValue: null,
          newValue: `Odesláno vedoucímu ${supervisorFullName} <${supervisor.email}>`,
        },
      })
    })

    return NextResponse.json({
      success: true,
      evaluationLink,
    })
  } catch (error) {
    console.error("Error sending probation evaluation:", error)

    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    )
  }
}
