import { NextRequest } from "next/server"
import type { MailJobStatus } from "@prisma/client"
import { addDays, startOfDay } from "date-fns"

import type { ExitChecklistData } from "@/types/exit-checklist"

import { prisma } from "@/lib/db"
import {
  getOrCreateChecklist,
  mapToExitChecklistData,
} from "@/lib/exit-checklist"
import { getExitChecklistCompletionState } from "@/lib/exit-checklist-completion"
import { logExitChecklistEvent } from "@/lib/exit-checklist-events"
import {
  buildFullName,
  getAppBaseUrlFromRequest,
  getHrRecipientsFromEnv,
} from "@/lib/probation-evaluation-request"

type ReminderDay = 30 | 14 | 7 | 3

type DeadlineReminderKind =
  | "30_DAYS_BEFORE_END"
  | "14_DAYS_BEFORE_END"
  | "7_DAYS_BEFORE_END"
  | "3_DAYS_BEFORE_END"

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

function deadlineReminderKind(
  daysBeforeEnd: ReminderDay
): DeadlineReminderKind {
  switch (daysBeforeEnd) {
    case 30:
      return "30_DAYS_BEFORE_END"
    case 14:
      return "14_DAYS_BEFORE_END"
    case 7:
      return "7_DAYS_BEFORE_END"
    case 3:
      return "3_DAYS_BEFORE_END"
  }
}

function reminderSubject(args: {
  employeeName: string
  daysBeforeEnd: ReminderDay
}) {
  switch (args.daysBeforeEnd) {
    case 30:
      return `Blíží se konec pracovního poměru (za měsíc) – ${args.employeeName}`
    case 14:
      return `Blíží se konec pracovního poměru (za 14 dní) – ${args.employeeName}`
    case 7:
      return `Blíží se konec pracovního poměru (za 7 dní) – ${args.employeeName}`
    case 3:
      return `Blíží se konec pracovního poměru (za 3 dny) – ${args.employeeName}`
  }
}

function reminderIntro(daysBeforeEnd: ReminderDay) {
  switch (daysBeforeEnd) {
    case 30:
      return "Do konce pracovního poměru zbývá zhruba měsíc a výstupní list zatím není kompletně podepsaný. Prosíme o zajištění podpisu."
    case 14:
      return "Do konce pracovního poměru zbývá 14 dní a výstupní list zatím není kompletně podepsaný. Prosíme o zajištění podpisu."
    case 7:
      return "Do konce pracovního poměru zbývá 7 dní a výstupní list zatím není kompletně podepsaný. Prosíme o zajištění podpisu."
    case 3:
      return "Do konce pracovního poměru zbývají 3 dny a výstupní list zatím není kompletně podepsaný. Prosíme o zajištění podpisu co nejdříve."
  }
}

function isSameOffboardingPayload(args: {
  payload: Record<string, unknown>
  offboardingId: number
}) {
  return asNumber(args.payload.offboardingId) === args.offboardingId
}

async function existsOffboardingReminderJob(args: {
  offboardingId: number
  reminderKind: DeadlineReminderKind
}) {
  const jobs = await prisma.mailQueue.findMany({
    where: {
      type: "NOTICE_WARNING",
      status: { in: ACTIVE_MAIL_STATUSES },
    },
    select: { payload: true },
    take: 1000,
  })

  return jobs.some((job) => {
    const payload = getPayloadRecord(job.payload)

    if (asString(payload.reminderKind) !== args.reminderKind) return false

    return isSameOffboardingPayload({
      payload,
      offboardingId: args.offboardingId,
    })
  })
}

async function queueExitChecklistReminders(args: {
  daysBeforeEnd: ReminderDay
  effectiveEndFilter: { lte: Date; gt?: Date; gte?: Date }
  now: Date
  baseUrl: string
  hrRecipients: string[]
  notifications: string[]
}) {
  const reminderKind = deadlineReminderKind(args.daysBeforeEnd)

  if (args.hrRecipients.length === 0) {
    args.notifications.push(`${reminderKind.toLowerCase()}_skipped_no_hr`)
    return 0
  }

  const candidates = await prisma.employeeOffboarding.findMany({
    where: {
      deletedAt: null,
      actualEnd: args.effectiveEndFilter,
    },
    select: { id: true },
  })

  let queued = 0

  for (const candidate of candidates) {
    const result = await getOrCreateChecklist(candidate.id)

    if (!result) {
      args.notifications.push(
        `${reminderKind.toLowerCase()}_skipped_not_found:${candidate.id}`
      )
      continue
    }

    const { off, checklist } = result
    const data: ExitChecklistData = mapToExitChecklistData(off, checklist)

    if (getExitChecklistCompletionState(data).isComplete) {
      args.notifications.push(
        `${reminderKind.toLowerCase()}_skipped_complete:${candidate.id}`
      )
      continue
    }

    const alreadyQueued = await existsOffboardingReminderJob({
      offboardingId: off.id,
      reminderKind,
    })

    if (alreadyQueued) {
      args.notifications.push(
        `${reminderKind.toLowerCase()}_already_active:${candidate.id}`
      )
      continue
    }

    const employeeName = buildFullName(off)
    const effectiveEnd = off.actualEnd ?? off.plannedEnd
    const checklistLink = `${args.baseUrl}/odchody/${off.id}/vystupni-list`

    const job = await prisma.mailQueue.create({
      data: {
        type: "NOTICE_WARNING",
        payload: {
          recipients: args.hrRecipients,
          offboardingId: off.id,
          employeeName,
          employeePersonalNumber: off.personalNumber,
          employeePosition: off.positionName,
          employeeDepartment: off.department,
          employeeUnitName: off.unitName,
          employmentEndDate: effectiveEnd?.toISOString() ?? null,
          checklistLink,
          subject: reminderSubject({
            employeeName,
            daysBeforeEnd: args.daysBeforeEnd,
          }),
          intro: reminderIntro(args.daysBeforeEnd),
          reminderKind,
          daysBeforeEnd: args.daysBeforeEnd,
          createdBy: "system-cron",
          createdByName: "Systémový cron",
        },
        status: "QUEUED",
        priority: 2,
        createdBy: "system-cron",
      },
    })

    await prisma.employeeOffboarding.update({
      where: { id: off.id },
      data: {
        lastNoticeReminder: args.now,
        noticeRemindersSent: { increment: 1 },
      },
    })

    await logExitChecklistEvent({
      checklistId: checklist.id,
      action: "DEADLINE_REMINDER_SENT",
      by: "system-cron",
      byName: "Systémový cron",
      message: reminderSubject({
        employeeName,
        daysBeforeEnd: args.daysBeforeEnd,
      }),
      meta: {
        reminderKind,
        daysBeforeEnd: args.daysBeforeEnd,
        mailQueueId: job.id,
        recipients: args.hrRecipients,
      },
    })

    queued += 1
    args.notifications.push(
      `${reminderKind.toLowerCase()}_queued:${off.id}:${job.id}`
    )
  }

  return queued
}

export async function ensureOffboardingCronJobs(req: NextRequest) {
  const now = new Date()
  const today = startOfDay(now)
  const baseUrl = getAppBaseUrlFromRequest(req)
  const hrRecipients = getHrRecipientsFromEnv()

  const notifications: string[] = []

  const in30Days = addDays(today, 30)
  const in14Days = addDays(today, 14)
  const in7Days = addDays(today, 7)
  const in3Days = addDays(today, 3)

  const at30Days = await queueExitChecklistReminders({
    daysBeforeEnd: 30,
    effectiveEndFilter: { lte: in30Days, gt: in14Days },
    now,
    baseUrl,
    hrRecipients,
    notifications,
  })

  const at14Days = await queueExitChecklistReminders({
    daysBeforeEnd: 14,
    effectiveEndFilter: { lte: in14Days, gt: in7Days },
    now,
    baseUrl,
    hrRecipients,
    notifications,
  })

  const at7Days = await queueExitChecklistReminders({
    daysBeforeEnd: 7,
    effectiveEndFilter: { lte: in7Days, gt: in3Days },
    now,
    baseUrl,
    hrRecipients,
    notifications,
  })

  const at3Days = await queueExitChecklistReminders({
    daysBeforeEnd: 3,
    effectiveEndFilter: { lte: in3Days, gte: today },
    now,
    baseUrl,
    hrRecipients,
    notifications,
  })

  const queued = notifications.filter((item) => item.includes("_queued")).length

  return {
    status: "success" as const,
    notifications,
    processed: at30Days + at14Days + at7Days + at3Days,
    queued,
    failed: 0,
    stats: {
      at30Days,
      at14Days,
      at7Days,
      at3Days,
      queued,
    },
  }
}
