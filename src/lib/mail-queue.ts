import type {
  MailJobType,
  MailQueue,
  ProbationEvaluationEventAction,
} from "@prisma/client"

import { prisma } from "@/lib/db"
import {
  sendQueuedProbationEmail,
  type ProbationMailQueuePayload,
} from "@/lib/email"
import { addProbationEvent } from "@/lib/probation-evaluation-request"

type QueuePayload = Record<string, unknown>

const PROBATION_MAIL_JOB_TYPES: MailJobType[] = [
  "PROBATION_EVALUATION_INVITE",
  "PROBATION_EVALUATION_REMINDER",
  "PROBATION_EVALUATION_HR_INFO",
  "PROBATION_EVALUATION_HR_MISSING_SUPERVISOR",
  "PROBATION_EVALUATION_HR_NOT_COMPLETED",
  "PROBATION_EVALUATION_UNLOCK_REMINDER",
]

function asPayload(value: unknown): QueuePayload {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as QueuePayload
  }

  return {}
}

function asStr(value: unknown): string | null {
  if (typeof value !== "string") return null

  const trimmed = value.trim()

  return trimmed.length ? trimmed : null
}

function asStrArr(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.includes("@"))
  }

  if (typeof value === "string") {
    return value
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter((item) => item.includes("@"))
  }

  return []
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

function getRecipients(payload: QueuePayload): string[] {
  return Array.from(
    new Set([...asStrArr(payload.recipients), ...asStrArr(payload.to)])
  )
}

function toProbationPayload(payload: QueuePayload): ProbationMailQueuePayload {
  return {
    recipients: asStrArr(payload.recipients),
    to: asStr(payload.to) ?? undefined,
    supervisorEmail: asStr(payload.supervisorEmail),
    employeeName: asStr(payload.employeeName),
    employeePosition:
      asStr(payload.employeePosition) ?? asStr(payload.position),
    employeeDepartment:
      asStr(payload.employeeDepartment) ?? asStr(payload.department),
    employeeUnitName:
      asStr(payload.employeeUnitName) ?? asStr(payload.unitName),
    probationEndDate: asStr(payload.probationEndDate),
    supervisorName: asStr(payload.supervisorName),
    evaluationLink: asStr(payload.evaluationLink),
    formType: asStr(payload.formType),
    recommendation: asStr(payload.recommendation),
    evaluatorName: asStr(payload.evaluatorName),
    evaluatorEmail: asStr(payload.evaluatorEmail),
    subject: asStr(payload.subject),
    intro: asStr(payload.intro),
    message: asStr(payload.message),
    sentByName: asStr(payload.sentByName),
  }
}

function getProbationRequestId(payload: QueuePayload) {
  return asNumber(payload.requestId)
}

function getProbationEventAuthor(job: MailQueue, payload: QueuePayload) {
  return {
    by:
      asStr(payload.createdBy) ??
      asStr(payload.by) ??
      job.createdBy ??
      "system-cron",
    byName:
      asStr(payload.createdByName) ??
      asStr(payload.byName) ??
      asStr(payload.sentByName) ??
      "Systémový cron",
    byEmail: asStr(payload.createdByEmail) ?? asStr(payload.byEmail),
  }
}

function getProbationSentAction(
  type: string
): ProbationEvaluationEventAction | null {
  if (type.includes("MISSING_SUPERVISOR")) {
    return "MISSING_SUPERVISOR"
  }

  if (type.includes("INVITE")) {
    return "INVITE_SENT"
  }

  if (type.includes("HR_NOT_COMPLETED")) {
    return "HR_REMINDER_SENT"
  }

  if (type.includes("UNLOCK_REMINDER")) {
    return "UNLOCK_REMINDER_SENT"
  }

  if (type.includes("REMINDER")) {
    return "REMINDER_SENT"
  }

  if (type.includes("HR_INFO")) {
    return "HR_INFO_SENT"
  }

  if (type.includes("COMPLETED")) {
    return "HR_INFO_SENT"
  }

  return null
}

function getProbationSentMessage(type: string, payload: QueuePayload) {
  const recipients = getRecipients(payload)
  const recipientText = recipients.length
    ? ` Příjemci: ${recipients.join(", ")}.`
    : ""

  if (type.includes("MISSING_SUPERVISOR")) {
    return `Upozornění na chybějícího vedoucího bylo odesláno z fronty.${recipientText}`
  }

  if (type.includes("INVITE")) {
    return `Pozvánka k vyplnění formuláře vyhodnocení zkušební doby byla odeslána z fronty.${recipientText}`
  }

  if (type.includes("HR_NOT_COMPLETED")) {
    return `HR připomínka, že vyhodnocení zkušební doby není vyplněné, byla odeslána z fronty.${recipientText}`
  }

  if (type.includes("UNLOCK_REMINDER")) {
    return `Připomínka, že formulář zůstává odemčený k úpravě, byla odeslána z fronty.${recipientText}`
  }

  if (type.includes("REMINDER")) {
    return `Připomínka k vyplnění formuláře vyhodnocení zkušební doby byla odeslána z fronty.${recipientText}`
  }

  if (type.includes("HR_INFO")) {
    return `HR informace k vyhodnocení zkušební doby byla odeslána z fronty.${recipientText}`
  }

  if (type.includes("COMPLETED")) {
    return `Informace o finálním vyplnění vyhodnocení zkušební doby byla odeslána z fronty.${recipientText}`
  }

  return `E-mail k vyhodnocení zkušební doby byl odeslán z fronty.${recipientText}`
}

async function addProbationQueueEvent(args: {
  job: MailQueue
  action: ProbationEvaluationEventAction
  message: string
  error?: string | null
}) {
  try {
    const payload = asPayload(args.job.payload)
    const requestId = getProbationRequestId(payload)

    if (!requestId) return

    const author = getProbationEventAuthor(args.job, payload)

    await prisma.$transaction(async (tx) => {
      await addProbationEvent(tx, {
        requestId,
        action: args.action,
        by: author.by,
        byName: author.byName,
        byEmail: author.byEmail,
        mailQueueId: args.job.id,
        message: args.message,
        meta: {
          source: "queue",
          queueType: String(args.job.type),
          recipients: getRecipients(payload),
          error: args.error ?? null,
        },
      })
    })
  } catch (err) {
    console.error("[MAIL QUEUE EVENT WRITE FAILED]", err)
  }
}

async function markHistory(
  mailQueueId: number,
  status: "SENT" | "FAILED",
  error?: string | null
) {
  await prisma.emailHistory
    .updateMany({
      where: { mailQueueId },
      data: {
        status,
        sentAt: status === "SENT" ? new Date() : undefined,
        error: error ?? null,
      },
    })
    .catch(() => {})
}

async function finishJob(job: MailQueue) {
  await prisma.mailQueue.update({
    where: { id: job.id },
    data: {
      status: "SENT",
      sentAt: new Date(),
      error: null,
    },
  })

  await markHistory(job.id, "SENT")

  const action = getProbationSentAction(String(job.type))

  if (!action) return

  await addProbationQueueEvent({
    job,
    action,
    message: getProbationSentMessage(String(job.type), asPayload(job.payload)),
  })
}

async function failJob(job: MailQueue, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const nextRetryCount = job.retryCount + 1
  const canRetry = nextRetryCount < job.maxRetries

  await prisma.mailQueue.update({
    where: { id: job.id },
    data: {
      status: canRetry ? "QUEUED" : "FAILED",
      retryCount: nextRetryCount,
      error: message,
      sendAt: canRetry
        ? new Date(Date.now() + Math.min(nextRetryCount * 5, 30) * 60 * 1000)
        : job.sendAt,
    },
  })

  if (!canRetry) {
    await markHistory(job.id, "FAILED", message)

    await addProbationQueueEvent({
      job,
      action: "EMAIL_FAILED",
      message: `E-mail k vyhodnocení zkušební doby se nepodařilo odeslat z fronty: ${message}`,
      error: message,
    })
  }
}

async function processJob(job: MailQueue) {
  const payload = asPayload(job.payload)

  await sendQueuedProbationEmail({
    type: job.type,
    payload: toProbationPayload(payload),
  })
}

export async function processMailQueueBatch(opts?: {
  batchSize?: number
}): Promise<{ processed: number; succeeded: number; failed: number }> {
  const batchSize = opts?.batchSize ?? 20
  const now = new Date()

  const jobs = await prisma.mailQueue.findMany({
    where: {
      status: "QUEUED",
      type: {
        in: PROBATION_MAIL_JOB_TYPES,
      },
      OR: [{ sendAt: null }, { sendAt: { lte: now } }],
    },
    orderBy: [{ priority: "asc" }, { id: "asc" }],
    take: batchSize,
  })

  let succeeded = 0
  let failed = 0
  let processed = 0

  for (const job of jobs) {
    const claim = await prisma.mailQueue.updateMany({
      where: {
        id: job.id,
        status: "QUEUED",
      },
      data: {
        status: "PROCESSING",
        error: null,
      },
    })

    if (claim.count === 0) continue

    processed++

    try {
      await processJob(job)
      await finishJob(job)
      succeeded++
    } catch (error) {
      await failJob(job, error)
      failed++
    }
  }

  return {
    processed,
    succeeded,
    failed,
  }
}
