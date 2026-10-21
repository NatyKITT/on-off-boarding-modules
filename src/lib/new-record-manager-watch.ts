import { NextRequest } from "next/server"
import type { MailJobStatus } from "@prisma/client"
import { startOfDay, startOfMonth } from "date-fns"

import { prisma } from "@/lib/db"
import {
  buildFullName,
  getAppBaseUrlFromRequest,
  getHrRecipientsFromEnv,
} from "@/lib/probation-evaluation-request"

export type NewRecordKind = "ONBOARDING" | "OFFBOARDING"

export type NewRecordUpdateReason =
  | "FIELDS_CHANGED"
  | "MANAGER_REMOVED"
  | "RECORD_CANCELLED"
  | "RECORD_DELETED"

const ACTIVE_MAIL_STATUSES: MailJobStatus[] = ["QUEUED", "PROCESSING", "SENT"]
const WATCH_SINCE_KEY = "newRecordManagerWatchSince"
const MISSING_MANAGER_NOTICE_KIND = "NEW_RECORD_MISSING_MANAGER"

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

async function getOrInitWatchSince(now: Date): Promise<Date> {
  const existing = await prisma.systemSettings.findUnique({
    where: { key: WATCH_SINCE_KEY },
  })

  if (existing && typeof existing.value === "string") {
    const parsed = new Date(existing.value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  const since = startOfMonth(now)

  await prisma.systemSettings.upsert({
    where: { key: WATCH_SINCE_KEY },
    create: {
      key: WATCH_SINCE_KEY,
      value: since.toISOString(),
      updatedBy: "system-cron",
    },
    update: { value: since.toISOString(), updatedBy: "system-cron" },
  })

  return since
}

async function existsMissingManagerReminderJob(args: {
  kind: NewRecordKind
  recordId: number
  reminderDate: string
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

    if (asString(payload.noticeKind) !== MISSING_MANAGER_NOTICE_KIND) {
      return false
    }
    if (payload.kind !== args.kind) return false
    if (asNumber(payload.recordId) !== args.recordId) return false

    return asString(payload.reminderDate) === args.reminderDate
  })
}

async function existsManagerNoticeJob(args: {
  kind: NewRecordKind
  recordId: number
}) {
  const jobs = await prisma.mailQueue.findMany({
    where: {
      type: "NEW_RECORD_MANAGER_NOTICE",
      status: { in: ACTIVE_MAIL_STATUSES },
    },
    select: { payload: true },
    take: 1000,
  })

  return jobs.some((job) => {
    const payload = getPayloadRecord(job.payload)

    return (
      payload.kind === args.kind && asNumber(payload.recordId) === args.recordId
    )
  })
}

export async function findLatestManagerNoticePayload(
  kind: NewRecordKind,
  recordId: number
): Promise<Record<string, unknown> | null> {
  const jobs = await prisma.mailQueue.findMany({
    where: {
      type: "NEW_RECORD_MANAGER_NOTICE",
      status: { in: ACTIVE_MAIL_STATUSES },
    },
    select: { payload: true },
    orderBy: { id: "desc" },
    take: 1000,
  })

  for (const job of jobs) {
    const payload = getPayloadRecord(job.payload)

    if (payload.kind === kind && asNumber(payload.recordId) === recordId) {
      return payload
    }
  }

  return null
}

export async function queueManagerChangeNotice(args: {
  kind: NewRecordKind
  recordId: number
  to: string
  reason: NewRecordUpdateReason
  changeSummary?: string[] | null
  employeeName: string
  employeePersonalNumber: string | null
  employeePosition: string
  employeeDepartment: string
  employeeUnitName: string
  plannedDate: string | null
  recordLink: string | null
  createdBy: string
  createdByName: string
}): Promise<number> {
  const job = await prisma.mailQueue.create({
    data: {
      type: "NEW_RECORD_MANAGER_NOTICE",
      payload: {
        kind: args.kind,
        recordId: args.recordId,
        to: args.to,
        reason: args.reason,
        changeSummary: args.changeSummary ?? null,
        employeeName: args.employeeName,
        employeePersonalNumber: args.employeePersonalNumber,
        employeePosition: args.employeePosition,
        employeeDepartment: args.employeeDepartment,
        employeeUnitName: args.employeeUnitName,
        plannedDate: args.plannedDate,
        recordLink: args.recordLink,
        createdBy: args.createdBy,
        createdByName: args.createdByName,
      },
      status: "QUEUED",
      priority: 3,
      createdBy: args.createdBy,
    },
  })

  return job.id
}

export async function queueManagerAssignedNotice(args: {
  kind: NewRecordKind
  recordId: number
  managerEmail: string
  employeeName: string
  employeePersonalNumber: string | null
  employeePosition: string
  employeeDepartment: string
  employeeUnitName: string
  plannedDate: string | null
  recordLink: string
  createdBy: string
  createdByName: string
}): Promise<number> {
  const job = await prisma.mailQueue.create({
    data: {
      type: "NEW_RECORD_MANAGER_NOTICE",
      payload: {
        kind: args.kind,
        recordId: args.recordId,
        to: args.managerEmail,
        employeeName: args.employeeName,
        employeePersonalNumber: args.employeePersonalNumber,
        employeePosition: args.employeePosition,
        employeeDepartment: args.employeeDepartment,
        employeeUnitName: args.employeeUnitName,
        plannedDate: args.plannedDate,
        recordLink: args.recordLink,
        createdBy: args.createdBy,
        createdByName: args.createdByName,
      },
      status: "QUEUED",
      priority: 3,
      createdBy: args.createdBy,
    },
  })

  return job.id
}

export const RELEVANT_CHANGE_FIELD_LABELS: Record<string, string> = {
  name: "Jméno",
  surname: "Příjmení",
  titleBefore: "Titul před jménem",
  titleAfter: "Titul za jménem",
  positionName: "Pozice",
  department: "Odbor",
  unitName: "Oddělení",
  plannedStart: "Plánovaný nástup",
  plannedEnd: "Plánovaný odchod",
  supervisorEmail: "Vedoucí odboru",
}

export type ManagerNotifyPromptReason =
  | "FIELDS_CHANGED"
  | "MANAGER_CHANGED"
  | "RECORD_CANCELLED"
  | "RECORD_DELETED"

export type ManagerNotifyPrompt = {
  kind: NewRecordKind
  recordId: number
  reason: ManagerNotifyPromptReason
  changedFields?: string[]
}

export async function buildManagerNotifyPromptForChanges(args: {
  kind: NewRecordKind
  recordId: number
  changes: Array<{ field: string; oldValue: string; newValue: string }>
}): Promise<ManagerNotifyPrompt | null> {
  const relevant = args.changes.filter(
    (change) => change.field in RELEVANT_CHANGE_FIELD_LABELS
  )

  if (relevant.length === 0) return null

  const previousNotice = await findLatestManagerNoticePayload(
    args.kind,
    args.recordId
  )

  if (!previousNotice) return null

  const managerChanged = relevant.some(
    (change) => change.field === "supervisorEmail"
  )

  return {
    kind: args.kind,
    recordId: args.recordId,
    reason: managerChanged ? "MANAGER_CHANGED" : "FIELDS_CHANGED",
    changedFields: relevant.map(
      (change) => RELEVANT_CHANGE_FIELD_LABELS[change.field] ?? change.field
    ),
  }
}

export async function buildManagerNotifyPromptForRemoval(args: {
  kind: NewRecordKind
  recordId: number
  reason: "RECORD_CANCELLED" | "RECORD_DELETED"
}): Promise<ManagerNotifyPrompt | null> {
  const previousNotice = await findLatestManagerNoticePayload(
    args.kind,
    args.recordId
  )

  if (!previousNotice) return null

  return { kind: args.kind, recordId: args.recordId, reason: args.reason }
}

export async function performManagerChangeNotification(args: {
  kind: NewRecordKind
  recordId: number
  reason: ManagerNotifyPromptReason
  current: {
    employeeName: string
    employeePersonalNumber: string | null
    employeePosition: string
    employeeDepartment: string
    employeeUnitName: string
    plannedDate: string | null
    supervisorEmail: string | null
    recordLink: string | null
  }
  createdBy: string
  createdByName: string
}): Promise<{ queued: number; message: string }> {
  const previousNotice = await findLatestManagerNoticePayload(
    args.kind,
    args.recordId
  )

  if (!previousNotice) {
    return {
      queued: 0,
      message:
        "U tohoto záznamu ještě nebyl vedoucímu odboru nikdy odeslán informační e-mail, není co oznamovat.",
    }
  }

  const previousManagerEmail = asString(previousNotice.to)

  if (args.reason === "RECORD_CANCELLED" || args.reason === "RECORD_DELETED") {
    if (!previousManagerEmail) {
      return {
        queued: 0,
        message:
          "U tohoto záznamu nebyl vedoucímu odboru odeslán žádný informační e-mail.",
      }
    }

    await queueManagerChangeNotice({
      kind: args.kind,
      recordId: args.recordId,
      to: previousManagerEmail,
      reason: args.reason,
      employeeName: args.current.employeeName,
      employeePersonalNumber: args.current.employeePersonalNumber,
      employeePosition: args.current.employeePosition,
      employeeDepartment: args.current.employeeDepartment,
      employeeUnitName: args.current.employeeUnitName,
      plannedDate: args.current.plannedDate,
      recordLink: null,
      createdBy: args.createdBy,
      createdByName: args.createdByName,
    })

    return { queued: 1, message: "Informace byla odeslána vedoucímu odboru." }
  }

  if (args.reason === "MANAGER_CHANGED") {
    const newManagerEmail = args.current.supervisorEmail
    let queued = 0

    if (previousManagerEmail && previousManagerEmail !== newManagerEmail) {
      await queueManagerChangeNotice({
        kind: args.kind,
        recordId: args.recordId,
        to: previousManagerEmail,
        reason: "MANAGER_REMOVED",
        employeeName: args.current.employeeName,
        employeePersonalNumber: args.current.employeePersonalNumber,
        employeePosition: args.current.employeePosition,
        employeeDepartment: args.current.employeeDepartment,
        employeeUnitName: args.current.employeeUnitName,
        plannedDate: args.current.plannedDate,
        recordLink: null,
        createdBy: args.createdBy,
        createdByName: args.createdByName,
      })
      queued += 1
    }

    if (
      newManagerEmail &&
      newManagerEmail !== previousManagerEmail &&
      args.current.recordLink
    ) {
      await queueManagerAssignedNotice({
        kind: args.kind,
        recordId: args.recordId,
        managerEmail: newManagerEmail,
        employeeName: args.current.employeeName,
        employeePersonalNumber: args.current.employeePersonalNumber,
        employeePosition: args.current.employeePosition,
        employeeDepartment: args.current.employeeDepartment,
        employeeUnitName: args.current.employeeUnitName,
        plannedDate: args.current.plannedDate,
        recordLink: args.current.recordLink,
        createdBy: args.createdBy,
        createdByName: args.createdByName,
      })
      queued += 1
    }

    return {
      queued,
      message:
        queued > 0
          ? "Informace byla odeslána dotčeným vedoucím."
          : "Oproti poslední informaci nedošlo ke změně vedoucího odboru.",
    }
  }

  if (!previousManagerEmail) {
    return {
      queued: 0,
      message:
        "U tohoto záznamu nebyl vedoucímu odboru odeslán žádný informační e-mail.",
    }
  }

  const changeSummary: string[] = []

  const compareField = (
    label: string,
    oldValue: unknown,
    newValue: string | null
  ) => {
    const oldStr = asString(oldValue) ?? ""
    const newStr = newValue ?? ""

    if (oldStr !== newStr) {
      changeSummary.push(`${label}: ${oldStr || "—"} → ${newStr || "—"}`)
    }
  }

  compareField(
    "Zaměstnanec",
    previousNotice.employeeName,
    args.current.employeeName
  )
  compareField(
    "Pozice",
    previousNotice.employeePosition,
    args.current.employeePosition
  )
  compareField(
    "Odbor",
    previousNotice.employeeDepartment,
    args.current.employeeDepartment
  )
  compareField(
    "Oddělení",
    previousNotice.employeeUnitName,
    args.current.employeeUnitName
  )
  compareField(
    args.kind === "ONBOARDING" ? "Plánovaný nástup" : "Plánovaný odchod",
    previousNotice.plannedDate,
    args.current.plannedDate
  )

  if (changeSummary.length === 0) {
    return {
      queued: 0,
      message:
        "Oproti poslední informaci vedoucímu se nic podstatného nezměnilo.",
    }
  }

  await queueManagerChangeNotice({
    kind: args.kind,
    recordId: args.recordId,
    to: previousManagerEmail,
    reason: "FIELDS_CHANGED",
    changeSummary,
    employeeName: args.current.employeeName,
    employeePersonalNumber: args.current.employeePersonalNumber,
    employeePosition: args.current.employeePosition,
    employeeDepartment: args.current.employeeDepartment,
    employeeUnitName: args.current.employeeUnitName,
    plannedDate: args.current.plannedDate,
    recordLink: args.current.recordLink,
    createdBy: args.createdBy,
    createdByName: args.createdByName,
  })

  return {
    queued: 1,
    message: "Informace o změně byla odeslána vedoucímu odboru.",
  }
}

async function queueMissingManagerReminder(args: {
  kind: NewRecordKind
  recordId: number
  reminderDate: string
  hrRecipients: string[]
  employeeName: string
  employeePersonalNumber: string | null
  employeePosition: string
  employeeDepartment: string
  employeeUnitName: string
  plannedDate: string | null
  recordLink: string
  notifications: string[]
}) {
  const alreadyQueued = await existsMissingManagerReminderJob({
    kind: args.kind,
    recordId: args.recordId,
    reminderDate: args.reminderDate,
  })

  if (alreadyQueued) {
    args.notifications.push(
      `missing_manager_already_active:${args.kind}:${args.recordId}`
    )
    return 0
  }

  const job = await prisma.mailQueue.create({
    data: {
      type: "NOTICE_WARNING",
      payload: {
        noticeKind: MISSING_MANAGER_NOTICE_KIND,
        kind: args.kind,
        recordId: args.recordId,
        recipients: args.hrRecipients,
        employeeName: args.employeeName,
        employeePersonalNumber: args.employeePersonalNumber,
        employeePosition: args.employeePosition,
        employeeDepartment: args.employeeDepartment,
        employeeUnitName: args.employeeUnitName,
        plannedDate: args.plannedDate,
        recordLink: args.recordLink,
        reminderDate: args.reminderDate,
        createdBy: "system-cron",
        createdByName: "Systémový cron",
      },
      status: "QUEUED",
      priority: 3,
      createdBy: "system-cron",
    },
  })

  args.notifications.push(
    `missing_manager_queued:${args.kind}:${args.recordId}:${job.id}`
  )

  return 1
}

async function queueManagerNotice(args: {
  kind: NewRecordKind
  recordId: number
  managerEmail: string
  hrRecipients: string[]
  employeeName: string
  employeePersonalNumber: string | null
  employeePosition: string
  employeeDepartment: string
  employeeUnitName: string
  plannedDate: string | null
  recordLink: string
  notifications: string[]
}) {
  const alreadyQueued = await existsManagerNoticeJob({
    kind: args.kind,
    recordId: args.recordId,
  })

  if (alreadyQueued) {
    args.notifications.push(
      `manager_notice_already_active:${args.kind}:${args.recordId}`
    )
    return 0
  }

  const job = await prisma.mailQueue.create({
    data: {
      type: "NEW_RECORD_MANAGER_NOTICE",
      payload: {
        kind: args.kind,
        recordId: args.recordId,
        to: args.managerEmail,
        employeeName: args.employeeName,
        employeePersonalNumber: args.employeePersonalNumber,
        employeePosition: args.employeePosition,
        employeeDepartment: args.employeeDepartment,
        employeeUnitName: args.employeeUnitName,
        plannedDate: args.plannedDate,
        recordLink: args.recordLink,
        createdBy: "system-cron",
        createdByName: "Systémový cron",
      },
      status: "QUEUED",
      priority: 3,
      createdBy: "system-cron",
    },
  })

  args.notifications.push(
    `manager_notice_queued:${args.kind}:${args.recordId}:${job.id}`
  )

  return 1
}

export async function ensureOnboardingManagerWatchJobs(req: NextRequest) {
  const now = new Date()
  const baseUrl = getAppBaseUrlFromRequest(req)
  const hrRecipients = getHrRecipientsFromEnv()
  const since = await getOrInitWatchSince(now)
  const reminderDate = startOfDay(now).toISOString().slice(0, 10)

  const notifications: string[] = []
  let queued = 0

  const candidates = await prisma.employeeOnboarding.findMany({
    where: {
      deletedAt: null,
      cancelledAt: null,
      createdAt: { gte: since },
    },
  })

  for (const record of candidates) {
    const employeeName = buildFullName(record)
    const recordLink = `${baseUrl}/nastupy/${record.id}`

    if (!record.supervisorEmail) {
      if (hrRecipients.length === 0) {
        notifications.push(`missing_manager_skipped_no_hr:${record.id}`)
        continue
      }

      queued += await queueMissingManagerReminder({
        kind: "ONBOARDING",
        recordId: record.id,
        reminderDate,
        hrRecipients,
        employeeName,
        employeePersonalNumber: record.personalNumber,
        employeePosition: record.positionName,
        employeeDepartment: record.department,
        employeeUnitName: record.unitName,
        plannedDate: record.plannedStart?.toISOString() ?? null,
        recordLink,
        notifications,
      })
      continue
    }

    queued += await queueManagerNotice({
      kind: "ONBOARDING",
      recordId: record.id,
      managerEmail: record.supervisorEmail,
      hrRecipients,
      employeeName,
      employeePersonalNumber: record.personalNumber,
      employeePosition: record.positionName,
      employeeDepartment: record.department,
      employeeUnitName: record.unitName,
      plannedDate: record.plannedStart?.toISOString() ?? null,
      recordLink,
      notifications,
    })
  }

  return {
    processed: queued,
    queued,
    watchSince: since.toISOString(),
    notifications,
  }
}

export async function ensureOffboardingManagerWatchJobs(req: NextRequest) {
  const now = new Date()
  const baseUrl = getAppBaseUrlFromRequest(req)
  const hrRecipients = getHrRecipientsFromEnv()
  const since = await getOrInitWatchSince(now)
  const reminderDate = startOfDay(now).toISOString().slice(0, 10)

  const notifications: string[] = []
  let queued = 0

  const candidates = await prisma.employeeOffboarding.findMany({
    where: {
      deletedAt: null,
      cancelledAt: null,
      createdAt: { gte: since },
    },
  })

  for (const record of candidates) {
    const employeeName = buildFullName(record)
    const recordLink = `${baseUrl}/odchody/${record.id}`

    if (!record.supervisorEmail) {
      if (hrRecipients.length === 0) {
        notifications.push(`missing_manager_skipped_no_hr:${record.id}`)
        continue
      }

      queued += await queueMissingManagerReminder({
        kind: "OFFBOARDING",
        recordId: record.id,
        reminderDate,
        hrRecipients,
        employeeName,
        employeePersonalNumber: record.personalNumber,
        employeePosition: record.positionName,
        employeeDepartment: record.department,
        employeeUnitName: record.unitName,
        plannedDate: record.plannedEnd?.toISOString() ?? null,
        recordLink,
        notifications,
      })
      continue
    }

    queued += await queueManagerNotice({
      kind: "OFFBOARDING",
      recordId: record.id,
      managerEmail: record.supervisorEmail,
      hrRecipients,
      employeeName,
      employeePersonalNumber: record.personalNumber,
      employeePosition: record.positionName,
      employeeDepartment: record.department,
      employeeUnitName: record.unitName,
      plannedDate: record.plannedEnd?.toISOString() ?? null,
      recordLink,
      notifications,
    })
  }

  return {
    processed: queued,
    queued,
    watchSince: since.toISOString(),
    notifications,
  }
}
