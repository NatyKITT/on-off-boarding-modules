import { NextRequest } from "next/server"
import type { MailJobStatus } from "@prisma/client"
import { addDays, startOfDay } from "date-fns"

import type { ExitChecklistData } from "@/types/exit-checklist"
import {
  EXIT_CHECKLIST_SIGNATORIES,
  LAW_SIGNATORY,
} from "@/config/exit-checklist-signatories"

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

type ReminderDay = 30 | 14 | 7 | 3 | 2 | 1
type SignatureReminderDay = 14 | 7 | 3 | 2 | 1

type DeadlineReminderKind =
  | "30_DAYS_BEFORE_END"
  | "14_DAYS_BEFORE_END"
  | "7_DAYS_BEFORE_END"
  | "3_DAYS_BEFORE_END"
  | "2_DAYS_BEFORE_END"
  | "1_DAY_BEFORE_END"

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
    case 2:
      return "2_DAYS_BEFORE_END"
    case 1:
      return "1_DAY_BEFORE_END"
  }
}

function daysBeforeEndLabel(daysBeforeEnd: ReminderDay) {
  switch (daysBeforeEnd) {
    case 30:
      return "za měsíc"
    case 14:
      return "za 14 dní"
    case 7:
      return "za 7 dní"
    case 3:
      return "za 3 dny"
    case 2:
      return "za 2 dny"
    case 1:
      return "za 1 den"
  }
}

function daysBeforeEndRemainingLabel(daysBeforeEnd: ReminderDay) {
  switch (daysBeforeEnd) {
    case 30:
      return "zhruba měsíc"
    case 14:
      return "14 dní"
    case 7:
      return "7 dní"
    case 3:
      return "3 dny"
    case 2:
      return "2 dny"
    case 1:
      return "1 den"
  }
}

function reminderSubject(args: {
  employeeName: string
  daysBeforeEnd: ReminderDay
  hasInvite: boolean
}) {
  const dayLabel = daysBeforeEndLabel(args.daysBeforeEnd)

  return args.hasInvite
    ? `Blíží se konec pracovního poměru (${dayLabel}) – ${args.employeeName}`
    : `Nutno odeslat pozvánku k podpisu výstupního listu (${dayLabel}) – ${args.employeeName}`
}

function reminderIntro(args: {
  daysBeforeEnd: ReminderDay
  hasInvite: boolean
}) {
  const remaining = daysBeforeEndRemainingLabel(args.daysBeforeEnd)
  const urgently = args.daysBeforeEnd <= 3 ? " co nejdříve" : ""

  return args.hasInvite
    ? `Do konce pracovního poměru zbývá ${remaining} a výstupní list zatím není kompletně podepsaný. Prosíme o zajištění podpisu${urgently}.`
    : `Do konce pracovního poměru zbývá ${remaining} a pozvánka k podpisu výstupního listu zatím nebyla nikomu odeslána. Prosíme o odeslání pozvánky${urgently}.`
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
      actualEnd: null,
      plannedEnd: args.effectiveEndFilter,
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
    const hasInvite = Boolean(data.signatureRecipientsSentAt)

    const pendingSigners = hasInvite
      ? (data.signatureRecipients ?? [])
          .filter(
            (recipient) =>
              !recipient.revokedAt &&
              !resolveSignatureRecipientStatus(data, off.userEmail, recipient)
                .hasSigned
          )
          .map((recipient) => `${recipient.name} (${recipient.email})`)
      : []

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
            hasInvite,
          }),
          intro: reminderIntro({
            daysBeforeEnd: args.daysBeforeEnd,
            hasInvite,
          }),
          pendingSigners,
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
        hasInvite,
      }),
      meta: {
        reminderKind,
        daysBeforeEnd: args.daysBeforeEnd,
        hasInvite,
        mailQueueId: job.id,
        recipients: args.hrRecipients,
        pendingSigners,
      },
    })

    queued += 1
    args.notifications.push(
      `${reminderKind.toLowerCase()}_queued:${off.id}:${job.id}`
    )
  }

  return queued
}

async function existsOffboardingSignatureReminderJob(args: {
  offboardingId: number
  email: string
  behalfLabel: string | null
  daysBeforeEnd: SignatureReminderDay
}) {
  const jobs = await prisma.mailQueue.findMany({
    where: {
      type: "EXIT_SIGNATURE_INVITE",
      status: { in: ACTIVE_MAIL_STATUSES },
    },
    select: { payload: true },
    take: 1000,
  })

  return jobs.some((job) => {
    const payload = getPayloadRecord(job.payload)

    if (asString(payload.to)?.trim().toLowerCase() !== args.email) {
      return false
    }
    if (asNumber(payload.daysBeforeEnd) !== args.daysBeforeEnd) return false

    const payloadBehalfLabel = asString(payload.behalfLabel)?.trim() || null
    if (payloadBehalfLabel !== args.behalfLabel) return false

    return isSameOffboardingPayload({
      payload,
      offboardingId: args.offboardingId,
    })
  })
}

function resolveSignatureRecipientStatus(
  data: ExitChecklistData,
  employeeEmail: string | null,
  recipient: { name: string; email: string; rowKeys?: string[] }
): { hasSigned: boolean; label: string } {
  const email = recipient.email.trim().toLowerCase()

  if (recipient.rowKeys?.length) {
    return {
      hasSigned: recipient.rowKeys.every((key) =>
        Boolean(data.items.find((item) => item.key === key)?.signedAt)
      ),
      label: recipient.name,
    }
  }

  if (employeeEmail && email === employeeEmail.trim().toLowerCase()) {
    return {
      hasSigned: Boolean(data.signatures?.employee?.signedAt),
      label: "zaměstnanec",
    }
  }

  if (data.managerEmail && email === data.managerEmail.trim().toLowerCase()) {
    return {
      hasSigned: Boolean(data.signatures?.manager?.signedAt),
      label: "vedoucí",
    }
  }

  const knownSignatory =
    EXIT_CHECKLIST_SIGNATORIES.find((signatory) =>
      signatory.emails.some(
        (signatoryEmail) => signatoryEmail.toLowerCase() === email
      )
    ) ??
    (LAW_SIGNATORY.emails.some(
      (signatoryEmail) => signatoryEmail.toLowerCase() === email
    )
      ? LAW_SIGNATORY
      : null)

  if (knownSignatory) {
    const relevantRowKeys = knownSignatory.rowKeys.filter(
      (key) => key !== "lawInfo" || data.conflictOfInterest
    )

    return {
      hasSigned: relevantRowKeys.every((key) =>
        Boolean(data.items.find((item) => item.key === key)?.signedAt)
      ),
      label: knownSignatory.name,
    }
  }

  return { hasSigned: false, label: recipient.name }
}

// Cílené připomínky - na rozdíl od výše (queueExitChecklistReminders, jde
// vždy jen na HR souhrnně) se posílají přímo těm, kdo ještě konkrétně
// nepodepsali (přesně skupina, kterou HR naposledy odeslala přes "Odeslat
// všem k podpisu" - uložená v data.signatureRecipients), na stejný
// veřejný odkaz, jaký dostali při pozvánce.
async function queueExitChecklistSignatureReminders(args: {
  daysBeforeEnd: SignatureReminderDay
  effectiveEndFilter: { lte: Date; gt?: Date; gte?: Date }
  baseUrl: string
  notifications: string[]
}) {
  const candidates = await prisma.employeeOffboarding.findMany({
    where: {
      deletedAt: null,
      actualEnd: null,
      plannedEnd: args.effectiveEndFilter,
    },
    select: { id: true },
  })

  let queued = 0

  for (const candidate of candidates) {
    const result = await getOrCreateChecklist(candidate.id)

    if (!result) continue

    const { off, checklist } = result

    if (!checklist.publicToken) continue

    const data: ExitChecklistData = mapToExitChecklistData(off, checklist)

    if (getExitChecklistCompletionState(data).isComplete) continue
    if (!data.signatureRecipients?.length) continue

    const employeeName = buildFullName(off)
    const effectiveEnd = off.actualEnd ?? off.plannedEnd
    const signUrl = `${args.baseUrl}/odchody-public/${checklist.publicToken}`

    for (const recipient of data.signatureRecipients) {
      const email = recipient.email.trim().toLowerCase()

      if (!email || recipient.revokedAt) continue

      const { hasSigned, label } = resolveSignatureRecipientStatus(
        data,
        off.userEmail,
        recipient
      )

      if (hasSigned) continue

      const alreadyQueued = await existsOffboardingSignatureReminderJob({
        offboardingId: off.id,
        email,
        behalfLabel: recipient.behalfLabel ?? null,
        daysBeforeEnd: args.daysBeforeEnd,
      })

      if (alreadyQueued) {
        args.notifications.push(
          `sig_reminder_${args.daysBeforeEnd}d_already_active:${off.id}:${email}`
        )
        continue
      }

      const job = await prisma.mailQueue.create({
        data: {
          type: "EXIT_SIGNATURE_INVITE",
          payload: {
            to: email,
            offboardingId: off.id,
            employeeName,
            employeePosition: off.positionName,
            employeeDepartment: off.department,
            employmentEndDate: effectiveEnd?.toISOString() ?? null,
            signUrl,
            reminderRole: label,
            isBehalf: Boolean(recipient.behalfLabel),
            behalfLabel: recipient.behalfLabel ?? null,
            isEmployee:
              Boolean(off.userEmail) &&
              email === off.userEmail?.trim().toLowerCase(),
            daysBeforeEnd: args.daysBeforeEnd,
            createdBy: "system-cron",
            createdByName: "Systémový cron",
          },
          status: "QUEUED",
          priority: 2,
          createdBy: "system-cron",
        },
      })

      await logExitChecklistEvent({
        checklistId: checklist.id,
        action: "SIGNATURE_INVITE_SENT",
        by: "system-cron",
        byName: "Systémový cron",
        message: `Automatická připomínka podpisu (${label}) – zbývá ${args.daysBeforeEnd} ${args.daysBeforeEnd === 1 ? "den" : "dny"} do konce pracovního poměru.`,
        meta: {
          reminderRole: label,
          daysBeforeEnd: args.daysBeforeEnd,
          mailQueueId: job.id,
          recipient: email,
        },
      })

      queued += 1
      args.notifications.push(
        `sig_reminder_${args.daysBeforeEnd}d_queued:${off.id}:${job.id}`
      )
    }
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
  const in2Days = addDays(today, 2)
  const in1Day = addDays(today, 1)

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
    effectiveEndFilter: { lte: in3Days, gt: in2Days },
    now,
    baseUrl,
    hrRecipients,
    notifications,
  })

  const at2Days = await queueExitChecklistReminders({
    daysBeforeEnd: 2,
    effectiveEndFilter: { lte: in2Days, gt: in1Day },
    now,
    baseUrl,
    hrRecipients,
    notifications,
  })

  const at1Day = await queueExitChecklistReminders({
    daysBeforeEnd: 1,
    effectiveEndFilter: { lte: in1Day, gte: today },
    now,
    baseUrl,
    hrRecipients,
    notifications,
  })

  const sig14Days = await queueExitChecklistSignatureReminders({
    daysBeforeEnd: 14,
    effectiveEndFilter: { lte: in14Days, gt: in7Days },
    baseUrl,
    notifications,
  })

  const sig7Days = await queueExitChecklistSignatureReminders({
    daysBeforeEnd: 7,
    effectiveEndFilter: { lte: in7Days, gt: in3Days },
    baseUrl,
    notifications,
  })

  const sig3Days = await queueExitChecklistSignatureReminders({
    daysBeforeEnd: 3,
    effectiveEndFilter: { lte: in3Days, gt: in2Days },
    baseUrl,
    notifications,
  })

  const sig2Days = await queueExitChecklistSignatureReminders({
    daysBeforeEnd: 2,
    effectiveEndFilter: { lte: in2Days, gt: in1Day },
    baseUrl,
    notifications,
  })

  const sig1Day = await queueExitChecklistSignatureReminders({
    daysBeforeEnd: 1,
    effectiveEndFilter: { lte: in1Day, gte: today },
    baseUrl,
    notifications,
  })

  const queued = notifications.filter((item) => item.includes("_queued")).length

  return {
    status: "success" as const,
    notifications,
    processed:
      at30Days +
      at14Days +
      at7Days +
      at3Days +
      at2Days +
      at1Day +
      sig14Days +
      sig7Days +
      sig3Days +
      sig2Days +
      sig1Day,
    queued,
    failed: 0,
    stats: {
      at30Days,
      at14Days,
      at7Days,
      at3Days,
      at2Days,
      at1Day,
      sig14Days,
      sig7Days,
      sig3Days,
      sig2Days,
      sig1Day,
      queued,
    },
  }
}
