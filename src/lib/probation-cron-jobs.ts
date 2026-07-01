import { NextRequest } from "next/server"
import { addDays, differenceInCalendarDays, startOfDay } from "date-fns"

import {
  existsActiveProbationJob,
  existsPendingProbationJob,
} from "@/lib/cron-jobs"
import { prisma } from "@/lib/db"
import {
  addProbationEvent,
  buildFullName,
  ensureProbationEvaluationRequest,
  getAppBaseUrlFromRequest,
  getHrRecipientsFromEnv,
  getSupervisorFullName,
} from "@/lib/probation-evaluation-request"

export async function ensureProbationCronJobs(req: NextRequest) {
  const now = new Date()
  const today = startOfDay(now)
  const baseUrl = getAppBaseUrlFromRequest(req)
  const hrRecipients = getHrRecipientsFromEnv()

  const notifications: string[] = []

  const in21Days = addDays(today, 21)
  const in3Days = addDays(today, 3)

  const employeesAt21Days = await prisma.employeeOnboarding.findMany({
    where: {
      deletedAt: null,
      actualStart: { not: null },
      status: "COMPLETED",
      probationEnd: {
        gte: in21Days,
        lt: addDays(in21Days, 1),
      },
    },
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

      supervisorTitleBefore: true,
      supervisorName: true,
      supervisorSurname: true,
      supervisorTitleAfter: true,
      supervisorEmail: true,
    },
  })

  for (const employee of employeesAt21Days) {
    const employeeName = buildFullName(employee)

    const ensured = await prisma.$transaction(async (tx) => {
      return ensureProbationEvaluationRequest(tx, {
        onboardingId: employee.id,
        createdBy: "system-cron",
        createdByName: "Systémový cron",
      })
    })

    const request = ensured.request

    const supervisorName =
      request.supervisorName || getSupervisorFullName(employee) || null

    const supervisorEmail =
      request.supervisorEmail?.trim() || employee.supervisorEmail?.trim() || ""

    if (!supervisorEmail) {
      const alreadyMissingSupervisorJob = await existsActiveProbationJob({
        type: "PROBATION_EVALUATION_HR_MISSING_SUPERVISOR",
        requestId: request.id,
        employeeId: employee.id,
      })

      if (
        !alreadyMissingSupervisorJob &&
        !request.missingSupervisorNotifiedAt &&
        hrRecipients.length > 0
      ) {
        const mailJob = await prisma.mailQueue.create({
          data: {
            type: "PROBATION_EVALUATION_HR_MISSING_SUPERVISOR",
            payload: {
              recipients: hrRecipients,
              requestId: request.id,
              employeeId: employee.id,
              employeeName,
              employeePosition: employee.positionName,
              employeeDepartment: employee.department,
              employeeUnitName: employee.unitName,
              probationEndDate: employee.probationEnd?.toISOString() ?? null,
              formType: request.formType,
              subject: `Chybí vedoucí pro vyhodnocení zkušební doby – ${employeeName}`,
            },
            status: "QUEUED",
            priority: 1,
            createdBy: "system-cron",
          },
        })

        await prisma.$transaction(async (tx) => {
          await tx.probationEvaluationRequest.update({
            where: { id: request.id },
            data: {
              missingSupervisorNotifiedAt: now,
              missingSupervisorNotifiedBy: "system-cron",
            },
          })

          await addProbationEvent(tx, {
            requestId: request.id,
            action: "MISSING_SUPERVISOR",
            by: "system-cron",
            byName: "Systémový cron",
            mailQueueId: mailJob.id,
            message:
              "Nelze odeslat vyhodnocení zkušební doby, protože chybí vedoucí nebo e-mail vedoucího.",
          })
        })

        notifications.push(`missing_supervisor_queued:${employee.id}`)
      } else {
        notifications.push(`missing_supervisor_skipped:${employee.id}`)
      }

      continue
    }

    if (request.completedAt || request.status === "COMPLETED") {
      notifications.push(`already_completed:${employee.id}`)
      continue
    }

    if (request.sentAt || request.status === "SENT") {
      notifications.push(`already_sent:${employee.id}`)
      continue
    }

    const evaluationLink = `${baseUrl}/vyhodnoceni-zkusebni-doby/${request.token}`

    const alreadyInviteJob = await existsActiveProbationJob({
      type: "PROBATION_EVALUATION_INVITE",
      requestId: request.id,
      employeeId: employee.id,
    })

    if (!alreadyInviteJob) {
      const inviteJob = await prisma.mailQueue.create({
        data: {
          type: "PROBATION_EVALUATION_INVITE",
          payload: {
            recipients: [supervisorEmail],
            requestId: request.id,
            employeeId: employee.id,
            employeeName,
            employeePosition: employee.positionName,
            employeeDepartment: employee.department,
            employeeUnitName: employee.unitName,
            probationEndDate: employee.probationEnd?.toISOString() ?? null,
            supervisorName,
            supervisorEmail,
            evaluationLink,
            formType: request.formType,
            subject: `Vyplňte vyhodnocení zkušební doby – ${employeeName}`,
          },
          status: "QUEUED",
          priority: 1,
          createdBy: "system-cron",
        },
      })

      await prisma.$transaction(async (tx) => {
        await tx.probationEvaluationRequest.update({
          where: { id: request.id },
          data: {
            status: "SENT",
            sentAt: now,
            sentBy: "system-cron",
            sentByName: "Systémový cron",
            sentMethod: "CRON",
            supervisorName,
            supervisorEmail,
          },
        })

        await addProbationEvent(tx, {
          requestId: request.id,
          action: "INVITE_QUEUED",
          by: "system-cron",
          byName: "Systémový cron",
          mailQueueId: inviteJob.id,
          message: `Pozvánka k vyhodnocení zkušební doby byla zařazena do fronty pro ${supervisorEmail}.`,
          meta: {
            supervisorName,
            supervisorEmail,
            evaluationLink,
          },
        })
      })

      notifications.push(`invite_queued:${employee.id}`)
    }

    if (!request.hrInfoSentAt && hrRecipients.length > 0) {
      const alreadyHrInfoJob = await existsActiveProbationJob({
        type: "PROBATION_EVALUATION_HR_INFO",
        requestId: request.id,
        employeeId: employee.id,
      })

      if (!alreadyHrInfoJob) {
        const hrInfoJob = await prisma.mailQueue.create({
          data: {
            type: "PROBATION_EVALUATION_HR_INFO",
            payload: {
              recipients: hrRecipients,
              requestId: request.id,
              employeeId: employee.id,
              employeeName,
              employeePosition: employee.positionName,
              employeeDepartment: employee.department,
              employeeUnitName: employee.unitName,
              probationEndDate: employee.probationEnd?.toISOString() ?? null,
              supervisorName,
              supervisorEmail,
              evaluationLink,
              formType: request.formType,
              subject: `Zahájeno vyhodnocení zkušební doby – ${employeeName}`,
            },
            status: "QUEUED",
            priority: 2,
            createdBy: "system-cron",
          },
        })

        await prisma.$transaction(async (tx) => {
          await tx.probationEvaluationRequest.update({
            where: { id: request.id },
            data: {
              hrInfoSentAt: now,
              hrInfoSentBy: "system-cron",
            },
          })

          await addProbationEvent(tx, {
            requestId: request.id,
            action: "HR_INFO_QUEUED",
            by: "system-cron",
            byName: "Systémový cron",
            mailQueueId: hrInfoJob.id,
            message:
              "HR informace o zahájení vyhodnocení zkušební doby byla zařazena do fronty.",
          })
        })

        notifications.push(`hr_info_queued:${employee.id}`)
      }
    }
  }

  const sentRequests = await prisma.probationEvaluationRequest.findMany({
    where: {
      status: "SENT",
      completedAt: null,
      isLocked: false,
      supervisorEmail: {
        not: null,
      },
      onboarding: {
        deletedAt: null,
        actualStart: { not: null },
      },
    },
    include: {
      onboarding: {
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
        },
      },
    },
    take: 500,
  })

  for (const request of sentRequests) {
    if (!request.supervisorEmail) continue

    const lastReminderAt = request.lastReminderAt ?? request.sentAt
    const shouldRemind =
      !lastReminderAt ||
      differenceInCalendarDays(today, startOfDay(lastReminderAt)) >= 7

    if (!shouldRemind) continue

    const employeeName = buildFullName(request.onboarding)
    const evaluationLink = `${baseUrl}/vyhodnoceni-zkusebni-doby/${request.token}`

    const alreadyPendingReminderJob = await existsPendingProbationJob({
      type: "PROBATION_EVALUATION_REMINDER",
      requestId: request.id,
      employeeId: request.onboarding.id,
    })

    if (alreadyPendingReminderJob) {
      notifications.push(`reminder_already_pending:${request.onboarding.id}`)
      continue
    }

    const reminderJob = await prisma.mailQueue.create({
      data: {
        type: "PROBATION_EVALUATION_REMINDER",
        payload: {
          recipients: [request.supervisorEmail],
          requestId: request.id,
          employeeId: request.onboarding.id,
          employeeName,
          employeePosition: request.onboarding.positionName,
          employeeDepartment: request.onboarding.department,
          employeeUnitName: request.onboarding.unitName,
          probationEndDate:
            request.onboarding.probationEnd?.toISOString() ?? null,
          supervisorName: request.supervisorName,
          supervisorEmail: request.supervisorEmail,
          evaluationLink,
          formType: request.formType,
          subject: `Připomínka: vyhodnocení zkušební doby – ${employeeName}`,
        },
        status: "QUEUED",
        priority: 1,
        createdBy: "system-cron",
      },
    })

    await prisma.$transaction(async (tx) => {
      await tx.probationEvaluationRequest.update({
        where: { id: request.id },
        data: {
          lastReminderAt: now,
          lastReminderBy: "system-cron",
          lastReminderByName: "Systémový cron",
          reminderCount: {
            increment: 1,
          },
        },
      })

      await addProbationEvent(tx, {
        requestId: request.id,
        action: "REMINDER_QUEUED",
        by: "system-cron",
        byName: "Systémový cron",
        mailQueueId: reminderJob.id,
        message:
          "Připomínka vedoucímu k vyplnění vyhodnocení byla zařazena do fronty.",
      })
    })

    notifications.push(`reminder_queued:${request.onboarding.id}`)
  }

  const requestsAt3Days = await prisma.probationEvaluationRequest.findMany({
    where: {
      status: {
        in: ["READY", "SENT"],
      },
      completedAt: null,
      hrReminderBeforeEndSentAt: null,
      onboarding: {
        deletedAt: null,
        actualStart: { not: null },
        status: "COMPLETED",
        probationEnd: {
          gte: in3Days,
          lt: addDays(in3Days, 1),
        },
      },
    },
    include: {
      onboarding: {
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
        },
      },
    },
  })

  for (const request of requestsAt3Days) {
    if (hrRecipients.length === 0) continue

    const employeeName = buildFullName(request.onboarding)
    const evaluationLink = `${baseUrl}/vyhodnoceni-zkusebni-doby/${request.token}`

    const alreadyHrNotCompletedJob = await existsActiveProbationJob({
      type: "PROBATION_EVALUATION_HR_NOT_COMPLETED",
      requestId: request.id,
      employeeId: request.onboarding.id,
    })

    if (alreadyHrNotCompletedJob) {
      notifications.push(
        `hr_not_completed_already_active:${request.onboarding.id}`
      )
      continue
    }

    const hrReminderJob = await prisma.mailQueue.create({
      data: {
        type: "PROBATION_EVALUATION_HR_NOT_COMPLETED",
        payload: {
          recipients: hrRecipients,
          requestId: request.id,
          employeeId: request.onboarding.id,
          employeeName,
          employeePosition: request.onboarding.positionName,
          employeeDepartment: request.onboarding.department,
          employeeUnitName: request.onboarding.unitName,
          probationEndDate:
            request.onboarding.probationEnd?.toISOString() ?? null,
          supervisorName: request.supervisorName,
          supervisorEmail: request.supervisorEmail,
          evaluationLink,
          formType: request.formType,
          subject: `Chybí vyhodnocení zkušební doby – ${employeeName}`,
        },
        status: "QUEUED",
        priority: 1,
        createdBy: "system-cron",
      },
    })

    await prisma.$transaction(async (tx) => {
      await tx.probationEvaluationRequest.update({
        where: { id: request.id },
        data: {
          hrReminderBeforeEndSentAt: now,
          hrReminderBeforeEndSentBy: "system-cron",
        },
      })

      await addProbationEvent(tx, {
        requestId: request.id,
        action: "HR_REMINDER_QUEUED",
        by: "system-cron",
        byName: "Systémový cron",
        mailQueueId: hrReminderJob.id,
        message:
          "HR připomínka, že vyhodnocení zkušební doby není vyplněné, byla zařazena do fronty.",
      })
    })

    notifications.push(`hr_not_completed_queued:${request.onboarding.id}`)
  }

  return {
    notifications,
    stats: {
      at21Days: employeesAt21Days.length,
      weeklyRemindersChecked: sentRequests.length,
      at3Days: requestsAt3Days.length,
    },
  }
}
