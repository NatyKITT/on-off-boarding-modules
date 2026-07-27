import {
  ChecklistResolution,
  Prisma,
  type EmployeeOffboarding,
  type ExitChecklistAsset as ExitChecklistAssetModel,
  type ExitChecklistItem as ExitChecklistItemModel,
} from "@prisma/client"

import type {
  ExitAssetItem,
  ExitChecklistData,
  ExitChecklistItem,
  ExitChecklistSignatures,
  ExitChecklistSignatureValue,
  HandoverAgendaData,
  HandoverRecipient,
  HandoverSendHistoryEntry,
} from "@/types/exit-checklist"
import { EXIT_CHECKLIST_ROWS } from "@/config/exit-checklist-rows"

import { prisma } from "@/lib/db"
import { resolveSupervisorFromPositionNum } from "@/lib/systemizace-superior"

export type ChecklistWithRelations = Prisma.ExitChecklistGetPayload<{
  include: {
    items: true
    assets: true
    offboarding: true
  }
}>

export function buildEmployeeName(off: {
  titleBefore?: string | null
  name: string
  surname: string
  titleAfter?: string | null
}) {
  return [off.titleBefore, off.name, off.surname, off.titleAfter]
    .filter(Boolean)
    .join(" ")
    .trim()
}

export function buildHeaderFromOff(off: EmployeeOffboarding) {
  const employeeName = buildEmployeeName(off)
  const endDate = off.actualEnd ?? off.plannedEnd

  return {
    employeeName,
    personalNumber: off.personalNumber ?? null,
    department: off.department,
    unitName: off.unitName,
    employmentEndDate: endDate
      ? new Date(endDate).toISOString()
      : new Date().toISOString(),
  }
}

export function sanitizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
}

export function sanitizeResponsibleParty(
  value: unknown
): "KITT6" | "OSS_KT" | null {
  if (value === "KITT6" || value === "OSS_KT") return value
  return null
}

export function sanitizeIsoDate(value: unknown): string {
  const text = sanitizeText(value)
  if (!text) return ""

  const d = new Date(text)
  if (Number.isNaN(d.getTime())) return ""

  return d.toISOString().slice(0, 10)
}

function getRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export function resolutionLabel(value: ChecklistResolution): string {
  if (value === ChecklistResolution.YES) return "Ano"
  if (value === ChecklistResolution.NO) return "Ne"
  return "Nepodává se"
}

export function handoverSummaryLabel(value: unknown): string {
  const h = getRecord(value)

  if (!h.includeHandoverAgenda) return "nevyplněna"

  const parts: string[] = []

  if (h.option1) parts.push("předáno do spisovny / na jiné funkční místo")
  if (h.option2) parts.push("OI-KITT6 předá dokumenty na jiné funkční místo")
  if (h.option3) parts.push("zůstává na neobsazeném funkčním místě")

  return parts.length > 0 ? parts.join("; ") : "nevyplněna"
}

export function trackSignatureChange(
  label: string,
  before: {
    signedAt: string | Date | null
    signedByEmail: string | null
  } | null,
  after: {
    signedAt: string | Date | null
    signedByEmail: string | null
  } | null,
  signedLabels: string[],
  clearedLabels: string[]
) {
  const wasSigned = Boolean(before?.signedAt)
  const isSigned = Boolean(after?.signedAt)

  const beforeEmail = (before?.signedByEmail ?? "").trim().toLowerCase()
  const afterEmail = (after?.signedByEmail ?? "").trim().toLowerCase()

  if (!wasSigned && isSigned) {
    signedLabels.push(label)
  } else if (wasSigned && !isSigned) {
    clearedLabels.push(label)
  } else if (wasSigned && isSigned && beforeEmail !== afterEmail) {
    signedLabels.push(label)
  }
}

export function assetLabel(
  subject: string,
  inventoryNumber: string | null
): string {
  return inventoryNumber ? `${subject} (${inventoryNumber})` : subject
}

function sanitizeNullableText(value: unknown): string | null {
  return sanitizeText(value) || null
}

function sanitizeNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value

  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }

  return null
}

function normalizeEmail(value: unknown): string {
  return sanitizeText(value).toLowerCase()
}

function createStableId(parts: Array<string | null | undefined>) {
  const value = parts
    .map((part) => sanitizeText(part))
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9@._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

  return value || `item-${Date.now()}`
}

export function sanitizeSignatureValueForJson(
  value: unknown
): Prisma.InputJsonObject {
  const raw = getRecord(value)

  return {
    signedByName: sanitizeText(raw.signedByName),
    signedByEmail: sanitizeText(raw.signedByEmail),
    signedAt: sanitizeText(raw.signedAt),
  }
}

export function sanitizeSignatureValueForResponse(
  value: unknown
): ExitChecklistSignatureValue {
  const raw = getRecord(value)

  return {
    signedByName: sanitizeText(raw.signedByName) || null,
    signedByEmail: sanitizeText(raw.signedByEmail) || null,
    signedAt: sanitizeText(raw.signedAt) || null,
  }
}

function sanitizeHandoverRecipientsForResponse(
  raw: Record<string, unknown>
): HandoverRecipient[] {
  if (!Array.isArray(raw.handoverRecipients)) return []

  return raw.handoverRecipients
    .filter((item): item is Record<string, unknown> => {
      return Boolean(item) && typeof item === "object"
    })
    .map((item) => {
      const email = normalizeEmail(item.email)
      const name = sanitizeText(item.name)

      return {
        id:
          sanitizeText(item.id) ||
          email ||
          createStableId([name, sanitizeText(item.personalNumber)]),
        name,
        email,
        personalNumber: sanitizeNullableText(item.personalNumber),
        department: sanitizeNullableText(item.department),

        handoverInfoLastSentAt: sanitizeNullableText(
          item.handoverInfoLastSentAt
        ),
        handoverInfoLastSentByName: sanitizeNullableText(
          item.handoverInfoLastSentByName
        ),
        handoverInfoLastSentByEmail: sanitizeNullableText(
          item.handoverInfoLastSentByEmail
        ),
        handoverInfoSentCount: sanitizeNullableNumber(
          item.handoverInfoSentCount
        ),
      }
    })
    .filter((recipient) => Boolean(recipient.name && recipient.email))
}

function sanitizeHandoverRecipientsForJson(
  raw: Record<string, unknown>
): Prisma.InputJsonArray {
  return sanitizeHandoverRecipientsForResponse(raw).map(
    (recipient): Prisma.InputJsonObject => ({
      id: recipient.id,
      name: recipient.name,
      email: recipient.email,
      personalNumber: recipient.personalNumber,
      department: recipient.department,

      handoverInfoLastSentAt: recipient.handoverInfoLastSentAt ?? null,
      handoverInfoLastSentByName: recipient.handoverInfoLastSentByName ?? null,
      handoverInfoLastSentByEmail:
        recipient.handoverInfoLastSentByEmail ?? null,
      handoverInfoSentCount: recipient.handoverInfoSentCount ?? null,
    })
  )
}

function normalizeHistoryEntry(
  item: Record<string, unknown>
): HandoverSendHistoryEntry | null {
  const email = normalizeEmail(item.email)
  if (!email) return null

  const name = sanitizeText(item.name) || email

  return {
    id: sanitizeText(item.id) || email,
    name,
    email,
    personalNumber: sanitizeNullableText(item.personalNumber),
    department: sanitizeNullableText(item.department),
    lastSentAt: sanitizeNullableText(item.lastSentAt),
    lastSentByName: sanitizeNullableText(item.lastSentByName),
    lastSentByEmail: sanitizeNullableText(item.lastSentByEmail),
    sentCount: sanitizeNullableNumber(item.sentCount) ?? 0,
  }
}

function upsertHistoryEntry(
  map: Map<string, HandoverSendHistoryEntry>,
  next: HandoverSendHistoryEntry
) {
  const existing = map.get(next.email)

  if (!existing) {
    map.set(next.email, next)
    return
  }

  const existingTime = existing.lastSentAt
    ? new Date(existing.lastSentAt).getTime()
    : 0
  const nextTime = next.lastSentAt ? new Date(next.lastSentAt).getTime() : 0

  const useNextAsMain = nextTime >= existingTime

  map.set(next.email, {
    id: useNextAsMain ? next.id : existing.id,
    name: useNextAsMain ? next.name : existing.name,
    email: next.email,
    personalNumber:
      (useNextAsMain ? next.personalNumber : existing.personalNumber) ??
      existing.personalNumber ??
      next.personalNumber ??
      null,
    department:
      (useNextAsMain ? next.department : existing.department) ??
      existing.department ??
      next.department ??
      null,
    lastSentAt: useNextAsMain ? next.lastSentAt : existing.lastSentAt,
    lastSentByName: useNextAsMain
      ? next.lastSentByName
      : existing.lastSentByName,
    lastSentByEmail: useNextAsMain
      ? next.lastSentByEmail
      : existing.lastSentByEmail,
    sentCount: Math.max(existing.sentCount ?? 0, next.sentCount ?? 0),
  })
}

function sanitizeHandoverSendHistoryForResponse(
  raw: Record<string, unknown>
): HandoverSendHistoryEntry[] {
  const historyByEmail = new Map<string, HandoverSendHistoryEntry>()

  if (Array.isArray(raw.handoverSendHistory)) {
    for (const item of raw.handoverSendHistory) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue

      const entry = normalizeHistoryEntry(item as Record<string, unknown>)
      if (entry) upsertHistoryEntry(historyByEmail, entry)
    }
  }

  if (Array.isArray(raw.handoverRecipients)) {
    for (const item of raw.handoverRecipients) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue

      const record = item as Record<string, unknown>
      const email = normalizeEmail(record.email)
      const lastSentAt = sanitizeNullableText(record.handoverInfoLastSentAt)
      const sentCount = sanitizeNullableNumber(record.handoverInfoSentCount)

      if (!email || (!lastSentAt && !sentCount)) continue

      upsertHistoryEntry(historyByEmail, {
        id: sanitizeText(record.id) || email,
        name: sanitizeText(record.name) || email,
        email,
        personalNumber: sanitizeNullableText(record.personalNumber),
        department: sanitizeNullableText(record.department),
        lastSentAt,
        lastSentByName: sanitizeNullableText(record.handoverInfoLastSentByName),
        lastSentByEmail: sanitizeNullableText(
          record.handoverInfoLastSentByEmail
        ),
        sentCount: sentCount ?? 0,
      })
    }
  }

  return Array.from(historyByEmail.values()).sort((a, b) => {
    const aTime = a.lastSentAt ? new Date(a.lastSentAt).getTime() : 0
    const bTime = b.lastSentAt ? new Date(b.lastSentAt).getTime() : 0

    return bTime - aTime
  })
}

function sanitizeHandoverSendHistoryForJson(
  raw: Record<string, unknown>
): Prisma.InputJsonArray {
  return sanitizeHandoverSendHistoryForResponse(raw).map(
    (entry): Prisma.InputJsonObject => ({
      id: entry.id,
      name: entry.name,
      email: entry.email,
      personalNumber: entry.personalNumber,
      department: entry.department,
      lastSentAt: entry.lastSentAt,
      lastSentByName: entry.lastSentByName,
      lastSentByEmail: entry.lastSentByEmail,
      sentCount: entry.sentCount,
    })
  )
}

function getHandoverSendMetadataForJson(raw: Record<string, unknown>): {
  handoverRecipientsSentAt: string | null
  handoverRecipientsSentByName: string | null
  handoverRecipientsSentByEmail: string | null
  handoverRecipientsSentHash: string | null
  handoverRecipientsSentCount: number | null
  handoverSendHistory: Prisma.InputJsonArray
} {
  return {
    handoverRecipientsSentAt: sanitizeNullableText(
      raw.handoverRecipientsSentAt
    ),
    handoverRecipientsSentByName: sanitizeNullableText(
      raw.handoverRecipientsSentByName
    ),
    handoverRecipientsSentByEmail: sanitizeNullableText(
      raw.handoverRecipientsSentByEmail
    ),
    handoverRecipientsSentHash: sanitizeNullableText(
      raw.handoverRecipientsSentHash
    ),
    handoverRecipientsSentCount: sanitizeNullableNumber(
      raw.handoverRecipientsSentCount
    ),
    handoverSendHistory: sanitizeHandoverSendHistoryForJson(raw),
  }
}

function getHandoverSendMetadataForResponse(
  raw: Record<string, unknown>
): Pick<
  HandoverAgendaData,
  | "handoverRecipientsSentAt"
  | "handoverRecipientsSentByName"
  | "handoverRecipientsSentByEmail"
  | "handoverRecipientsSentHash"
  | "handoverRecipientsSentCount"
  | "handoverSendHistory"
> {
  return {
    handoverRecipientsSentAt: sanitizeNullableText(
      raw.handoverRecipientsSentAt
    ),
    handoverRecipientsSentByName: sanitizeNullableText(
      raw.handoverRecipientsSentByName
    ),
    handoverRecipientsSentByEmail: sanitizeNullableText(
      raw.handoverRecipientsSentByEmail
    ),
    handoverRecipientsSentHash: sanitizeNullableText(
      raw.handoverRecipientsSentHash
    ),
    handoverRecipientsSentCount: sanitizeNullableNumber(
      raw.handoverRecipientsSentCount
    ),
    handoverSendHistory: sanitizeHandoverSendHistoryForResponse(raw),
  }
}

function getCompletionMetadataForResponse(
  raw: Record<string, unknown>
): Pick<
  ExitChecklistData,
  | "completedAt"
  | "completedNotificationSentAt"
  | "completedNotificationSentByName"
  | "completedNotificationSentByEmail"
  | "completedNotificationSentTo"
> {
  return {
    completedAt: sanitizeNullableText(raw.completedAt),
    completedNotificationSentAt: sanitizeNullableText(
      raw.completedNotificationSentAt
    ),
    completedNotificationSentByName: sanitizeNullableText(
      raw.completedNotificationSentByName
    ),
    completedNotificationSentByEmail: sanitizeNullableText(
      raw.completedNotificationSentByEmail
    ),
    completedNotificationSentTo: sanitizeNullableText(
      raw.completedNotificationSentTo
    ),
  }
}

function mergeHistoryArrays(
  nextHistory: unknown,
  previousHistory: unknown
): Prisma.InputJsonArray {
  const mergedRaw: Record<string, unknown> = {
    handoverSendHistory: [
      ...(Array.isArray(previousHistory) ? previousHistory : []),
      ...(Array.isArray(nextHistory) ? nextHistory : []),
    ],
  }

  return sanitizeHandoverSendHistoryForJson(mergedRaw)
}

export function sanitizeHandoverForJson(
  value: unknown
): Prisma.InputJsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  const raw = value as Record<string, unknown>
  const includeHandoverAgenda = Boolean(raw.includeHandoverAgenda)

  const metadata = getHandoverSendMetadataForJson(raw)

  if (!includeHandoverAgenda) {
    return {
      includeHandoverAgenda: false,
      option1: false,
      option2: false,
      option2Target: "",
      option2TargetPositionNum: "",
      option3: false,
      option3Reason: "",
      responsibleParty: null,
      handoverRecipients: [],
      ...metadata,
    }
  }

  const option1 = Boolean(raw.option1)
  const option2 = Boolean(raw.option2)
  const option3 = Boolean(raw.option3)

  const option2Target = option2 ? sanitizeText(raw.option2Target) : ""
  const option2TargetPositionNum = option2
    ? sanitizeText(raw.option2TargetPositionNum)
    : ""

  const option3Reason = option3 ? sanitizeText(raw.option3Reason) : ""
  const responsibleParty = option3
    ? sanitizeResponsibleParty(raw.responsibleParty)
    : null

  const handoverRecipients = option3
    ? sanitizeHandoverRecipientsForJson(raw)
    : []

  return {
    includeHandoverAgenda: true,
    option1,
    option2,
    option2Target,
    option2TargetPositionNum,
    option3,
    option3Reason,
    responsibleParty,
    handoverRecipients,
    ...metadata,
  }
}

export function sanitizeHandoverForResponse(
  value: unknown
): HandoverAgendaData | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }

  const raw = value as Record<string, unknown>
  const includeHandoverAgenda = Boolean(raw.includeHandoverAgenda)

  const metadata = getHandoverSendMetadataForResponse(raw)

  if (!includeHandoverAgenda) {
    return {
      includeHandoverAgenda: false,
      option1: false,
      option2: false,
      option2Target: "",
      option2TargetPositionNum: "",
      option3: false,
      option3Reason: "",
      responsibleParty: null,
      handoverRecipients: [],
      ...metadata,
    }
  }

  const option1 = Boolean(raw.option1)
  const option2 = Boolean(raw.option2)
  const option3 = Boolean(raw.option3)

  const handoverRecipients = option3
    ? sanitizeHandoverRecipientsForResponse(raw)
    : []

  return {
    includeHandoverAgenda: true,
    option1,
    option2,
    option2Target: option2 ? sanitizeText(raw.option2Target) : "",
    option2TargetPositionNum: option2
      ? sanitizeText(raw.option2TargetPositionNum)
      : "",
    option3,
    option3Reason: option3 ? sanitizeText(raw.option3Reason) : "",
    responsibleParty: option3
      ? sanitizeResponsibleParty(raw.responsibleParty)
      : null,
    handoverRecipients,
    ...metadata,
  }
}

export function preserveHandoverSendMetadata(
  nextHandover: Prisma.InputJsonObject | null,
  previousHandover: unknown
): Prisma.InputJsonObject | null {
  if (!nextHandover) return nextHandover

  const previousRaw = getRecord(previousHandover)
  const previousMetadata = getHandoverSendMetadataForJson(previousRaw)
  const nextRecord = nextHandover as Record<string, unknown>

  const nextMetadata = getHandoverSendMetadataForJson(nextRecord)
  const mergedHistory = mergeHistoryArrays(
    nextMetadata.handoverSendHistory,
    previousMetadata.handoverSendHistory
  )

  return {
    ...nextHandover,

    handoverRecipientsSentAt:
      nextMetadata.handoverRecipientsSentAt ??
      previousMetadata.handoverRecipientsSentAt ??
      null,

    handoverRecipientsSentByName:
      nextMetadata.handoverRecipientsSentByName ??
      previousMetadata.handoverRecipientsSentByName ??
      null,

    handoverRecipientsSentByEmail:
      nextMetadata.handoverRecipientsSentByEmail ??
      previousMetadata.handoverRecipientsSentByEmail ??
      null,

    handoverRecipientsSentHash:
      nextMetadata.handoverRecipientsSentHash ??
      previousMetadata.handoverRecipientsSentHash ??
      null,

    handoverRecipientsSentCount:
      nextMetadata.handoverRecipientsSentCount ??
      previousMetadata.handoverRecipientsSentCount ??
      null,

    handoverSendHistory: mergedHistory,
  }
}

export function sanitizeSignaturesForJson(
  value: unknown
): Prisma.InputJsonObject {
  const raw = getRecord(value)

  return {
    employee: sanitizeSignatureValueForJson(raw.employee),
    manager: sanitizeSignatureValueForJson(raw.manager),
    issuer: sanitizeSignatureValueForJson(raw.issuer),
    issuedDate: sanitizeIsoDate(raw.issuedDate),
    managerEmail: sanitizeNullableText(raw.managerEmail),
  }
}

export function sanitizeSignaturesForResponse(
  value: unknown
): ExitChecklistSignatures {
  const raw = getRecord(value)

  return {
    employee: sanitizeSignatureValueForResponse(raw.employee),
    manager: sanitizeSignatureValueForResponse(raw.manager),
    issuer: sanitizeSignatureValueForResponse(raw.issuer),
    issuedDate: sanitizeIsoDate(raw.issuedDate),
    managerEmail: sanitizeNullableText(raw.managerEmail),
  }
}

export function mapToExitChecklistData(
  off: EmployeeOffboarding,
  checklist: {
    id: number
    publicToken: string
    lockedAt: Date | null
    items: ExitChecklistItemModel[]
    assets: ExitChecklistAssetModel[]
    header: Prisma.JsonValue
  }
): ExitChecklistData {
  const header = buildHeaderFromOff(off)

  const items: ExitChecklistItem[] = EXIT_CHECKLIST_ROWS.map((row) => {
    const dbItem = checklist.items.find((i) => i.key === row.key)

    let resolved: "YES" | "NO" | null = null
    if (dbItem?.resolution === ChecklistResolution.YES) resolved = "YES"
    else if (dbItem?.resolution === ChecklistResolution.NO) resolved = "NO"

    return {
      ...row,
      resolved,
      signedByName: dbItem?.signedByName ?? null,
      signedByEmail: dbItem?.signedByEmail ?? null,
      signedAt: dbItem?.signedAt
        ? new Date(dbItem.signedAt).toISOString()
        : null,
    }
  })

  const assets: ExitAssetItem[] = checklist.assets.map(
    (asset: ExitChecklistAssetModel) => ({
      id: String(asset.id),
      subject: asset.subject,
      inventoryNumber: asset.inventoryNumber ?? "",
      createdById: asset.createdById ?? null,
    })
  )

  const headerData = getRecord(checklist.header)

  const handover = sanitizeHandoverForResponse(headerData.handover)
  const signatures = sanitizeSignaturesForResponse(headerData.signatures)
  const completionMetadata = getCompletionMetadataForResponse(headerData)

  return {
    id: checklist.id,
    offboardingId: off.id,
    publicToken: checklist.publicToken,
    conflictOfInterest: Boolean(headerData.conflictOfInterest),
    positionNum: off.positionNum ?? null,

    employeeName: header.employeeName,
    personalNumber: header.personalNumber,
    department: header.department,
    unitName: header.unitName,
    employmentEndDate: header.employmentEndDate,
    employeeEmail: off.userEmail ?? null,

    managerEmail: sanitizeText(headerData.managerEmail) || null,
    managerName: sanitizeText(headerData.managerName) || null,
    handoverManagerSignature:
      sanitizeSignatureValueForResponse(headerData.handoverManagerSignature) ??
      null,

    lockedAt: checklist.lockedAt
      ? new Date(checklist.lockedAt).toISOString()
      : null,

    ...completionMetadata,

    items,
    assets,
    handover,
    signatures,
  }
}

export async function getOrCreateChecklist(offboardingId: number) {
  const off = await prisma.employeeOffboarding.findUnique({
    where: { id: offboardingId },
    include: {
      exitChecklist: {
        include: {
          items: true,
          assets: true,
          offboarding: true,
        },
      },
    },
  })

  if (!off) return null

  if (!off.exitChecklist) {
    const header: Record<string, unknown> = buildHeaderFromOff(off)

    if (off.positionNum) {
      const resolved = await resolveSupervisorFromPositionNum(off.positionNum)

      if (resolved?.snapshot) {
        const managerName = buildEmployeeName({
          titleBefore: resolved.snapshot.titleBefore,
          name: resolved.snapshot.name ?? "",
          surname: resolved.snapshot.surname ?? "",
          titleAfter: resolved.snapshot.titleAfter,
        })

        if (managerName) header.managerName = managerName
        if (resolved.snapshot.email)
          header.managerEmail = resolved.snapshot.email
      }
    }

    const created = await prisma.exitChecklist.create({
      data: {
        offboardingId,
        header: header as Prisma.InputJsonObject,
        items: {
          create: EXIT_CHECKLIST_ROWS.map((row, index) => ({
            key: row.key,
            department: row.organization,
            label: row.obligation,
            order: index,
            resolution: ChecklistResolution.NOT_APPLICABLE,
          })),
        },
      },
      include: {
        items: true,
        assets: true,
        offboarding: true,
      },
    })

    return { off, checklist: created }
  }

  return {
    off,
    checklist: off.exitChecklist,
  }
}

export async function getChecklistByPublicToken(token: string) {
  return prisma.exitChecklist.findUnique({
    where: { publicToken: token },
    include: {
      items: true,
      assets: true,
      offboarding: true,
    },
  })
}

export function isPraha6OrKitt6(email?: string | null) {
  const domain = (email ?? "").split("@")[1]?.toLowerCase() ?? ""
  return domain === "praha6.cz" || domain === "kitt6.cz"
}
