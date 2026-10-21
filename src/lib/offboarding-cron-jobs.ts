import { NextRequest } from "next/server"
import type { MailJobStatus } from "@prisma/client"
import { addDays, addMonths, startOfDay } from "date-fns"

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
import { recipientIdentityKey } from "@/lib/exit-checklist-recipient-key"
import {
  EXIT_CHECKLIST_EMPLOYEE_ROLE_NOTE,
  EXIT_CHECKLIST_MANAGER_HEADER_SUBTITLE,
  EXIT_CHECKLIST_MANAGER_ROLE_NOTE,
  EXIT_CHECKLIST_SECTION_B_ROLE_NOTE,
} from "@/lib/exit-checklist-role-notes"
import {
  buildFullName,
  getAppBaseUrlFromRequest,
  getHrRecipientsFromEnv,
} from "@/lib/probation-evaluation-request"

type SignatureReminderDay = 14 | 7 | 5 | 3 | 2 | 1 | 0

const SIGNATURE_REMINDER_DAYS: SignatureReminderDay[] = [14, 7, 5, 3, 2, 1, 0]

const ACTIVE_MAIL_STATUSES: MailJobStatus[] = ["QUEUED", "PROCESSING", "SENT"]
const REMINDER_REPEAT_EVERY_DAYS = 3

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

function dayCountLabelCs(days: number): string {
  if (days <= 0) return "dnes"
  if (days === 1) return "1 den"
  if (days >= 2 && days <= 4) return `${days} dny`

  return `${days} dní`
}

function isSameOffboardingPayload(args: {
  payload: Record<string, unknown>
  offboardingId: number
}) {
  return asNumber(args.payload.offboardingId) === args.offboardingId
}

async function existsOffboardingReminderJob(args: {
  offboardingId: number
  reminderKind: string
  reminderDate?: string
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

    if (
      args.reminderDate !== undefined &&
      asString(payload.reminderDate) !== args.reminderDate
    ) {
      return false
    }

    return isSameOffboardingPayload({
      payload,
      offboardingId: args.offboardingId,
    })
  })
}

async function existsOffboardingReminderJobRecently(args: {
  offboardingId: number
  reminderKind: string
  days: number
}) {
  const since = addDays(startOfDay(new Date()), -args.days)

  const jobs = await prisma.mailQueue.findMany({
    where: {
      type: "NOTICE_WARNING",
      status: { in: ACTIVE_MAIL_STATUSES },
      createdAt: { gte: since },
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

async function wasRecentlyQueued(
  offboardingId: number,
  mailType: "OFFBOARDING_DEPARTURE_CONFIRMATION",
  days: number
) {
  const since = addDays(startOfDay(new Date()), -days)

  const jobs = await prisma.mailQueue.findMany({
    where: {
      type: mailType,
      status: { in: ACTIVE_MAIL_STATUSES },
      createdAt: { gte: since },
    },
    select: { payload: true },
    take: 1000,
  })

  return jobs.some((job) =>
    isSameOffboardingPayload({
      payload: getPayloadRecord(job.payload),
      offboardingId,
    })
  )
}

async function queueOffboardingDepartureConfirmations(args: {
  today: Date
  baseUrl: string
  hrRecipients: string[]
  notifications: string[]
}) {
  if (args.hrRecipients.length === 0) {
    args.notifications.push("departure_confirmation_skipped_no_hr")
    return 0
  }

  const candidates = await prisma.employeeOffboarding.findMany({
    where: {
      deletedAt: null,
      actualEnd: null,
      cancelledAt: null,
      plannedEnd: { lte: args.today },
    },
  })

  let queued = 0

  for (const off of candidates) {
    const recentlyQueued = await wasRecentlyQueued(
      off.id,
      "OFFBOARDING_DEPARTURE_CONFIRMATION",
      REMINDER_REPEAT_EVERY_DAYS
    )

    if (recentlyQueued) {
      args.notifications.push(`departure_confirmation_already_active:${off.id}`)
      continue
    }

    const employeeName = buildFullName(off)
    const odchodyLink = `${args.baseUrl}/odchody`

    const job = await prisma.mailQueue.create({
      data: {
        type: "OFFBOARDING_DEPARTURE_CONFIRMATION",
        payload: {
          recipients: args.hrRecipients,
          offboardingId: off.id,
          employeeName,
          employeePersonalNumber: off.personalNumber,
          employeePosition: off.positionName,
          employeeDepartment: off.department,
          employeeUnitName: off.unitName,
          plannedEnd: off.plannedEnd?.toISOString() ?? null,
          odchodyLink,
          createdBy: "system-cron",
          createdByName: "Systémový cron",
        },
        status: "QUEUED",
        priority: 2,
        createdBy: "system-cron",
      },
    })

    queued += 1
    args.notifications.push(`departure_confirmation_queued:${off.id}:${job.id}`)
  }

  return queued
}

function isShortNoticeOffboarding(off: {
  noticeMonths: number | null
  hasCustomDates: boolean
}) {
  return (
    (off.noticeMonths !== null && off.noticeMonths < 2) ||
    off.hasCustomDates === true
  )
}

async function queueExitChecklistSetupReminders(args: {
  today: Date
  hrRecipients: string[]
  notifications: string[]
}) {
  const reminderKind = "SETUP_MISSING"
  const reminderDate = args.today.toISOString().slice(0, 10)

  if (args.hrRecipients.length === 0) {
    args.notifications.push("setup_missing_skipped_no_hr")
    return 0
  }

  const candidates = await prisma.employeeOffboarding.findMany({
    where: {
      deletedAt: null,
      actualEnd: null,
      cancelledAt: null,
    },
    select: {
      id: true,
      plannedEnd: true,
      noticeMonths: true,
      hasCustomDates: true,
    },
  })

  let queued = 0

  for (const candidate of candidates) {
    if (!candidate.plannedEnd) continue

    const shortNotice = isShortNoticeOffboarding(candidate)
    const windowStart = addMonths(candidate.plannedEnd, -1)

    if (!shortNotice && args.today < windowStart) continue

    const result = await getOrCreateChecklist(candidate.id)
    if (!result) continue

    const { off, checklist } = result
    const data: ExitChecklistData = mapToExitChecklistData(off, checklist)

    if (Boolean(data.signatureRecipientsSentAt)) continue

    const missing: string[] = []
    if (!data.managerEmail) missing.push("Vedoucí odboru nebyl zadán.")
    if (data.conflictOfInterest === null) {
      missing.push("Stav střetu zájmů nebyl rozhodnut.")
    }

    if (missing.length === 0) continue

    const alreadyQueued = await existsOffboardingReminderJob({
      offboardingId: off.id,
      reminderKind,
      reminderDate,
    })

    if (alreadyQueued) {
      args.notifications.push(`setup_missing_already_active:${off.id}`)
      continue
    }

    const employeeName = buildFullName(off)
    const effectiveEnd = off.actualEnd ?? off.plannedEnd
    const daysBeforeEnd = Math.max(
      0,
      Math.round(
        (candidate.plannedEnd.getTime() - args.today.getTime()) / 86_400_000
      )
    )

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
          daysBeforeEnd,
          subject: `Chybí nastavení před odesláním pozvánek k podpisu – ${employeeName}`,
          intro: `Než bude možné odeslat pozvánky k podpisu výstupního listu, je potřeba doplnit: ${missing.join(" ")}`,
          reminderKind,
          reminderDate,
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
      action: "DEADLINE_REMINDER_SENT",
      by: "system-cron",
      byName: "Systémový cron",
      message: `Chybí nastavení před odesláním pozvánek: ${missing.join(" ")}`,
      meta: {
        reminderKind,
        mailQueueId: job.id,
        recipients: args.hrRecipients,
        missing,
      },
    })

    queued += 1
    args.notifications.push(`setup_missing_queued:${off.id}:${job.id}`)
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

function managerHasSigned(data: ExitChecklistData): boolean {
  return (
    Boolean(data.signatures?.manager?.signedAt) &&
    Boolean(
      data.items.find((item) => item.key === "handoverProtocol")?.signedAt
    ) &&
    Boolean(data.handoverManagerSignature?.signedAt)
  )
}

function resolveSignatureRecipientStatus(
  data: ExitChecklistData,
  employeeEmail: string | null,
  recipient: {
    name: string
    email: string
    rowKeys?: string[]
    substituteForKey?: string
  }
): { hasSigned: boolean; label: string; roleNote: string | null } {
  const email = recipient.email.trim().toLowerCase()

  if (recipient.substituteForKey && data.managerEmail) {
    const managerKey = recipientIdentityKey({
      email: data.managerEmail,
      behalfLabel: undefined,
    })
    if (recipient.substituteForKey === managerKey) {
      return {
        hasSigned: managerHasSigned(data),
        label: "vedoucí (zastoupení)",
        roleNote: EXIT_CHECKLIST_MANAGER_ROLE_NOTE,
      }
    }
  }

  if (recipient.rowKeys?.length) {
    return {
      hasSigned: recipient.rowKeys.every((key) =>
        Boolean(data.items.find((item) => item.key === key)?.signedAt)
      ),
      label: recipient.name,
      roleNote: null,
    }
  }

  if (employeeEmail && email === employeeEmail.trim().toLowerCase()) {
    return {
      hasSigned: Boolean(data.signatures?.employee?.signedAt),
      label: "zaměstnanec",
      roleNote: EXIT_CHECKLIST_EMPLOYEE_ROLE_NOTE,
    }
  }

  if (data.managerEmail && email === data.managerEmail.trim().toLowerCase()) {
    return {
      hasSigned: managerHasSigned(data),
      label: "vedoucí",
      roleNote: EXIT_CHECKLIST_MANAGER_ROLE_NOTE,
    }
  }

  if (
    data.sectionBResponsible?.email &&
    email === data.sectionBResponsible.email.trim().toLowerCase()
  ) {
    return {
      hasSigned: Boolean(data.signatures?.issuer?.signedAt),
      label: "odpovědná osoba za sekci B",
      roleNote: EXIT_CHECKLIST_SECTION_B_ROLE_NOTE,
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
      roleNote: null,
    }
  }

  return { hasSigned: false, label: recipient.name, roleNote: null }
}

async function queueExitChecklistSignatureReminders(args: {
  daysBeforeEnd: SignatureReminderDay
  effectiveEndFilter: { lte: Date; gt?: Date; gte?: Date }
  baseUrl: string
  hrRecipients: string[]
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
    const pendingSigners: string[] = []

    for (const recipient of data.signatureRecipients) {
      const email = recipient.email.trim().toLowerCase()

      if (!email || recipient.revokedAt) continue

      const { hasSigned, label, roleNote } = resolveSignatureRecipientStatus(
        data,
        off.userEmail,
        recipient
      )

      if (hasSigned) continue

      pendingSigners.push(`${recipient.name} (${recipient.email})`)

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
            roleNote,
            headerSubtitle:
              label === "vedoucí" || label === "vedoucí (zastoupení)"
                ? EXIT_CHECKLIST_MANAGER_HEADER_SUBTITLE
                : null,
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
        message: `Automatická připomínka podpisu (${label}) – zbývá ${dayCountLabelCs(args.daysBeforeEnd)} do konce pracovního poměru.`,
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

    if (pendingSigners.length > 0 && args.hrRecipients.length > 0) {
      const reportKind = `SIG_REPORT_${args.daysBeforeEnd}D`

      const alreadyReported = await existsOffboardingReminderJob({
        offboardingId: off.id,
        reminderKind: reportKind,
      })

      if (!alreadyReported) {
        const reportJob = await prisma.mailQueue.create({
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
              checklistLink: `${args.baseUrl}/odchody/${off.id}/vystupni-list`,
              subject: `Kdo ještě nepodepsal výstupní list (${dayCountLabelCs(args.daysBeforeEnd)}) – ${employeeName}`,
              intro: `Do konce pracovního poměru zbývá ${dayCountLabelCs(args.daysBeforeEnd)} a výstupní list zatím není kompletně podepsaný.`,
              pendingSigners,
              reminderKind: reportKind,
              daysBeforeEnd: args.daysBeforeEnd,
              createdBy: "system-cron",
              createdByName: "Systémový cron",
            },
            status: "QUEUED",
            priority: 2,
            createdBy: "system-cron",
          },
        })

        queued += 1
        args.notifications.push(
          `sig_report_${args.daysBeforeEnd}d_queued:${off.id}:${reportJob.id}`
        )
      } else {
        args.notifications.push(
          `sig_report_${args.daysBeforeEnd}d_already_active:${off.id}`
        )
      }
    }
  }

  return queued
}

async function queueExitChecklistLockReminders(args: {
  today: Date
  hrRecipients: string[]
  notifications: string[]
}) {
  const reminderKind = "COMPLETED_NOT_LOCKED"
  const reminderDate = args.today.toISOString().slice(0, 10)

  if (args.hrRecipients.length === 0) {
    args.notifications.push("completed_not_locked_skipped_no_hr")
    return 0
  }

  const candidates = await prisma.employeeOffboarding.findMany({
    where: {
      deletedAt: null,
      actualEnd: null,
      cancelledAt: null,
    },
    select: { id: true },
  })

  let queued = 0

  for (const candidate of candidates) {
    const result = await getOrCreateChecklist(candidate.id)
    if (!result) continue

    const { off, checklist } = result

    if (checklist.lockedAt) continue

    const data: ExitChecklistData = mapToExitChecklistData(off, checklist)

    if (!getExitChecklistCompletionState(data).isComplete) continue

    const recentlyQueued = await existsOffboardingReminderJobRecently({
      offboardingId: off.id,
      reminderKind,
      days: REMINDER_REPEAT_EVERY_DAYS,
    })

    if (recentlyQueued) {
      args.notifications.push(`completed_not_locked_already_active:${off.id}`)
      continue
    }

    const employeeName = buildFullName(off)
    const effectiveEnd = off.actualEnd ?? off.plannedEnd

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
          subject: `Výstupní list je hotový, ale stále není uzamčený – ${employeeName}`,
          intro:
            "Výstupní list je kompletně vyplněný a podepsaný, ale v aplikaci stále není uzamčený pro další úpravy. Prosíme, zkontrolujte ho a uzamkněte jako definitivně dokončený.",
          reminderKind,
          reminderDate,
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
      action: "DEADLINE_REMINDER_SENT",
      by: "system-cron",
      byName: "Systémový cron",
      message: "Výstupní list je 100 % hotový, ale stále není uzamčený.",
      meta: {
        reminderKind,
        mailQueueId: job.id,
        recipients: args.hrRecipients,
      },
    })

    queued += 1
    args.notifications.push(`completed_not_locked_queued:${off.id}:${job.id}`)
  }

  return queued
}

export async function ensureOffboardingCronJobs(req: NextRequest) {
  const now = new Date()
  const today = startOfDay(now)
  const baseUrl = getAppBaseUrlFromRequest(req)
  const hrRecipients = getHrRecipientsFromEnv()

  const notifications: string[] = []

  const dayOffsets = new Map<number, Date>(
    SIGNATURE_REMINDER_DAYS.map((day) => [day, addDays(today, day)])
  )

  const departureConfirmations = await queueOffboardingDepartureConfirmations({
    today,
    baseUrl,
    hrRecipients,
    notifications,
  })

  const setupReminders = await queueExitChecklistSetupReminders({
    today,
    hrRecipients,
    notifications,
  })

  const lockReminders = await queueExitChecklistLockReminders({
    today,
    hrRecipients,
    notifications,
  })

  const sigStats: Record<string, number> = {}
  let signatureReminders = 0

  for (let i = 0; i < SIGNATURE_REMINDER_DAYS.length; i++) {
    const day = SIGNATURE_REMINDER_DAYS[i]
    const nextDay = SIGNATURE_REMINDER_DAYS[i + 1]
    const upper = dayOffsets.get(day) as Date
    const lower =
      nextDay !== undefined ? (dayOffsets.get(nextDay) as Date) : null

    const effectiveEndFilter = lower
      ? { lte: upper, gt: lower }
      : { lte: upper, gte: today }

    const count = await queueExitChecklistSignatureReminders({
      daysBeforeEnd: day,
      effectiveEndFilter,
      baseUrl,
      hrRecipients,
      notifications,
    })

    sigStats[`sig${day}Days`] = count
    signatureReminders += count
  }

  const queued = notifications.filter((item) => item.includes("_queued")).length

  return {
    status: "success" as const,
    notifications,
    processed:
      setupReminders +
      signatureReminders +
      departureConfirmations +
      lockReminders,
    queued,
    failed: 0,
    stats: {
      setupReminders,
      lockReminders,
      ...sigStats,
      departureConfirmations,
      queued,
    },
  }
}
