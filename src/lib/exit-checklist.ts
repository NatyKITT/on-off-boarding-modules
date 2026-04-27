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
): "KITT6" | "OSSL_KT" | null {
  if (value === "KITT6" || value === "OSSL_KT") return value
  return null
}

export function sanitizeIsoDate(value: unknown): string {
  const text = sanitizeText(value)
  if (!text) return ""

  const d = new Date(text)
  if (Number.isNaN(d.getTime())) return ""

  return d.toISOString().slice(0, 10)
}

export function sanitizeSignatureValueForJson(
  value: unknown
): Prisma.InputJsonObject {
  const raw =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {}

  return {
    signedByName: sanitizeText(raw.signedByName),
    signedByEmail: sanitizeText(raw.signedByEmail),
    signedAt: sanitizeText(raw.signedAt),
  }
}

export function sanitizeSignatureValueForResponse(
  value: unknown
): ExitChecklistSignatureValue {
  const raw =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {}

  return {
    signedByName: sanitizeText(raw.signedByName) || null,
    signedByEmail: sanitizeText(raw.signedByEmail) || null,
    signedAt: sanitizeText(raw.signedAt) || null,
  }
}

export function sanitizeHandoverForJson(
  value: unknown
): Prisma.InputJsonObject | null {
  if (!value || typeof value !== "object") return null

  const raw = value as Record<string, unknown>
  const includeHandoverAgenda = Boolean(raw.includeHandoverAgenda)

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

  return {
    includeHandoverAgenda: true,
    option1,
    option2,
    option2Target,
    option2TargetPositionNum,
    option3,
    option3Reason,
    responsibleParty,
  }
}

export function sanitizeHandoverForResponse(
  value: unknown
): HandoverAgendaData | undefined {
  if (!value || typeof value !== "object") return undefined

  const raw = value as Record<string, unknown>
  const includeHandoverAgenda = Boolean(raw.includeHandoverAgenda)

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
    }
  }

  const option1 = Boolean(raw.option1)
  const option2 = Boolean(raw.option2)
  const option3 = Boolean(raw.option3)

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
  }
}

export function sanitizeSignaturesForJson(
  value: unknown
): Prisma.InputJsonObject {
  const raw =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {}

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
  const raw =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {}

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
    (a: ExitChecklistAssetModel) => ({
      id: String(a.id),
      subject: a.subject,
      inventoryNumber: a.inventoryNumber ?? "",
      createdById: a.createdById ?? null,
    })
  )

  const headerData =
    checklist.header && typeof checklist.header === "object"
      ? (checklist.header as Record<string, unknown>)
      : {}

  const handover = sanitizeHandoverForResponse(headerData.handover)
  const signatures = sanitizeSignaturesForResponse(headerData.signatures)

  return {
    id: checklist.id,
    offboardingId: off.id,
    employeeName: header.employeeName,
    personalNumber: header.personalNumber,
    department: header.department,
    unitName: header.unitName,
    employmentEndDate: header.employmentEndDate,
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
