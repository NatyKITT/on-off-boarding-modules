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

type ReminderDay = 7 | 3 | 2 | 1

type DeadlineReminderKind =
  | "7_DAYS_BEFORE_END"
  | "3_DAYS_BEFORE_END"
  | "2_DAYS_BEFORE_END"
  | "1_DAY_BEFORE_END"

type DeadlineReminderAudience = "SUPERVISOR" | "HR"

const ACTIVE_MAIL_STATUSES: MailJobStatus[] = ["QUEUED", "PROCESSING", "SENT"]

const INVITE_DAYS_BEFORE_END = 14
const INVITE_REMINDER_KIND = "14_DAYS_BEFORE_END"

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

function deadlineReminderKind(
  daysBeforeEnd: ReminderDay
): DeadlineReminderKind {
  switch (daysBeforeEnd) {
    case 7:
      return "7_DAYS_BEFORE_END"
    case 3:
      return "3_DAYS_BEFORE_END"
    case 2:
      return "2_DAYS_BEFORE_END"
    case 1:
      return "1_DAY_BEFORE_END"
  }
}

function deadlineReminderLabel(daysBeforeEnd: ReminderDay) {
  switch (daysBeforeEnd) {
    case 7:
      return "7 dní před koncem zkušební doby"
    case 3:
      return "3 dny před koncem zkušební doby"
    case 2:
      return "2 dny před koncem zkušební doby"
    case 1:
      return "poslední den na vyplnění (1 den před koncem zkušební doby)"
  }
}

function supervisorReminderSubject(args: {
  employeeName: string
  daysBeforeEnd: ReminderDay
}) {
  switch (args.daysBeforeEnd) {
    case 7:
      return `Připomínka: zkušební doba končí za 7 dní – ${args.employeeName}`
    case 3:
      return `Připomínka: zkušební doba končí za 3 dny – ${args.employeeName}`
    case 2:
      return `Připomínka: zkušební doba končí za 2 dny – ${args.employeeName}`
    case 1:
      return `Poslední den na vyplnění – zkušební doba končí zítra – ${args.employeeName}`
  }
}

function hrReminderSubject(args: {
  employeeName: string
  daysBeforeEnd: ReminderDay
}) {
  switch (args.daysBeforeEnd) {
    case 7:
      return `Chybí vyhodnocení zkušební doby, konec za 7 dní – ${args.employeeName}`
    case 3:
      return `Chybí vyhodnocení zkušební doby, konec za 3 dny – ${args.employeeName}`
    case 2:
      return `Chybí vyhodnocení zkušební doby, konec za 2 dny – ${args.employeeName}`
    case 1:
      return `Poslední den na vyplnění vyhodnocení zkušební doby – ${args.employeeName}`
  }
}

function supervisorReminderIntro(daysBeforeEnd: ReminderDay) {
  switch (daysBeforeEnd) {
    case 7:
      return "Do konce zkušební doby zbývá 7 dní a vyhodnocení zatím není finálně dokončené. Prosíme o vyplnění a podepsání formuláře."
    case 3:
      return "Do konce zkušební doby zbývají 3 dny a vyhodnocení zatím není finálně dokončené. Prosíme o vyplnění a podepsání formuláře."
    case 2:
      return "Do konce zkušební doby zbývají 2 dny a vyhodnocení zatím není finálně dokončené. Prosíme o vyplnění a podepsání formuláře."
    case 1:
      return "Zkušební doba končí zítra a vyhodnocení zatím není finálně dokončené. Dnes je poslední den na vyplnění a podepsání formuláře."
  }
}

function hrReminderIntro(daysBeforeEnd: ReminderDay) {
  switch (daysBeforeEnd) {
    case 7:
      return "Do konce zkušební doby zbývá 7 dní a vyhodnocení zatím není finálně podepsané/dokončené vedoucím. Vedoucímu byla zaslána připomínka."
    case 3:
      return "Do konce zkušební doby zbývají 3 dny a vyhodnocení zatím není finálně podepsané/dokončené vedoucím. Vedoucímu byla zaslána připomínka."
    case 2:
      return "Do konce zkušební doby zbývají 2 dny a vyhodnocení zatím není finálně podepsané/dokončené vedoucím. Vedoucímu byla zaslána připomínka."
    case 1:
      return "Zkušební doba končí zítra a vyhodnocení zatím není finálně podepsané/dokončené vedoucím. Vedoucímu byla zaslána poslední připomínka."
  }
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
  reminderKind: DeadlineReminderKind | typeof INVITE_REMINDER_KIND
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
  employeePersonalNumber?: string | null
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
        employeePersonalNumber: args.employeePersonalNumber,
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
  daysBeforeEnd: ReminderDay
  probationEndFilter: { lte: Date; gt?: Date; gte?: Date }
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
      probationEnd: args.probationEndFilter,
    },
    select: {
      id: true,
      titleBefore: true,
      name: true,
      surname: true,
      titleAfter: true,
      personalNumber: true,
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

    if (request.status === "CANCELLED") {
      args.notifications.push(
        `${reminderKind.toLowerCase()}_skipped_probation_stopped:${employee.id}`
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
              employeePersonalNumber: employee.personalNumber,
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
          employeePersonalNumber: employee.personalNumber,
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

const UNLOCK_REMINDER_THRESHOLD_HOURS = 24

async function queueUnlockReminders(args: {
  now: Date
  hrRecipients: string[]
  notifications: string[]
}) {
  if (args.hrRecipients.length === 0) return 0

  const thresholdDate = new Date(
    args.now.getTime() - UNLOCK_REMINDER_THRESHOLD_HOURS * 60 * 60 * 1000
  )

  const unlockedRequests = await prisma.probationEvaluationRequest.findMany({
    where: {
      isLocked: false,
      completedAt: { not: null },
    },
    select: {
      id: true,
      formType: true,
      onboarding: {
        select: {
          id: true,
          titleBefore: true,
          name: true,
          surname: true,
          titleAfter: true,
          personalNumber: true,
          positionName: true,
          department: true,
          unitName: true,
          probationEnd: true,
        },
      },
    },
  })

  let queuedCount = 0

  for (const request of unlockedRequests) {
    const lastUnlockedEvent =
      await prisma.probationEvaluationRequestEvent.findFirst({
        where: { requestId: request.id, action: "UNLOCKED" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      })

    if (!lastUnlockedEvent) continue

    if (lastUnlockedEvent.createdAt > thresholdDate) {
      args.notifications.push(
        `unlock_reminder_skipped_too_recent:${request.id}`
      )
      continue
    }

    const alreadyReminded =
      await prisma.probationEvaluationRequestEvent.findFirst({
        where: {
          requestId: request.id,
          action: { in: ["UNLOCK_REMINDER_QUEUED", "UNLOCK_REMINDER_SENT"] },
          createdAt: { gt: lastUnlockedEvent.createdAt },
        },
        select: { id: true },
      })

    if (alreadyReminded) {
      args.notifications.push(
        `unlock_reminder_skipped_already_sent:${request.id}`
      )
      continue
    }

    const employeeName = buildFullName(request.onboarding)

    const job = await prisma.mailQueue.create({
      data: {
        type: "PROBATION_EVALUATION_UNLOCK_REMINDER",
        payload: {
          recipients: args.hrRecipients,
          requestId: request.id,
          employeeId: request.onboarding.id,
          employeeName,
          employeePersonalNumber: request.onboarding.personalNumber,
          employeePosition: request.onboarding.positionName,
          employeeDepartment: request.onboarding.department,
          employeeUnitName: request.onboarding.unitName,
          probationEndDate:
            request.onboarding.probationEnd?.toISOString() ?? null,
          formType: request.formType,
          subject: `Formulář vyhodnocení zkušební doby je stále odemčený – ${employeeName}`,
          intro: `Formulář vyhodnocení zkušební doby pro ${employeeName} byl odemčen k opravě a stále zůstává otevřený k úpravě. Prosíme, dokončete úpravy a formulář znovu uzamkněte.`,
          createdBy: "system-cron",
          createdByName: "Systémový cron",
        },
        status: "QUEUED",
        priority: 3,
        createdBy: "system-cron",
      },
    })

    await addProbationEvent(prisma, {
      requestId: request.id,
      action: "UNLOCK_REMINDER_QUEUED",
      by: "system-cron",
      byName: "Systémový cron",
      mailQueueId: job.id,
      message: `Připomínka, že formulář zůstává odemčený k úpravě, byla zařazena do fronty (odemčeno déle než ${UNLOCK_REMINDER_THRESHOLD_HOURS} h).`,
    })

    queuedCount += 1
    args.notifications.push(`unlock_reminder_queued:${request.id}`)
  }

  return queuedCount
}

export async function ensureProbationCronJobs(req: NextRequest) {
  const now = new Date()
  const today = startOfDay(now)
  const baseUrl = getAppBaseUrlFromRequest(req)
  const hrRecipients = getHrRecipientsFromEnv()

  const notifications: string[] = []

  const in14Days = addDays(today, INVITE_DAYS_BEFORE_END)
  const in7Days = addDays(today, 7)
  const in3Days = addDays(today, 3)
  const in2Days = addDays(today, 2)
  const in1Day = addDays(today, 1)

  // "lte" místo přesného dne - zachytí i zaměstnance, u kterých cron
  // neproběhl přesně 14 dní před koncem (výpadek, nové nasazení...).
  // Pozvánka se pošle, dokud ještě nebyla nikdy odeslána (viz sentAt níže).
  // "gte: today" - jakmile zkušební doba skutečně skončí, pozvánka se už
  // zpětně neposílá (a nehlásí se ani chybějící vedoucí). Od té chvíle si
  // to řeší HR mimo automatiku.
  const employeesAt14Days = await prisma.employeeOnboarding.findMany({
    where: {
      deletedAt: null,
      actualStart: { not: null },
      status: "COMPLETED",
      probationEnd: {
        lte: in14Days,
        gte: today,
      },
    },
    select: {
      id: true,
      titleBefore: true,
      name: true,
      surname: true,
      titleAfter: true,
      personalNumber: true,
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

  for (const employee of employeesAt14Days) {
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
      notifications.push(`14_days_before_end_skipped_completed:${employee.id}`)
      continue
    }

    if (request.status === "CANCELLED") {
      notifications.push(
        `14_days_before_end_skipped_probation_stopped:${employee.id}`
      )
      continue
    }

    if (request.isLocked) {
      notifications.push(`14_days_before_end_skipped_locked:${employee.id}`)
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
        employeePersonalNumber: employee.personalNumber,
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
      reminderKind: INVITE_REMINDER_KIND,
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
            employeePersonalNumber: employee.personalNumber,
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
              "Do konce zkušební doby zbývá 14 dní. Prosíme o vyplnění a podepsání formuláře vyhodnocení zkušební doby.",
            message:
              "Do konce zkušební doby zbývá 14 dní. Prosíme o vyplnění a podepsání formuláře vyhodnocení zkušební doby.",
            reminderKind: INVITE_REMINDER_KIND,
            reminderAudience: "INVITE",
            daysBeforeProbationEnd: INVITE_DAYS_BEFORE_END,
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
          message: `Pozvánka k vyhodnocení zkušební doby 14 dní před koncem byla zařazena do fronty pro ${supervisorEmail}.`,
          meta: {
            reminderKind: INVITE_REMINDER_KIND,
            reminderAudience: "INVITE",
            daysBeforeProbationEnd: INVITE_DAYS_BEFORE_END,
            supervisorName,
            supervisorEmail,
            evaluationLink,
          },
        })
      })

      notifications.push(`14_days_before_end_invite_queued:${employee.id}`)
    } else {
      notifications.push(`14_days_before_end_invite_skipped:${employee.id}`)
    }

    if (hrRecipients.length > 0) {
      const alreadyHrInfoJob = await existsProbationJobWithReminderMeta({
        type: "PROBATION_EVALUATION_HR_INFO",
        requestId: request.id,
        employeeId: employee.id,
        reminderKind: INVITE_REMINDER_KIND,
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
              employeePersonalNumber: employee.personalNumber,
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
                "Do konce zkušební doby zbývá 14 dní. Vedoucímu byla připravena pozvánka k vyplnění vyhodnocení.",
              message:
                "Do konce zkušební doby zbývá 14 dní. Vedoucímu byla připravena pozvánka k vyplnění vyhodnocení.",
              reminderKind: INVITE_REMINDER_KIND,
              reminderAudience: "HR_INFO",
              daysBeforeProbationEnd: INVITE_DAYS_BEFORE_END,
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
              "HR informace o zahájení vyhodnocení zkušební doby 14 dní před koncem byla zařazena do fronty.",
            meta: {
              reminderKind: INVITE_REMINDER_KIND,
              reminderAudience: "HR_INFO",
              daysBeforeProbationEnd: INVITE_DAYS_BEFORE_END,
              supervisorName,
              supervisorEmail,
              evaluationLink,
            },
          })
        })

        notifications.push(`14_days_before_end_hr_info_queued:${employee.id}`)
      } else {
        notifications.push(`14_days_before_end_hr_info_skipped:${employee.id}`)
      }
    } else {
      notifications.push(
        `14_days_before_end_hr_info_skipped_no_hr:${employee.id}`
      )
    }
  }

  // Připomínky 7 / 3 / 2 / 1 den před koncem - rozsahy se nepřekrývají, aby
  // se při dohánění zmeškaných dnů (výpadek cronu) neposlaly dvě připomínky
  // najednou. "1 den" je zároveň finální záchytný interval (lte today),
  // takže pokryje i dny, kdy zkušebka už skončila a nic se stále neposlalo.
  const at7Days = await queueDeadlineReminders({
    daysBeforeEnd: 7,
    probationEndFilter: { lte: in7Days, gt: in3Days },
    now,
    baseUrl,
    hrRecipients,
    notifications,
  })

  const at3Days = await queueDeadlineReminders({
    daysBeforeEnd: 3,
    probationEndFilter: { lte: in3Days, gt: in2Days },
    now,
    baseUrl,
    hrRecipients,
    notifications,
  })

  const at2Days = await queueDeadlineReminders({
    daysBeforeEnd: 2,
    probationEndFilter: { lte: in2Days, gt: in1Day },
    now,
    baseUrl,
    hrRecipients,
    notifications,
  })

  const at1Day = await queueDeadlineReminders({
    daysBeforeEnd: 1,
    // "gte: today" - poslední připomínka jde nejpozději v den konce
    // zkušební doby, ne zpětně po jejím uplynutí (to už řeší HR ručně).
    probationEndFilter: { lte: in1Day, gte: today },
    now,
    baseUrl,
    hrRecipients,
    notifications,
  })

  const unlockReminders = await queueUnlockReminders({
    now,
    hrRecipients,
    notifications,
  })

  const queued = notifications.filter((item) => item.includes("_queued")).length

  return {
    status: "success" as const,
    notifications,
    processed:
      employeesAt14Days.length +
      at7Days +
      at3Days +
      at2Days +
      at1Day +
      unlockReminders,
    queued,
    failed: 0,
    stats: {
      at14Days: employeesAt14Days.length,
      at7Days,
      at3Days,
      at2Days,
      at1Day,
      queued,
    },
  }
}
