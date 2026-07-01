import { NextRequest, NextResponse } from "next/server"
import {
  ChecklistResolution,
  Prisma,
  type ExitChecklistAsset as ExitChecklistAssetModel,
} from "@prisma/client"

import type {
  ExitAssetItem,
  ExitChecklistItem,
  ExitChecklistSignatures,
  ExitChecklistSignatureValue,
} from "@/types/exit-checklist"
import { EXIT_CHECKLIST_ROWS } from "@/config/exit-checklist-rows"

import { prisma } from "@/lib/db"
import {
  getHrRecipientsFromEnv,
  sendExitChecklistCompletedEmail,
} from "@/lib/email"
import {
  buildHeaderFromOff,
  getOrCreateChecklist,
  mapToExitChecklistData,
  preserveHandoverSendMetadata,
  sanitizeHandoverForJson,
  sanitizeIsoDate,
  sanitizeSignaturesForJson,
  sanitizeSignatureValueForJson,
  sanitizeText,
} from "@/lib/exit-checklist"
import { getExitChecklistCompletionState } from "@/lib/exit-checklist-completion"
import {
  canAccessInternalApp,
  canAdminExitChecklist,
  canReadExitChecklist,
  canSignExitChecklist,
} from "@/lib/rbac"
import { getSession } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

function getJsonRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  return value as Record<string, unknown>
}

function getAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    ""
  ).replace(/\/$/, "")
}

function normalizeEmail(value?: string | null) {
  return sanitizeText(value).toLowerCase()
}

function toResolution(value: ExitChecklistItem["resolved"]) {
  if (value === "YES") return ChecklistResolution.YES
  if (value === "NO") return ChecklistResolution.NO

  return ChecklistResolution.NOT_APPLICABLE
}

function canOverwriteSignature(
  existing: {
    signedByEmail: string | null
    signedAt: Date | null
  },
  currentUserEmail: string | null | undefined,
  canAdmin: boolean
) {
  if (!existing.signedAt) return true
  if (canAdmin) return true
  if (!currentUserEmail) return false

  return (
    normalizeEmail(existing.signedByEmail) === normalizeEmail(currentUserEmail)
  )
}

function isSignatureValue(value: unknown): value is ExitChecklistSignatureValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false

  const record = value as Record<string, unknown>

  return (
    "signedByName" in record ||
    "signedByEmail" in record ||
    "signedAt" in record
  )
}

function normalizeCurrentSignatureValue(
  value: unknown
): ExitChecklistSignatureValue {
  const record = getJsonRecord(value)

  return {
    signedByName: sanitizeText(record.signedByName) || null,
    signedByEmail: sanitizeText(record.signedByEmail) || null,
    signedAt: sanitizeText(record.signedAt) || null,
  }
}

function normalizeProtectedSignatureValue(
  incoming: ExitChecklistSignatureValue | undefined,
  existing: ExitChecklistSignatureValue,
  currentUserEmail: string | null | undefined,
  canAdmin: boolean
): ExitChecklistSignatureValue {
  if (!incoming) return existing

  const existingIsSigned = Boolean(existing.signedAt)

  const canTouch =
    !existingIsSigned ||
    canAdmin ||
    Boolean(
      currentUserEmail &&
      existing.signedByEmail &&
      normalizeEmail(existing.signedByEmail) ===
      normalizeEmail(currentUserEmail)
    )

  if (!canTouch) return existing

  return {
    signedByName: sanitizeText(incoming.signedByName) || null,
    signedByEmail: sanitizeText(incoming.signedByEmail) || null,
    signedAt: sanitizeText(incoming.signedAt) || null,
  }
}

function getCurrentSignatures(currentHeader: Record<string, unknown>) {
  const currentSignaturesRaw = getJsonRecord(currentHeader.signatures)

  return {
    employee: normalizeCurrentSignatureValue(currentSignaturesRaw.employee),
    manager: normalizeCurrentSignatureValue(currentSignaturesRaw.manager),
    issuer: normalizeCurrentSignatureValue(currentSignaturesRaw.issuer),
    issuedDate: sanitizeIsoDate(currentSignaturesRaw.issuedDate),
    managerEmail: sanitizeText(currentSignaturesRaw.managerEmail) || null,
  } satisfies ExitChecklistSignatures
}

function buildNextSignatures(args: {
  incoming: ExitChecklistSignatures
  current: ExitChecklistSignatures
  currentUserEmail: string | null | undefined
  canAdmin: boolean
}): ExitChecklistSignatures {
  return {
    employee: normalizeProtectedSignatureValue(
      args.incoming.employee,
      args.current.employee,
      args.currentUserEmail,
      args.canAdmin
    ),
    manager: normalizeProtectedSignatureValue(
      args.incoming.manager,
      args.current.manager,
      args.currentUserEmail,
      args.canAdmin
    ),
    issuer: normalizeProtectedSignatureValue(
      args.incoming.issuer,
      args.current.issuer,
      args.currentUserEmail,
      args.canAdmin
    ),
    issuedDate: sanitizeIsoDate(
      args.incoming.issuedDate || args.current.issuedDate
    ),
    managerEmail: args.current.managerEmail ?? null,
  }
}

function buildNextHandoverManagerSignature(args: {
  incoming: unknown
  currentHeader: Record<string, unknown>
  currentUserEmail: string | null | undefined
  canAdmin: boolean
}) {
  const current = normalizeCurrentSignatureValue(
    args.currentHeader.handoverManagerSignature
  )

  const incoming = isSignatureValue(args.incoming) ? args.incoming : undefined

  return normalizeProtectedSignatureValue(
    incoming,
    current,
    args.currentUserEmail,
    args.canAdmin
  )
}

function getExistingCompletionMetadata(
  currentHeader: Record<string, unknown>
): Prisma.InputJsonObject {
  return {
    completedAt: sanitizeText(currentHeader.completedAt) || null,
    completedNotificationSentAt:
      sanitizeText(currentHeader.completedNotificationSentAt) || null,
    completedNotificationSentByName:
      sanitizeText(currentHeader.completedNotificationSentByName) || null,
    completedNotificationSentByEmail:
      sanitizeText(currentHeader.completedNotificationSentByEmail) || null,
    completedNotificationSentTo:
      sanitizeText(currentHeader.completedNotificationSentTo) || null,
  }
}

async function requireExitChecklistRead() {
  const session = await getSession()
  const user = session?.user

  if (!user) {
    return {
      error: NextResponse.json(
        { status: "error", message: "Nejste přihlášen(a)." },
        { status: 401 }
      ),
    }
  }

  const role = user.role ?? "USER"
  const canRead = canAccessInternalApp(role) && canReadExitChecklist(role)

  if (!canRead) {
    return {
      error: NextResponse.json(
        { status: "error", message: "Nemáte oprávnění číst výstupní list." },
        { status: 403 }
      ),
    }
  }

  return { user }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireExitChecklistRead()

  if ("error" in authResult) {
    return authResult.error
  }

  const offboardingId = Number(params.id)

  if (Number.isNaN(offboardingId)) {
    return NextResponse.json(
      { status: "error", message: "Neplatné ID odchodu." },
      { status: 400 }
    )
  }

  try {
    const result = await getOrCreateChecklist(offboardingId)

    if (!result) {
      return NextResponse.json(
        { status: "error", message: "Odchod nenalezen." },
        { status: 404 }
      )
    }

    const { off, checklist } = result
    const data = mapToExitChecklistData(off, checklist)

    return NextResponse.json({
      status: "success",
      data,
      completion: getExitChecklistCompletionState(data),
    })
  } catch (error) {
    console.error("[EXIT-CHECKLIST GET] Error:", error)

    return NextResponse.json(
      {
        status: "error",
        message: "Chyba při načítání výstupního listu.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const offboardingId = Number(params.id)

  if (Number.isNaN(offboardingId)) {
    return NextResponse.json(
      { status: "error", message: "Neplatné ID odchodu." },
      { status: 400 }
    )
  }

  const session = await getSession()
  const user = session?.user

  if (!user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášen(a)." },
      { status: 401 }
    )
  }

  const userId = user.id ?? null
  const userRole = user.role ?? "USER"

  if (!canAccessInternalApp(userRole)) {
    return NextResponse.json(
      {
        status: "error",
        message: "Nemáte přístup do interní části výstupního listu.",
      },
      { status: 403 }
    )
  }

  const canAdmin = canAdminExitChecklist(userRole)
  const canSign = canSignExitChecklist(userRole)

  if (!canSign) {
    return NextResponse.json(
      { status: "error", message: "Nemáte oprávnění podepisovat." },
      { status: 403 }
    )
  }

  const body = await req.json().catch(() => null)

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { status: "error", message: "Chybí tělo požadavku." },
      { status: 400 }
    )
  }

  const bodyRecord = body as Record<string, unknown>
  const lock = Boolean(bodyRecord.lock)
  const unlock = Boolean(bodyRecord.unlock)

  if (lock && unlock) {
    return NextResponse.json(
      {
        status: "error",
        message: "Nelze současně uzamknout i odemknout výstupní list.",
      },
      { status: 400 }
    )
  }

  if (lock && !canAdmin) {
    return NextResponse.json(
      { status: "error", message: "Nemáte oprávnění uzamknout formulář." },
      { status: 403 }
    )
  }

  if (unlock && !canAdmin) {
    return NextResponse.json(
      { status: "error", message: "Nemáte oprávnění odemknout formulář." },
      { status: 403 }
    )
  }

  try {
    const result = await getOrCreateChecklist(offboardingId)

    if (!result) {
      return NextResponse.json(
        { status: "error", message: "Odchod nenalezen." },
        { status: 404 }
      )
    }

    const { off, checklist } = result

    if (unlock) {
      const unlockedChecklist = await prisma.exitChecklist.update({
        where: { id: checklist.id },
        data: {
          lockedAt: null,
          lockedById: null,
        },
        include: {
          items: true,
          assets: true,
          offboarding: true,
        },
      })

      const data = mapToExitChecklistData(off, unlockedChecklist)

      return NextResponse.json({
        status: "success",
        message: "Výstupní list byl odemknut pro úpravy.",
        data,
        completion: getExitChecklistCompletionState(data),
      })
    }

    if (checklist.lockedAt) {
      return NextResponse.json(
        {
          status: "error",
          message:
            "Výstupní list je uzamčený. Pro další úpravy ho nejdříve odemkněte.",
        },
        { status: 423 }
      )
    }

    const items = (
      Array.isArray(bodyRecord.items) ? bodyRecord.items : []
    ) as ExitChecklistItem[]

    const assets = (
      Array.isArray(bodyRecord.assets) ? bodyRecord.assets : []
    ) as ExitAssetItem[]

    const currentHeader = getJsonRecord(checklist.header)
    const currentHandover = currentHeader.handover
    const currentSignatures = getCurrentSignatures(currentHeader)

    const incomingSignatures =
      getJsonRecord(bodyRecord.signatures) as unknown as ExitChecklistSignatures

    const signatures = buildNextSignatures({
      incoming: incomingSignatures,
      current: currentSignatures,
      currentUserEmail: user.email,
      canAdmin,
    })

    const handoverManagerSignature = buildNextHandoverManagerSignature({
      incoming: bodyRecord.handoverManagerSignature,
      currentHeader,
      currentUserEmail: user.email,
      canAdmin,
    })

    const incomingHandover = canAdmin
      ? sanitizeHandoverForJson(bodyRecord.handover) ??
      sanitizeHandoverForJson(currentHandover)
      : sanitizeHandoverForJson(currentHandover)

    const handover = preserveHandoverSendMetadata(
      incomingHandover,
      currentHandover
    )

    const existingConflictOfInterest = Boolean(currentHeader.conflictOfInterest)

    const conflictOfInterest = canAdmin
      ? Boolean(bodyRecord.conflictOfInterest)
      : existingConflictOfInterest

    const managerEmail = canAdmin
      ? sanitizeText(bodyRecord.managerEmail) ||
      sanitizeText(currentHeader.managerEmail) ||
      null
      : sanitizeText(currentHeader.managerEmail) || null

    const managerName = canAdmin
      ? sanitizeText(bodyRecord.managerName) ||
      sanitizeText(currentHeader.managerName) ||
      null
      : sanitizeText(currentHeader.managerName) || null

    const header = buildHeaderFromOff(off)
    const existingCompletionMetadata =
      getExistingCompletionMetadata(currentHeader)

    const updatedHeader: Prisma.InputJsonObject = {
      employeeName: header.employeeName,
      personalNumber: header.personalNumber,
      department: header.department,
      unitName: header.unitName,
      employmentEndDate: header.employmentEndDate,
      managerEmail,
      managerName,
      conflictOfInterest,
      handoverManagerSignature: sanitizeSignatureValueForJson(
        handoverManagerSignature
      ),
      handover,
      signatures: sanitizeSignaturesForJson(signatures),
      ...existingCompletionMetadata,
    }

    for (let index = 0; index < EXIT_CHECKLIST_ROWS.length; index++) {
      const rowDef = EXIT_CHECKLIST_ROWS[index]
      const incoming = items.find((item) => item.key === rowDef.key)
      const existing = checklist.items.find((item) => item.key === rowDef.key)

      const canTouchRow = canOverwriteSignature(
        {
          signedByEmail: existing?.signedByEmail ?? null,
          signedAt: existing?.signedAt ?? null,
        },
        user.email,
        canAdmin
      )

      const isInactiveLawInfo = rowDef.key === "lawInfo" && !conflictOfInterest

      const resolution = isInactiveLawInfo
        ? ChecklistResolution.NOT_APPLICABLE
        : incoming && canTouchRow
          ? toResolution(incoming.resolved)
          : existing?.resolution ?? ChecklistResolution.NOT_APPLICABLE

      const signedByName = isInactiveLawInfo
        ? null
        : incoming && canTouchRow
          ? sanitizeText(incoming.signedByName) || null
          : existing?.signedByName ?? null

      const signedByEmail = isInactiveLawInfo
        ? null
        : incoming && canTouchRow
          ? sanitizeText(incoming.signedByEmail) || null
          : existing?.signedByEmail ?? null

      const signedAt = isInactiveLawInfo
        ? null
        : incoming && canTouchRow
          ? incoming.signedAt
            ? new Date(incoming.signedAt)
            : null
          : existing?.signedAt ?? null

      await prisma.exitChecklistItem.upsert({
        where: {
          checklistId_key: {
            checklistId: checklist.id,
            key: rowDef.key,
          },
        },
        update: {
          department: rowDef.organization,
          label: rowDef.obligation,
          order: index,
          resolution,
          signedByName,
          signedByEmail,
          signedAt,
        },
        create: {
          checklistId: checklist.id,
          key: rowDef.key,
          department: rowDef.organization,
          label: rowDef.obligation,
          order: index,
          resolution,
          signedByName,
          signedByEmail,
          signedAt,
        },
      })
    }

    if (canAdmin) {
      const existingAssets = await prisma.exitChecklistAsset.findMany({
        where: { checklistId: checklist.id },
      })

      const existingById = new Map<number, ExitChecklistAssetModel>(
        existingAssets.map((asset) => [asset.id, asset])
      )

      const seenExistingIds = new Set<number>()

      for (const asset of assets) {
        const subject = sanitizeText(asset.subject)
        const inventoryNumber = sanitizeText(asset.inventoryNumber) || null

        if (!subject && !inventoryNumber) continue

        const numericId = Number(asset.id)

        if (!Number.isNaN(numericId)) {
          const existing = existingById.get(numericId)

          if (!existing) continue

          seenExistingIds.add(numericId)

          await prisma.exitChecklistAsset.update({
            where: { id: numericId },
            data: {
              subject,
              inventoryNumber,
            },
          })

          continue
        }

        await prisma.exitChecklistAsset.create({
          data: {
            checklistId: checklist.id,
            subject,
            inventoryNumber,
            createdById: userId,
          },
        })
      }

      const deletableIds = existingAssets
        .filter((asset) => !seenExistingIds.has(asset.id))
        .map((asset) => asset.id)

      if (deletableIds.length > 0) {
        await prisma.exitChecklistAsset.deleteMany({
          where: {
            id: {
              in: deletableIds,
            },
          },
        })
      }
    }

    let nextLockedAt: Date | null = checklist.lockedAt ?? null
    let nextLockedById: string | null = checklist.lockedById ?? null

    if (lock && !nextLockedAt) {
      nextLockedAt = new Date()
      nextLockedById = userId
    }

    const updatedChecklist = await prisma.exitChecklist.update({
      where: { id: checklist.id },
      data: {
        header: updatedHeader,
        lockedAt: nextLockedAt,
        lockedById: nextLockedById,
      },
      include: {
        items: true,
        assets: true,
        offboarding: true,
      },
    })

    let data = mapToExitChecklistData(off, updatedChecklist)
    const completion = getExitChecklistCompletionState(data)

    const alreadyNotified = Boolean(
      sanitizeText(currentHeader.completedNotificationSentAt)
    )

    if (completion.isComplete && !alreadyNotified) {
      const recipients = getHrRecipientsFromEnv()
      const baseUrl = getAppBaseUrl()

      if (recipients.length > 0 && baseUrl) {
        try {
          await sendExitChecklistCompletedEmail({
            to: recipients,
            employeeName: data.employeeName,
            employeePosition: off.positionName ?? "",
            employeeDepartment: [data.department, data.unitName]
              .filter(Boolean)
              .join(" – "),
            employmentEndDate:
              off.actualEnd ?? off.plannedEnd ?? data.employmentEndDate,
            completedByName: user.name ?? user.email ?? null,
            checklistUrl: `${baseUrl}/odchody/${offboardingId}/vystupni-list`,
          })

          const completedAt = new Date().toISOString()
          const headerWithCompletedNotification: Prisma.InputJsonObject = {
            ...updatedHeader,
            completedAt,
            completedNotificationSentAt: completedAt,
            completedNotificationSentByName: user.name ?? user.email ?? null,
            completedNotificationSentByEmail: user.email ?? null,
            completedNotificationSentTo: recipients.join(", "),
          }

          const completedChecklist = await prisma.exitChecklist.update({
            where: { id: checklist.id },
            data: {
              header: headerWithCompletedNotification,
            },
            include: {
              items: true,
              assets: true,
              offboarding: true,
            },
          })

          data = mapToExitChecklistData(off, completedChecklist)
        } catch (emailError) {
          console.warn(
            "[EXIT-CHECKLIST PUT] Výstupní list je dokončený, ale HR e-mail se nepodařilo odeslat:",
            emailError
          )
        }
      }
    }

    return NextResponse.json({
      status: "success",
      data,
      completion,
    })
  } catch (error) {
    console.error("[EXIT-CHECKLIST PUT] Error:", error)

    return NextResponse.json(
      {
        status: "error",
        message: "Chyba při ukládání výstupního listu.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
