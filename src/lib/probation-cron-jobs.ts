import { NextRequest } from "next/server"
import type { MailJobStatus, MailJobType } from "@prisma/client"
import { addDays, startOfDay } from "date-fns"

import { prisma } from "@/lib/db"
import {
  addProbationEvent,
  buildFullName,
  ensureProbationEvaluationRequest,
  getAppBaseUrlFromRequest,
  getHrRecipientsFromEnv,
  getSupervisorFullName,
} from "@/lib/probation-evaluation-request"

type DeadlineReminderKind = "3_DAYS_BEFORE_END" | "END_DAY"
type DeadlineReminderAudience = "SUPERVISOR" | "HR"

const ACTIVE_MAIL_STATUSES: MailJobStatus[] = ["QUEUED", "PROCESSING", "SENT"]

function getPayloadRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null

  const trimmed = value.trim()

  return trimmed.length ? trimmed : null
}

function deadlineReminderKind(daysBeforeEnd: 3 | 0): DeadlineReminderKind {
  return daysBeforeEnd === 3 ? "3_DAYS_BEFORE_END" : "END_DAY"
}

function deadlineReminderLabel(daysBeforeEnd: 3 | 0) {
  return daysBeforeEnd === 3
    ? "3 dny před koncem zkušební doby"
    : "v den konce zkušební doby"
}

function supervisorReminderSubject(args: {
  employeeName: string
  daysBeforeEnd: 3 | 0
}) {
  if (args.daysBeforeEnd === 3) {
    return `Připomínka: zkušební doba končí za 3 dny – ${args.employeeName}`
  }

  return `Dnes končí zkušební doba – chybí vyhodnocení – ${args.employeeName}`
}

function hrReminderSubject(args: {
  employeeName: string
  daysBeforeEnd: 3 | 0
}) {
  if (args.daysBeforeEnd === 3) {
    return `Chybí vyhodnocení zkušební doby, konec za 3 dny – ${args.employeeName}`
  }

  return `Dnes končí zkušební doba a vyhodnocení není dokončené – ${args.employeeName}`
}

function supervisorReminderIntro(daysBeforeEnd: 3 | 0) {
  if (daysBeforeEnd === 3) {
    return "Do konce zkušební doby zbývají 3 dny a vyhodnocení zatím není finálně dokončené. Prosíme o vyplnění a podepsání formuláře."
  }

  return "Dnes končí zkušební doba a vyhodnocení zatím není finálně dokončené. Prosíme o neprodlené vyplnění a podepsání formuláře."
}

function hrReminderIntro(daysBeforeEnd: 3 | 0) {
  if (daysBeforeEnd === 3) {
    return "Do konce zkušební doby zbývají 3 dny a vyhodnocení zatím není finálně podepsané/dokončené vedoucím."
  }

  return "Dnes končí zkušební doba a vyhodnocení zatím není finálně podepsané/dokončené vedoucím."
}

function isSameEmployeePayload(args: {
  payload: Record<string, unknown>
  requestId: number
  employeeId: number
}) {
  const payloadRequestId = asNumber(args.payload.requestId)

  if (payloadRequestId === args.requestId) return true

  const payloadEmployeeIds = [
    args.payload.employeeId,
    args.payload.onboardingId,
    args.payload.onboardingEmployeeId,
  ]
    .map(asNumber)
    .filter((value): value is number => typeof value === "number")

  return payloadEmployeeIds.includes(args.employeeId)
}

async function existsProbationJobWithReminderMeta(args: {
  type: MailJobType
  requestId: number
  employeeId: number
  reminderKind: DeadlineReminderKind | "21_DAYS_BEFORE_END"
  reminderAudience: DeadlineReminderAudience | "HR_INFO" | "INVITE"
}) {
  const jobs = await prisma.mailQueue.findMany({
    where: {
      type: args.type,
      status: {
        in: ACTIVE_MAIL_STATUSES,
      },
    },
    select: {
      payload: true,
    },
    take: 1000,
  })

  return jobs.some((job) => {
    const payload = getPayloadRecord(job.payload)

    if (
      asString(payload.reminderKind) !== args.reminderKind ||
      asString(payload.reminderAudience) !== args.reminderAudience
    ) {
      return false
    }

    return isSameEmployeePayload({
      payload,
      requestId: args.requestId,
      employeeId: args.employeeId,
    })
  })
}

async function queueMissingSupervisorForHr(args: {
  requestId: number
  employeeId: number
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employeeUnitName?: string | null
  probationEndDate?: Date | null
  formType: string
  hrRecipients: string[]
  now: Date
  notifications: string[]
}) {
  if (args.hrRecipients.length === 0) {
    args.notifications.push(
      `missing_supervisor_skipped_no_hr:${args.employeeId}`
    )
    return
  }

  const alreadyMissingSupervisorJob = await prisma.mailQueue.findMany({
    where: {
      type: "PROBATION_EVALUATION_HR_MISSING_SUPERVISOR",
      status: {
        in: ACTIVE_MAIL_STATUSES,
      },
    },
    select: {
      payload: true,
    },
    take: 1000,
  })

  const alreadyExists = alreadyMissingSupervisorJob.some((job) => {
    const payload = getPayloadRecord(job.payload)

    return isSameEmployeePayload({
      payload,
      requestId: args.requestId,
      employeeId: args.employeeId,
    })
  })

  const request = await prisma.probationEvaluationRequest.findUnique({
    where: { id: args.requestId },
    select: {
      missingSupervisorNotifiedAt: true,
    },
  })

  if (alreadyExists || request?.missingSupervisorNotifiedAt) {
    args.notifications.push(`missing_supervisor_skipped:${args.employeeId}`)
    return
  }

  const mailJob = await prisma.mailQueue.create({
    data: {
      type: "PROBATION_EVALUATION_HR_MISSING_SUPERVISOR",
      payload: {
        recipients: args.hrRecipients,
        requestId: args.requestId,
        employeeId: args.employeeId,
        employeeName: args.employeeName,
        employeePosition: args.employeePosition,
        employeeDepartment: args.employeeDepartment,
        employeeUnitName: args.employeeUnitName,
        probationEndDate: args.probationEndDate?.toISOString() ?? null,
        formType: args.formType,
        subject: `Chybí vedoucí pro vyhodnocení zkušební doby – ${args.employeeName}`,
        createdBy: "system-cron",
        createdByName: "Systémový cron",
      },
      status: "QUEUED",
      priority: 1,
      createdBy: "system-cron",
    },
  })

  await prisma.$transaction(async (tx) => {
    await tx.probationEvaluationRequest.update({
      where: { id: args.requestId },
      data: {
        missingSupervisorNotifiedAt: args.now,
        missingSupervisorNotifiedBy: "system-cron",
      },
    })

    await addProbationEvent(tx, {
      requestId: args.requestId,
      action: "MISSING_SUPERVISOR",
      by: "system-cron",
      byName: "Systémový cron",
      mailQueueId: mailJob.id,
      message:
        "Nelze odeslat vyhodnocení zkušební doby, protože chybí vedoucí nebo e-mail vedoucího.",
    })
  })

  args.notifications.push(`missing_supervisor_queued:${args.employeeId}`)
}

async function queueDeadlineReminders(args: {
  daysBeforeEnd: 3 | 0
  targetDay: Date
  now: Date
  baseUrl: string
  hrRecipients: string[]
  notifications: string[]
}) {
  const reminderKind = deadlineReminderKind(args.daysBeforeEnd)
  const label = deadlineReminderLabel(args.daysBeforeEnd)

  const employees = await prisma.employeeOnboarding.findMany({
    where: {
      deletedAt: null,
      actualStart: { not: null },
      status: "COMPLETED",
      probationEnd: {
        gte: args.targetDay,
        lt: addDays(args.targetDay, 1),
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

  for (const employee of employees) {
    const employeeName = buildFullName(employee)

    const ensured = await prisma.$transaction(async (tx) => {
      return ensureProbationEvaluationRequest(tx, {
        onboardingId: employee.id,
        createdBy: "system-cron",
        createdByName: "Systémový cron",
      })
    })

    const request = ensured.request

    if (request.completedAt || request.status === "COMPLETED") {
      args.notifications.push(
        `${reminderKind.toLowerCase()}_skipped_completed:${employee.id}`
      )
      continue
    }

    if (request.isLocked) {
      args.notifications.push(
        `${reminderKind.toLowerCase()}_skipped_locked:${employee.id}`
      )
      continue
    }

    const supervisorName =
      request.supervisorName || getSupervisorFullName(employee) || null

    const supervisorEmail =
      request.supervisorEmail?.trim() || employee.supervisorEmail?.trim() || ""

    const evaluationLink = `${args.baseUrl}/vyhodnoceni-zkusebni-doby/${request.token}`

    if (supervisorEmail) {
      const alreadySupervisorReminder =
        await existsProbationJobWithReminderMeta({
          type: "PROBATION_EVALUATION_REMINDER",
          requestId: request.id,
          employeeId: employee.id,
          reminderKind,
          reminderAudience: "SUPERVISOR",
        })

      if (alreadySupervisorReminder) {
        args.notifications.push(
          `${reminderKind.toLowerCase()}_supervisor_already_active:${employee.id}`
        )
      } else {
        const supervisorReminderJob = await prisma.mailQueue.create({
          data: {
            type: "PROBATION_EVALUATION_REMINDER",
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
              subject: supervisorReminderSubject({
                employeeName,
                daysBeforeEnd: args.daysBeforeEnd,
              }),
              intro: supervisorReminderIntro(args.daysBeforeEnd),
              message: supervisorReminderIntro(args.daysBeforeEnd),
              reminderKind,
              reminderAudience: "SUPERVISOR",
              daysBeforeProbationEnd: args.daysBeforeEnd,
              createdBy: "system-cron",
              createdByName: "Systémový cron",
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
              status: request.status === "DRAFT" ? "SENT" : request.status,
              sentAt: request.sentAt ?? args.now,
              sentBy: request.sentBy ?? "system-cron",
              sentByName: request.sentByName ?? "Systémový cron",
              sentMethod: request.sentMethod ?? "CRON",
              supervisorName,
              supervisorEmail,
              lastReminderAt: args.now,
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
            mailQueueId: supervisorReminderJob.id,
            message: `Připomínka vedoucímu ${label} byla zařazena do fronty.`,
            meta: {
              reminderKind,
              reminderAudience: "SUPERVISOR",
              daysBeforeProbationEnd: args.daysBeforeEnd,
              supervisorName,
              supervisorEmail,
              evaluationLink,
            },
          })
        })

        args.notifications.push(
          `${reminderKind.toLowerCase()}_supervisor_queued:${employee.id}`
        )
      }
    } else {
      args.notifications.push(
        `${reminderKind.toLowerCase()}_supervisor_skipped_no_email:${employee.id}`
      )
    }

    if (args.hrRecipients.length === 0) {
      args.notifications.push(
        `${reminderKind.toLowerCase()}_hr_skipped_no_hr:${employee.id}`
      )
      continue
    }

    const alreadyHrReminder = await existsProbationJobWithReminderMeta({
      type: "PROBATION_EVALUATION_HR_NOT_COMPLETED",
      requestId: request.id,
      employeeId: employee.id,
      reminderKind,
      reminderAudience: "HR",
    })

    if (alreadyHrReminder) {
      args.notifications.push(
        `${reminderKind.toLowerCase()}_hr_already_active:${employee.id}`
      )
      continue
    }

    const hrReminderJob = await prisma.mailQueue.create({
      data: {
        type: "PROBATION_EVALUATION_HR_NOT_COMPLETED",
        payload: {
          recipients: args.hrRecipients,
          requestId: request.id,
          employeeId: employee.id,
          employeeName,
          employeePosition: employee.positionName,
          employeeDepartment: employee.department,
          employeeUnitName: employee.unitName,
          probationEndDate: employee.probationEnd?.toISOString() ?? null,
          supervisorName,
          supervisorEmail: supervisorEmail || null,
          evaluationLink,
          formType: request.formType,
          subject: hrReminderSubject({
            employeeName,
            daysBeforeEnd: args.daysBeforeEnd,
          }),
          intro: hrReminderIntro(args.daysBeforeEnd),
          message: hrReminderIntro(args.daysBeforeEnd),
          reminderKind,
          reminderAudience: "HR",
          daysBeforeProbationEnd: args.daysBeforeEnd,
          createdBy: "system-cron",
          createdByName: "Systémový cron",
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
          hrReminderBeforeEndSentAt: args.now,
          hrReminderBeforeEndSentBy: "system-cron",
          supervisorName,
          supervisorEmail: supervisorEmail || null,
        },
      })

      await addProbationEvent(tx, {
        requestId: request.id,
        action: "HR_REMINDER_QUEUED",
        by: "system-cron",
        byName: "Systémový cron",
        mailQueueId: hrReminderJob.id,
        message: `HR připomínka ${label}, že vyhodnocení zkušební doby není finálně podepsané/dokončené, byla zařazena do fronty.`,
        meta: {
          reminderKind,
          reminderAudience: "HR",
          daysBeforeProbationEnd: args.daysBeforeEnd,
          supervisorName,
          supervisorEmail: supervisorEmail || null,
          evaluationLink,
        },
      })
    })

    args.notifications.push(
      `${reminderKind.toLowerCase()}_hr_queued:${employee.id}`
    )
  }

  return employees.length
}

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

    if (request.completedAt || request.status === "COMPLETED") {
      notifications.push(`21_days_before_end_skipped_completed:${employee.id}`)
      continue
    }

    if (request.isLocked) {
      notifications.push(`21_days_before_end_skipped_locked:${employee.id}`)
      continue
    }

    const supervisorName =
      request.supervisorName || getSupervisorFullName(employee) || null

    const supervisorEmail =
      request.supervisorEmail?.trim() || employee.supervisorEmail?.trim() || ""

    if (!supervisorEmail) {
      await queueMissingSupervisorForHr({
        requestId: request.id,
        employeeId: employee.id,
        employeeName,
        employeePosition: employee.positionName,
        employeeDepartment: employee.department,
        employeeUnitName: employee.unitName,
        probationEndDate: employee.probationEnd,
        formType: request.formType,
        hrRecipients,
        now,
        notifications,
      })

      continue
    }

    const evaluationLink = `${baseUrl}/vyhodnoceni-zkusebni-doby/${request.token}`

    const alreadyInviteJob = await existsProbationJobWithReminderMeta({
      type: "PROBATION_EVALUATION_INVITE",
      requestId: request.id,
      employeeId: employee.id,
      reminderKind: "21_DAYS_BEFORE_END",
      reminderAudience: "INVITE",
    })

    const wasAlreadySentToSupervisor = Boolean(
      request.sentAt || request.status === "SENT"
    )

    if (!alreadyInviteJob && !wasAlreadySentToSupervisor) {
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
            intro:
              "Do konce zkušební doby zbývá 21 dní. Prosíme o vyplnění a podepsání formuláře vyhodnocení zkušební doby.",
            message:
              "Do konce zkušební doby zbývá 21 dní. Prosíme o vyplnění a podepsání formuláře vyhodnocení zkušební doby.",
            reminderKind: "21_DAYS_BEFORE_END",
            reminderAudience: "INVITE",
            daysBeforeProbationEnd: 21,
            createdBy: "system-cron",
            createdByName: "Systémový cron",
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
          message: `Pozvánka k vyhodnocení zkušební doby 21 dní před koncem byla zařazena do fronty pro ${supervisorEmail}.`,
          meta: {
            reminderKind: "21_DAYS_BEFORE_END",
            reminderAudience: "INVITE",
            daysBeforeProbationEnd: 21,
            supervisorName,
            supervisorEmail,
            evaluationLink,
          },
        })
      })

      notifications.push(`21_days_before_end_invite_queued:${employee.id}`)
    } else {
      notifications.push(`21_days_before_end_invite_skipped:${employee.id}`)
    }

    if (hrRecipients.length > 0) {
      const alreadyHrInfoJob = await existsProbationJobWithReminderMeta({
        type: "PROBATION_EVALUATION_HR_INFO",
        requestId: request.id,
        employeeId: employee.id,
        reminderKind: "21_DAYS_BEFORE_END",
        reminderAudience: "HR_INFO",
      })

      if (!alreadyHrInfoJob && !request.hrInfoSentAt) {
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
              intro:
                "Do konce zkušební doby zbývá 21 dní. Vedoucímu byla připravena pozvánka k vyplnění vyhodnocení.",
              message:
                "Do konce zkušební doby zbývá 21 dní. Vedoucímu byla připravena pozvánka k vyplnění vyhodnocení.",
              reminderKind: "21_DAYS_BEFORE_END",
              reminderAudience: "HR_INFO",
              daysBeforeProbationEnd: 21,
              createdBy: "system-cron",
              createdByName: "Systémový cron",
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
              "HR informace o zahájení vyhodnocení zkušební doby 21 dní před koncem byla zařazena do fronty.",
            meta: {
              reminderKind: "21_DAYS_BEFORE_END",
              reminderAudience: "HR_INFO",
              daysBeforeProbationEnd: 21,
              supervisorName,
              supervisorEmail,
              evaluationLink,
            },
          })
        })

        notifications.push(`21_days_before_end_hr_info_queued:${employee.id}`)
      } else {
        notifications.push(`21_days_before_end_hr_info_skipped:${employee.id}`)
      }
    } else {
      notifications.push(
        `21_days_before_end_hr_info_skipped_no_hr:${employee.id}`
      )
    }
  }

  const at3Days = await queueDeadlineReminders({
    daysBeforeEnd: 3,
    targetDay: in3Days,
    now,
    baseUrl,
    hrRecipients,
    notifications,
  })

  const atEndDay = await queueDeadlineReminders({
    daysBeforeEnd: 0,
    targetDay: today,
    now,
    baseUrl,
    hrRecipients,
    notifications,
  })

  const queued = notifications.filter((item) => item.includes("_queued")).length

  return {
    status: "success" as const,
    notifications,
    processed: employeesAt21Days.length + at3Days + atEndDay,
    queued,
    failed: 0,
    stats: {
      at21Days: employeesAt21Days.length,
      at3Days,
      atEndDay,
      queued,
    },
  }
}
