import type { MailJobType } from "@prisma/client"

import { prisma } from "@/lib/db"

export type RecordKind = "ONBOARDING" | "OFFBOARDING"

const OFFBOARDING_ONLY_TYPES: MailJobType[] = [
  "OFFBOARDING_DEPARTURE_CONFIRMATION",
  "EXIT_SIGNATURE_INVITE",
]

const ONBOARDING_ONLY_TYPES: MailJobType[] = [
  "PROBATION_EVALUATION_INVITE",
  "PROBATION_EVALUATION_REMINDER",
  "PROBATION_EVALUATION_HR_INFO",
  "PROBATION_EVALUATION_HR_MISSING_SUPERVISOR",
  "PROBATION_EVALUATION_HR_NOT_COMPLETED",
  "PROBATION_EVALUATION_UNLOCK_REMINDER",
]

// NOTICE_WARNING a NEW_RECORD_MANAGER_NOTICE se používají pro oba typy
// záznamů (odchody i nástupy) - v payloadu nese buď offboardingId přímo,
// nebo recordId + kind, podle toho, který cron job to zařadil.
const SHARED_TYPES: MailJobType[] = [
  "NOTICE_WARNING",
  "NEW_RECORD_MANAGER_NOTICE",
]

function getPayloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/**
 * Zruší (status CANCELLED) všechny dosud nezpracované MailQueue joby
 * navázané na daný záznam nástupu/odchodu - volá se při zrušení, smazání
 * nebo potvrzení záznamu jako skutečného, aby fronta nerozesílala
 * připomínky k záznamu, který už není aktivní.
 */
export async function cancelQueuedMailJobsForRecord(
  kind: RecordKind,
  recordId: number
): Promise<number> {
  const relevantTypes =
    kind === "OFFBOARDING"
      ? [...OFFBOARDING_ONLY_TYPES, ...SHARED_TYPES]
      : [...ONBOARDING_ONLY_TYPES, ...SHARED_TYPES]

  const jobs = await prisma.mailQueue.findMany({
    where: {
      status: "QUEUED",
      type: { in: relevantTypes },
    },
    select: { id: true, type: true, payload: true },
  })

  const matchIds: number[] = []

  for (const job of jobs) {
    const payload = getPayloadRecord(job.payload)

    if (
      OFFBOARDING_ONLY_TYPES.includes(job.type) ||
      ONBOARDING_ONLY_TYPES.includes(job.type)
    ) {
      const idValue = asNumber(payload.offboardingId ?? payload.employeeId)
      if (idValue === recordId) matchIds.push(job.id)
      continue
    }

    // SHARED_TYPES: rozpoznat podle recordId+kind, nebo rovnou offboardingId
    if (payload.recordId !== undefined) {
      if (asNumber(payload.recordId) === recordId && payload.kind === kind) {
        matchIds.push(job.id)
      }
      continue
    }

    if (kind === "OFFBOARDING" && payload.offboardingId !== undefined) {
      if (asNumber(payload.offboardingId) === recordId) {
        matchIds.push(job.id)
      }
    }
  }

  if (matchIds.length === 0) return 0

  const result = await prisma.mailQueue.updateMany({
    where: { id: { in: matchIds } },
    data: { status: "CANCELLED" },
  })

  return result.count
}

/**
 * Zruší jen připomínky k PODPISU výstupního listu (ne ostatní automatizace
 * vázanou na ten samý odchod) - volá se při uzamčení výstupního listu, kdy
 * record samotný dál existuje a je aktivní, jen už se nedá podepisovat.
 */
export async function cancelExitChecklistSignatureJobsForOffboarding(
  offboardingId: number
): Promise<number> {
  const jobs = await prisma.mailQueue.findMany({
    where: {
      status: "QUEUED",
      type: { in: ["EXIT_SIGNATURE_INVITE", "NOTICE_WARNING"] },
    },
    select: { id: true, type: true, payload: true },
  })

  const matchIds: number[] = []

  for (const job of jobs) {
    const payload = getPayloadRecord(job.payload)

    if (asNumber(payload.offboardingId) !== offboardingId) continue

    if (job.type === "EXIT_SIGNATURE_INVITE") {
      matchIds.push(job.id)
      continue
    }

    const reminderKind = payload.reminderKind
    if (
      typeof reminderKind === "string" &&
      reminderKind.startsWith("SIG_REPORT_")
    ) {
      matchIds.push(job.id)
    }
  }

  if (matchIds.length === 0) return 0

  const result = await prisma.mailQueue.updateMany({
    where: { id: { in: matchIds } },
    data: { status: "CANCELLED" },
  })

  return result.count
}
