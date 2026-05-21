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
} from "@/types/exit-checklist"
import { EXIT_CHECKLIST_ROWS } from "@/config/exit-checklist-rows"

import { prisma } from "@/lib/db"

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
    .map((recipient, index) => {
      const rec = getRecord(recipient)

      const id =
        sanitizeText(rec.id) ||
        sanitizeText(rec.email) ||
        `recipient-${index + 1}`

      return {
        id,
        name: sanitizeText(rec.name),
        email: sanitizeText(rec.email).toLowerCase(),
        personalNumber: sanitizeNullableText(rec.personalNumber),
        department: sanitizeNullableText(rec.department),
      }
    })
    .filter((recipient) => Boolean(recipient.name) && Boolean(recipient.email))
}

function sanitizeHandoverRecipientsForJson(
  raw: Record<string, unknown>
): Prisma.InputJsonArray {
  const recipients = sanitizeHandoverRecipientsForResponse(raw)

  return recipients.map(
    (recipient): Prisma.InputJsonObject => ({
      id: recipient.id,
      name: recipient.name,
      email: recipient.email,
      personalNumber: recipient.personalNumber,
      department: recipient.department,
    })
  )
}

function getHandoverSendMetadataForJson(
  raw: Record<string, unknown>
): Pick<
  HandoverAgendaData,
  | "handoverRecipientsSentAt"
  | "handoverRecipientsSentByName"
  | "handoverRecipientsSentByEmail"
  | "handoverRecipientsSentHash"
  | "handoverRecipientsSentCount"
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
  }
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

  const handoverRecipients = sanitizeHandoverRecipientsForJson(raw)

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

  const handoverRecipients = sanitizeHandoverRecipientsForResponse(raw)

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

  return {
    ...nextHandover,
    handoverRecipientsSentAt:
      previousMetadata.handoverRecipientsSentAt ??
      (nextHandover.handoverRecipientsSentAt as string | null | undefined) ??
      null,
    handoverRecipientsSentByName:
      previousMetadata.handoverRecipientsSentByName ??
      (nextHandover.handoverRecipientsSentByName as
        | string
        | null
        | undefined) ??
      null,
    handoverRecipientsSentByEmail:
      previousMetadata.handoverRecipientsSentByEmail ??
      (nextHandover.handoverRecipientsSentByEmail as
        | string
        | null
        | undefined) ??
      null,
    handoverRecipientsSentHash:
      previousMetadata.handoverRecipientsSentHash ??
      (nextHandover.handoverRecipientsSentHash as
        | string
        | null
        | undefined) ??
      null,
    handoverRecipientsSentCount:
      previousMetadata.handoverRecipientsSentCount ??
      (nextHandover.handoverRecipientsSentCount as
        | number
        | null
        | undefined) ??
      null,
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
    const header = buildHeaderFromOff(off)

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
