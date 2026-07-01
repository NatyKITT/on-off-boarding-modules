import type { MailJobStatus, MailJobType } from "@prisma/client"

import { prisma } from "@/lib/db"

const ACTIVE_MAIL_STATUSES: MailJobStatus[] = ["QUEUED", "PROCESSING", "SENT"]
const PENDING_MAIL_STATUSES: MailJobStatus[] = ["QUEUED", "PROCESSING"]

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

async function existsProbationJob(args: {
  type: MailJobType
  requestId?: number
  employeeId?: number
  onboardingId?: number
  statuses: MailJobStatus[]
}): Promise<boolean> {
  const jobs = await prisma.mailQueue.findMany({
    where: {
      type: args.type,
      status: {
        in: args.statuses,
      },
    },
    select: {
      payload: true,
    },
    take: 1000,
  })

  return jobs.some((job) => {
    const payload = getPayloadRecord(job.payload)

    const sameRequest =
      typeof args.requestId === "number" &&
      asNumber(payload.requestId) === args.requestId

    const payloadEmployeeIds = [
      payload.employeeId,
      payload.onboardingId,
      payload.onboardingEmployeeId,
    ]
      .map(asNumber)
      .filter((value): value is number => typeof value === "number")

    const sameEmployee =
      typeof args.employeeId === "number" &&
      payloadEmployeeIds.includes(args.employeeId)

    const sameOnboarding =
      typeof args.onboardingId === "number" &&
      payloadEmployeeIds.includes(args.onboardingId)

    return sameRequest || sameEmployee || sameOnboarding
  })
}

export async function existsActiveProbationJob(args: {
  type: MailJobType
  requestId?: number
  employeeId?: number
  onboardingId?: number
}): Promise<boolean> {
  return existsProbationJob({
    ...args,
    statuses: ACTIVE_MAIL_STATUSES,
  })
}

export async function existsPendingProbationJob(args: {
  type: MailJobType
  requestId?: number
  employeeId?: number
  onboardingId?: number
}): Promise<boolean> {
  return existsProbationJob({
    ...args,
    statuses: PENDING_MAIL_STATUSES,
  })
}
