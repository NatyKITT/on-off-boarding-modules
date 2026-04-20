import { NextRequest, NextResponse } from "next/server"
import { addDays, startOfDay } from "date-fns"

import { prisma } from "@/lib/db"
import { getSuperiorByPersonalNumber } from "@/lib/eos-superior"
import {
  buildPersonFullName,
  snapshotFromSuperior,
  toSupervisorFields,
} from "@/lib/person-snapshot"
import {
  ensureProbationDocumentDraft,
  ensureProbationHash,
  getProbationFormType,
} from "@/lib/probation"

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
  const authHeader = req.headers.get("authorization")
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`

  if (!authHeader || authHeader !== expectedToken) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
  }

  try {
    const today = startOfDay(new Date())
    const notifications: string[] = []

    const at21Date = addDays(today, 21)
    const at1DayDate = addDays(today, 1)
    const completedStart = addDays(today, -1)

    const employeesAt21Days = await prisma.employeeOnboarding.findMany({
      where: {
        deletedAt: null,
        actualStart: { not: null },
        status: "COMPLETED",
        probationEnd: {
          gte: at21Date,
          lt: addDays(at21Date, 1),
        },
        probationNotification21Sent: null,
      },
      select: {
        id: true,
        titleBefore: true,
        name: true,
        surname: true,
        titleAfter: true,
        email: true,
        userEmail: true,
        probationEnd: true,
        actualStart: true,
        positionName: true,
        positionType: true,
        department: true,
        unitName: true,
        personalNumber: true,
        probationEvaluationHash: true,

        supervisorManualOverride: true,
        supervisorSource: true,
        supervisorGid: true,
        supervisorTitleBefore: true,
        supervisorName: true,
        supervisorSurname: true,
        supervisorTitleAfter: true,
        supervisorEmail: true,
        supervisorPosition: true,
        supervisorDepartment: true,
        supervisorUnitName: true,
        supervisorPersonalNumber: true,
      },
    })

    for (const employee of employeesAt21Days) {
      const employeeName = buildEmployeeFullName(employee)
      const formType = getProbationFormType(employee.positionType)

      let supervisorSnapshot = {
        source: employee.supervisorSource ?? null,
        gid: employee.supervisorGid ?? null,
        titleBefore: employee.supervisorTitleBefore ?? null,
        name: employee.supervisorName ?? null,
        surname: employee.supervisorSurname ?? null,
        titleAfter: employee.supervisorTitleAfter ?? null,
        email: employee.supervisorEmail ?? null,
        position: employee.supervisorPosition ?? null,
        department: employee.supervisorDepartment ?? null,
        unitName: employee.supervisorUnitName ?? null,
        personalNumber: employee.supervisorPersonalNumber ?? null,
      }

      const hasStoredSupervisor =
        Boolean(supervisorSnapshot.email) &&
        Boolean(supervisorSnapshot.name || supervisorSnapshot.surname)

      if (
        !employee.supervisorManualOverride &&
        !hasStoredSupervisor &&
        employee.personalNumber
      ) {
        const superior = await getSuperiorByPersonalNumber(
          employee.personalNumber
        )
        if (superior) {
          supervisorSnapshot = snapshotFromSuperior(superior, "EOS")

          await prisma.employeeOnboarding.update({
            where: { id: employee.id },
            data: {
              ...toSupervisorFields(supervisorSnapshot, false),
            },
          })
        }
      }

      const supervisorFullName = buildPersonFullName(supervisorSnapshot)
      const supervisorEmail = supervisorSnapshot.email

      if (!supervisorEmail) {
        await prisma.mailQueue.create({
          data: {
            type: "PROBATION_MISSING_SUPERVISOR",
            payload: {
              recipients: HR_RECIPIENTS,
              employeeId: employee.id,
              employeeName,
              position: employee.positionName,
              department: employee.department,
              unitName: employee.unitName,
              probationEndDate: employee.probationEnd?.toISOString() ?? null,
              subject: `Chybí vedoucí pro hodnocení ZD - ${employeeName}`,
            },
            priority: 1,
            createdBy: "system-cron",
          },
        })

        await prisma.employeeOnboarding.update({
          where: { id: employee.id },
          data: {
            probationNotification21Sent: new Date(),
          },
        })

        notifications.push(`⚠️ Chybí vedoucí pro ${employeeName}`)
        continue
      }

      await prisma.$transaction(async (tx) => {
        await ensureProbationDocumentDraft(tx, employee.id, formType)

        const { hash } = await ensureProbationHash(
          tx,
          employee.id,
          employee.probationEvaluationHash,
          employee.probationEnd
        )

        const evaluationLink = `${process.env.NEXT_PUBLIC_APP_URL}/probation-evaluation/${hash}`

        await tx.mailQueue.create({
          data: {
            type: "PROBATION_SUPERVISOR_21_DAYS",
            payload: {
              recipients: [supervisorEmail],
              supervisorName: supervisorFullName,
              employeeId: employee.id,
              employeeName,
              position: employee.positionName,
              department: employee.department,
              unitName: employee.unitName,
              probationEndDate: employee.probationEnd?.toISOString() ?? null,
              evaluationLink,
              formType,
              subject: `Vyplňte hodnocení zkušební doby - ${employeeName}`,
            },
            priority: 1,
            createdBy: "system-cron",
          },
        })

        if (HR_RECIPIENTS.length > 0) {
          await tx.mailQueue.create({
            data: {
              type: "PROBATION_HR_INFO_21_DAYS",
              payload: {
                recipients: HR_RECIPIENTS,
                employeeId: employee.id,
                employeeName,
                position: employee.positionName,
                department: employee.department,
                unitName: employee.unitName,
                supervisorName: supervisorFullName,
                supervisorEmail,
                probationEndDate: employee.probationEnd?.toISOString() ?? null,
                evaluationLink,
                formType,
                subject: `Informace HR - zahájeno hodnocení ZD - ${employeeName}`,
              },
              priority: 2,
              createdBy: "system-cron",
            },
          })
        }

        await tx.employeeOnboarding.update({
          where: { id: employee.id },
          data: {
            probationNotification21Sent: new Date(),
            probationNotificationHRSent:
              HR_RECIPIENTS.length > 0 ? new Date() : null,
            probationEvaluationSentAt: new Date(),
            probationEvaluationSentBy: "system-cron",
          },
        })
      })

      notifications.push(`✅ Odesláno hodnocení vedoucímu pro ${employeeName}`)
    }

    const employeesAt1Day = await prisma.employeeOnboarding.findMany({
      where: {
        deletedAt: null,
        actualStart: { not: null },
        status: "COMPLETED",
        probationEnd: {
          gte: at1DayDate,
          lt: addDays(at1DayDate, 1),
        },
        probationReminder1DaySent: null,
        probationEvaluations: {
          none: {},
        },
      },
      select: {
        id: true,
        titleBefore: true,
        name: true,
        surname: true,
        titleAfter: true,
        positionName: true,
        department: true,
        unitName: true,
        probationEnd: true,
        supervisorTitleBefore: true,
        supervisorName: true,
        supervisorSurname: true,
        supervisorTitleAfter: true,
        supervisorEmail: true,
      },
    })

    for (const employee of employeesAt1Day) {
      const employeeName = buildEmployeeFullName(employee)
      const supervisorName = buildPersonFullName({
        titleBefore: employee.supervisorTitleBefore,
        name: employee.supervisorName,
        surname: employee.supervisorSurname,
        titleAfter: employee.supervisorTitleAfter,
      })

      if (HR_RECIPIENTS.length > 0) {
        await prisma.mailQueue.create({
          data: {
            type: "PROBATION_HR_REMINDER_1_DAY",
            payload: {
              recipients: HR_RECIPIENTS,
              employeeId: employee.id,
              employeeName,
              position: employee.positionName,
              department: employee.department,
              unitName: employee.unitName,
              supervisorName,
              supervisorEmail: employee.supervisorEmail,
              probationEndDate: employee.probationEnd?.toISOString() ?? null,
              subject: `Připomínka HR - chybí hodnocení ZD - ${employeeName}`,
            },
            priority: 1,
            createdBy: "system-cron",
          },
        })
      }

      await prisma.employeeOnboarding.update({
        where: { id: employee.id },
        data: {
          probationReminder1DaySent: new Date(),
        },
      })

      notifications.push(`⏰ Připomínka HR pro ${employeeName}`)
    }

    const completedProbations = await prisma.employeeOnboarding.findMany({
      where: {
        deletedAt: null,
        actualStart: { not: null },
        status: "COMPLETED",
        probationEnd: {
          gte: completedStart,
          lt: today,
        },
        probationCompletedNotified: null,
      },
      select: {
        id: true,
        titleBefore: true,
        name: true,
        surname: true,
        titleAfter: true,
        positionName: true,
        department: true,
        unitName: true,
        probationEnd: true,
        probationEvaluations: {
          select: {
            id: true,
            recommendation: true,
            evaluatorName: true,
            evaluatorEmail: true,
          },
        },
      },
    })

    for (const employee of completedProbations) {
      const employeeName = buildEmployeeFullName(employee)
      const evaluation = employee.probationEvaluations[0]

      if (HR_RECIPIENTS.length > 0) {
        await prisma.mailQueue.create({
          data: {
            type: "PROBATION_COMPLETED",
            payload: {
              recipients: HR_RECIPIENTS,
              employeeId: employee.id,
              employeeName,
              position: employee.positionName,
              department: employee.department,
              unitName: employee.unitName,
              probationEndDate: employee.probationEnd?.toISOString() ?? null,
              hasEvaluation: Boolean(evaluation),
              recommendation: evaluation?.recommendation ?? null,
              evaluatorName: evaluation?.evaluatorName ?? null,
              evaluatorEmail: evaluation?.evaluatorEmail ?? null,
              subject: `Ukončena zkušební doba - ${employeeName}`,
            },
            priority: 2,
            createdBy: "system-cron",
          },
        })
      }

      await prisma.employeeOnboarding.update({
        where: { id: employee.id },
        data: {
          probationCompletedNotified: new Date(),
        },
      })

      notifications.push(`📋 Ukončena ZD pro ${employeeName}`)
    }

    return NextResponse.json({
      success: true,
      notifications,
      stats: {
        at21Days: employeesAt21Days.length,
        at1Day: employeesAt1Day.length,
        completed: completedProbations.length,
      },
    })
  } catch (error) {
    console.error("Probation notifications error:", error)

    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
