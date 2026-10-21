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
  sendExitChecklistCompletedToEmployeeEmail,
  sendExitChecklistUnresolvedItemsEmail,
  sendHandoverKitt6Email,
  sendHandoverRecipientEmail,
} from "@/lib/email"
import {
  assetLabel,
  buildHeaderFromOff,
  computeHandoverSupersededNotifications,
  ExitChecklistTransactionError,
  getBaselineRecord,
  getOrCreateChecklist,
  handoverSummaryLabel,
  mapToExitChecklistData,
  preserveHandoverSendMetadata,
  resolutionLabel,
  resolveEditableField,
  sanitizeExitChecklistFilename,
  sanitizeHandoverForJson,
  sanitizeHrEditMarker,
  sanitizeIsoDate,
  sanitizeSignaturesForJson,
  sanitizeSignatureValueForJson,
  sanitizeText,
  toTriStateBoolean,
  trackSignatureChange,
  tryFetchExitChecklistPdfBuffer,
  withSerializableRetry,
} from "@/lib/exit-checklist"
import { getExitChecklistCompletionState } from "@/lib/exit-checklist-completion"
import { logExitChecklistEvent } from "@/lib/exit-checklist-events"
import {
  canAccessInternalApp,
  canAdminExitChecklist,
  canReadExitChecklist,
  canSignExitChecklist,
  isReadonlyRole,
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

function isSignatureValue(
  value: unknown
): value is ExitChecklistSignatureValue {
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

function getExistingSignatureRecipientsMetadata(
  currentHeader: Record<string, unknown>
): Prisma.InputJsonObject {
  return {
    signatureRecipients: Array.isArray(currentHeader.signatureRecipients)
      ? (currentHeader.signatureRecipients as Prisma.InputJsonValue)
      : [],
    signatureRecipientsSentAt:
      sanitizeText(currentHeader.signatureRecipientsSentAt) || null,
    signatureRecipientsSentByName:
      sanitizeText(currentHeader.signatureRecipientsSentByName) || null,
    signatureRecipientsSentByEmail:
      sanitizeText(currentHeader.signatureRecipientsSentByEmail) || null,
  }
}

async function requireExitChecklistRead() {
  const session = await getSession()
  const user = session?.user

  if (!user) {
    return {
      error: NextResponse.json(
        { status: "error", message: "Nejste přihlášeni." },
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
      { status: "error", message: "Nejste přihlášeni." },
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
  const canEditContent = canAdmin || isReadonlyRole(userRole)

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
  const { baseline, provided: baselineProvided } = getBaselineRecord(bodyRecord)
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

      await logExitChecklistEvent({
        checklistId: checklist.id,
        action: "UNLOCKED",
        by: userId,
        byName: user.name ?? user.email ?? null,
        byEmail: user.email ?? null,
        message: "Výstupní list byl odemknut pro úpravy.",
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

    const checklistId = checklist.id

    type TxOutcome = {
      updatedChecklist: NonNullable<
        Awaited<ReturnType<typeof getOrCreateChecklist>>
      >["checklist"]
      header: ReturnType<typeof buildHeaderFromOff>
      managerName: string | null
      managerPosition: string | null
      managerDepartment: string | null
      currentHeader: Record<string, unknown>
      currentHandover: unknown
      updatedHeader: Prisma.InputJsonObject
      handoverKitt6Cancellation: { email: string; target: string | null } | null
      handoverRecipientCancellations: { email: string; name: string }[]
      resolutionChanges: string[]
      unresolvedItems: {
        label: string
        organization: string
        note: string | null
      }[]
      unresolvedChanged: boolean
      assetsAddedLabels: string[]
      assetsUpdatedLabels: string[]
      assetsRemovedLabels: string[]
      signedLabels: string[]
      clearedLabels: string[]
      conflictOfInterestChanged: boolean
      conflictOfInterest: boolean | null
      handoverChanged: boolean
      nextHandoverSummary: string
    }

    const txOutcome = await withSerializableRetry<TxOutcome>(async (tx) => {
      const checklist = await tx.exitChecklist.findUnique({
        where: { id: checklistId },
        include: {
          items: true,
          assets: true,
          offboarding: true,
        },
      })

      if (!checklist) {
        throw new ExitChecklistTransactionError("NOT_FOUND")
      }

      if (checklist.lockedAt) {
        throw new ExitChecklistTransactionError("LOCKED")
      }

      const currentHeader = getJsonRecord(checklist.header)
      const currentHandover = currentHeader.handover
      const currentSignatures = getCurrentSignatures(currentHeader)

      const incomingSignatures = getJsonRecord(
        bodyRecord.signatures
      ) as unknown as ExitChecklistSignatures

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

      const signedLabels: string[] = []
      const clearedLabels: string[] = []

      const currentHandoverManagerSignature = normalizeCurrentSignatureValue(
        currentHeader.handoverManagerSignature
      )

      trackSignatureChange(
        "Podpis zaměstnance",
        currentSignatures.employee,
        signatures.employee,
        signedLabels,
        clearedLabels
      )
      trackSignatureChange(
        "Podpis vedoucího odboru",
        currentSignatures.manager,
        signatures.manager,
        signedLabels,
        clearedLabels
      )
      trackSignatureChange(
        "Podpis Odboru služeb",
        currentSignatures.issuer,
        signatures.issuer,
        signedLabels,
        clearedLabels
      )
      trackSignatureChange(
        "Podpis k předávané agendě",
        currentHandoverManagerSignature,
        handoverManagerSignature,
        signedLabels,
        clearedLabels
      )

      const sanitizedIncomingHandover = sanitizeHandoverForJson(
        bodyRecord.handover
      )
      const sanitizedCurrentHandover = sanitizeHandoverForJson(currentHandover)

      const handoverChangedByClient =
        canEditContent &&
        sanitizedIncomingHandover !== null &&
        (!baselineProvided ||
          JSON.stringify(sanitizedIncomingHandover) !==
            JSON.stringify(sanitizeHandoverForJson(baseline.handover)))

      const incomingHandover = handoverChangedByClient
        ? sanitizedIncomingHandover
        : sanitizedCurrentHandover

      const handover = preserveHandoverSendMetadata(
        incomingHandover,
        currentHandover
      )

      let finalHandover = handover
      let handoverKitt6Cancellation: {
        email: string
        target: string | null
      } | null = null
      let handoverRecipientCancellations: {
        email: string
        name: string
      }[] = []

      if (handover && Boolean(handoverManagerSignature?.signedAt)) {
        const superseded = computeHandoverSupersededNotifications(
          currentHandover,
          handover
        )
        finalHandover = superseded.handover
        handoverKitt6Cancellation = superseded.kitt6
        handoverRecipientCancellations = superseded.recipients
      }

      const existingConflictOfInterest = toTriStateBoolean(
        currentHeader.conflictOfInterest
      )

      const conflictOfInterest = resolveEditableField({
        canEdit: canEditContent,
        bodyValue: bodyRecord.conflictOfInterest,
        baselineValue: baseline.conflictOfInterest,
        baselineProvided,
        currentValue: existingConflictOfInterest,
        sanitizer: toTriStateBoolean,
      })

      const conflictOfInterestChanged =
        existingConflictOfInterest !== conflictOfInterest

      const noAssets = resolveEditableField({
        canEdit: canEditContent,
        bodyValue: bodyRecord.noAssets,
        baselineValue: baseline.noAssets,
        baselineProvided,
        currentValue: Boolean(currentHeader.noAssets),
        sanitizer: Boolean,
      })

      const previousHandoverSummary = handoverSummaryLabel(currentHandover)
      const nextHandoverSummary = handoverSummaryLabel(handover)
      const handoverChanged = previousHandoverSummary !== nextHandoverSummary

      const sanitizeTextOrNull = (value: unknown) => sanitizeText(value) || null

      const managerEmail = resolveEditableField({
        canEdit: canEditContent,
        bodyValue: bodyRecord.managerEmail,
        baselineValue: baseline.managerEmail,
        baselineProvided,
        currentValue: sanitizeTextOrNull(currentHeader.managerEmail),
        sanitizer: sanitizeTextOrNull,
      })

      const managerName = resolveEditableField({
        canEdit: canEditContent,
        bodyValue: bodyRecord.managerName,
        baselineValue: baseline.managerName,
        baselineProvided,
        currentValue: sanitizeTextOrNull(currentHeader.managerName),
        sanitizer: sanitizeTextOrNull,
      })

      const managerPosition = resolveEditableField({
        canEdit: canEditContent,
        bodyValue: bodyRecord.managerPosition,
        baselineValue: baseline.managerPosition,
        baselineProvided,
        currentValue: sanitizeTextOrNull(currentHeader.managerPosition),
        sanitizer: sanitizeTextOrNull,
      })

      const managerDepartment = resolveEditableField({
        canEdit: canEditContent,
        bodyValue: bodyRecord.managerDepartment,
        baselineValue: baseline.managerDepartment,
        baselineProvided,
        currentValue: sanitizeTextOrNull(currentHeader.managerDepartment),
        sanitizer: sanitizeTextOrNull,
      })

      const assetsEditedByHR = resolveEditableField({
        canEdit: canEditContent,
        bodyValue: bodyRecord.assetsEditedByHR,
        baselineValue: baseline.assetsEditedByHR,
        baselineProvided,
        currentValue: sanitizeHrEditMarker(currentHeader.assetsEditedByHR),
        sanitizer: sanitizeHrEditMarker,
      })

      const handoverEditedByHR = resolveEditableField({
        canEdit: canEditContent,
        bodyValue: bodyRecord.handoverEditedByHR,
        baselineValue: baseline.handoverEditedByHR,
        baselineProvided,
        currentValue: sanitizeHrEditMarker(currentHeader.handoverEditedByHR),
        sanitizer: sanitizeHrEditMarker,
      })

      const header = buildHeaderFromOff(checklist.offboarding)
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
        managerPosition,
        managerDepartment,
        conflictOfInterest,
        noAssets,
        handoverManagerSignature: sanitizeSignatureValueForJson(
          handoverManagerSignature
        ),
        assetsEditedByHR,
        handoverEditedByHR,
        handover: finalHandover,
        signatures: sanitizeSignaturesForJson(signatures),
        ...existingCompletionMetadata,
        ...getExistingSignatureRecipientsMetadata(currentHeader),
        sectionBResponsible: currentHeader.sectionBResponsible ?? null,
        kitt6OptionContact: currentHeader.kitt6OptionContact ?? null,
      }

      const resolutionChanges: string[] = []
      const unresolvedItems: {
        label: string
        organization: string
        note: string | null
      }[] = []
      let unresolvedChanged = false

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

        const isInactiveLawInfo =
          rowDef.key === "lawInfo" && !conflictOfInterest

        const resolution = isInactiveLawInfo
          ? ChecklistResolution.NOT_APPLICABLE
          : incoming && canTouchRow
            ? toResolution(incoming.resolved)
            : (existing?.resolution ?? ChecklistResolution.NOT_APPLICABLE)

        const signedByName = isInactiveLawInfo
          ? null
          : incoming && canTouchRow
            ? sanitizeText(incoming.signedByName) || null
            : (existing?.signedByName ?? null)

        const signedByEmail = isInactiveLawInfo
          ? null
          : incoming && canTouchRow
            ? sanitizeText(incoming.signedByEmail) || null
            : (existing?.signedByEmail ?? null)

        const signedAt = isInactiveLawInfo
          ? null
          : incoming && canTouchRow
            ? incoming.signedAt
              ? new Date(incoming.signedAt)
              : null
            : (existing?.signedAt ?? null)

        const note = isInactiveLawInfo
          ? null
          : incoming && canTouchRow
            ? sanitizeText(incoming.note) || null
            : (existing?.note ?? null)

        if (
          existing &&
          existing.resolution !== resolution &&
          !isInactiveLawInfo
        ) {
          resolutionChanges.push(
            `${rowDef.obligation}: ${resolutionLabel(resolution)}`
          )
        }

        if (resolution === ChecklistResolution.NO) {
          unresolvedItems.push({
            label: rowDef.obligation,
            organization: rowDef.organization,
            note,
          })

          if (
            existing?.resolution !== ChecklistResolution.NO ||
            (existing?.note ?? null) !== note
          ) {
            unresolvedChanged = true
          }
        }

        trackSignatureChange(
          rowDef.obligation,
          existing
            ? {
                signedAt: existing.signedAt,
                signedByEmail: existing.signedByEmail,
              }
            : null,
          { signedAt, signedByEmail },
          signedLabels,
          clearedLabels
        )

        await tx.exitChecklistItem.upsert({
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
            note,
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
            note,
            signedByName,
            signedByEmail,
            signedAt,
          },
        })
      }

      const assetsAddedLabels: string[] = []
      const assetsUpdatedLabels: string[] = []
      const assetsRemovedLabels: string[] = []

      if (canEditContent) {
        const existingAssets = await tx.exitChecklistAsset.findMany({
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

            const canTouchAsset = canAdmin || existing.createdById === userId

            if (!canTouchAsset) continue

            if (
              existing.subject !== subject ||
              existing.inventoryNumber !== inventoryNumber
            ) {
              assetsUpdatedLabels.push(assetLabel(subject, inventoryNumber))
            }

            await tx.exitChecklistAsset.update({
              where: { id: numericId },
              data: {
                subject,
                inventoryNumber,
              },
            })

            continue
          }

          await tx.exitChecklistAsset.create({
            data: {
              checklistId: checklist.id,
              subject,
              inventoryNumber,
              createdById: userId,
            },
          })
          assetsAddedLabels.push(assetLabel(subject, inventoryNumber))
        }

        const deletableAssets = existingAssets.filter(
          (asset) =>
            !seenExistingIds.has(asset.id) &&
            (canAdmin || asset.createdById === userId)
        )

        if (deletableAssets.length > 0) {
          await tx.exitChecklistAsset.deleteMany({
            where: {
              id: {
                in: deletableAssets.map((asset) => asset.id),
              },
            },
          })

          for (const asset of deletableAssets) {
            assetsRemovedLabels.push(
              assetLabel(asset.subject, asset.inventoryNumber)
            )
          }
        }
      }

      let nextLockedAt: Date | null = checklist.lockedAt ?? null
      let nextLockedById: string | null = checklist.lockedById ?? null

      if (lock && !nextLockedAt) {
        nextLockedAt = new Date()
        nextLockedById = userId
      }

      const updatedChecklist = await tx.exitChecklist.update({
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

      return {
        updatedChecklist,
        header,
        managerName,
        managerPosition,
        managerDepartment,
        currentHeader,
        currentHandover,
        updatedHeader,
        handoverKitt6Cancellation,
        handoverRecipientCancellations,
        resolutionChanges,
        unresolvedItems,
        unresolvedChanged,
        assetsAddedLabels,
        assetsUpdatedLabels,
        assetsRemovedLabels,
        signedLabels,
        clearedLabels,
        conflictOfInterestChanged,
        conflictOfInterest,
        handoverChanged,
        nextHandoverSummary,
      }
    })

    const {
      updatedChecklist,
      header,
      managerName,
      managerPosition,
      managerDepartment,
      currentHeader,
      currentHandover,
      updatedHeader,
      handoverKitt6Cancellation,
      handoverRecipientCancellations,
      resolutionChanges,
      unresolvedItems,
      unresolvedChanged,
      assetsAddedLabels,
      assetsUpdatedLabels,
      assetsRemovedLabels,
      signedLabels,
      clearedLabels,
      conflictOfInterestChanged,
      conflictOfInterest,
      handoverChanged,
      nextHandoverSummary,
    } = txOutcome

    if (
      handoverKitt6Cancellation ||
      handoverRecipientCancellations.length > 0
    ) {
      const handoverEmployeeDepartment = [header.department, header.unitName]
        .filter(Boolean)
        .join(" – ")
      const handoverEmploymentEndDate = header.employmentEndDate
        ? new Date(header.employmentEndDate).toLocaleDateString("cs-CZ")
        : ""
      const previousOption3Reason = sanitizeText(
        getJsonRecord(currentHandover).option3Reason
      )

      if (handoverKitt6Cancellation) {
        try {
          await sendHandoverKitt6Email({
            to: handoverKitt6Cancellation.email,
            employeeName: header.employeeName,
            employeePosition: header.positionName ?? "",
            employeeDepartment: handoverEmployeeDepartment,
            employmentEndDate: handoverEmploymentEndDate,
            targetPosition: handoverKitt6Cancellation.target || "neuvedeno",
            managerName,
            managerPosition,
            managerDepartment,
            cancelled: true,
          })
        } catch (error) {
          console.error(
            "[EXIT-CHECKLIST PUT] Zrušení předání na KITT6 se nepodařilo oznámit:",
            error
          )
        }
      }

      for (const recipient of handoverRecipientCancellations) {
        try {
          await sendHandoverRecipientEmail({
            to: recipient.email,
            employeeName: header.employeeName,
            employeePosition: header.positionName ?? "",
            employeeDepartment: handoverEmployeeDepartment,
            employmentEndDate: handoverEmploymentEndDate,
            option3Reason: previousOption3Reason || null,
            managerName,
            managerPosition,
            managerDepartment,
            cancelled: true,
          })
        } catch (error) {
          console.error(
            "[EXIT-CHECKLIST PUT] Zrušení odpovědnosti za agendu se nepodařilo oznámit:",
            error
          )
        }
      }
    }

    const actorInfo = {
      by: userId,
      byName: user.name ?? user.email ?? null,
      byEmail: user.email ?? null,
    }

    if (lock && !checklist.lockedAt) {
      await logExitChecklistEvent({
        checklistId: checklist.id,
        action: "LOCKED",
        ...actorInfo,
        message: "Výstupní list byl uzamčen.",
      })
    } else {
      const headerChanges: string[] = []

      if (conflictOfInterestChanged) {
        headerChanges.push(
          `Střet zájmů: ${
            conflictOfInterest === true
              ? "ano"
              : conflictOfInterest === false
                ? "ne"
                : "nerozhodnuto"
          }`
        )
      }

      if (handoverChanged) {
        headerChanges.push(`Předávaná agenda: ${nextHandoverSummary}`)
      }

      const summaryParts: string[] = []

      if (resolutionChanges.length > 0) {
        summaryParts.push(`Vyplněno: ${resolutionChanges.join("; ")}.`)
      }

      if (headerChanges.length > 0) {
        summaryParts.push(`${headerChanges.join("; ")}.`)
      }

      await logExitChecklistEvent({
        checklistId: checklist.id,
        action: "UPDATED",
        ...actorInfo,
        message:
          summaryParts.length > 0
            ? summaryParts.join(" ")
            : "Výstupní list byl uložen (bez věcné změny položek nebo hlavičky).",
      })
    }

    if (assetsAddedLabels.length > 0) {
      await logExitChecklistEvent({
        checklistId: checklist.id,
        action: "ASSET_ADDED",
        ...actorInfo,
        message: `Přidáno k vrácení: ${assetsAddedLabels.join(", ")}.`,
      })
    }

    if (assetsUpdatedLabels.length > 0) {
      await logExitChecklistEvent({
        checklistId: checklist.id,
        action: "ASSET_UPDATED",
        ...actorInfo,
        message: `Upraveno k vrácení: ${assetsUpdatedLabels.join(", ")}.`,
      })
    }

    if (signedLabels.length > 0) {
      await logExitChecklistEvent({
        checklistId: checklist.id,
        action: "ITEM_SIGNED",
        ...actorInfo,
        message: `Elektronicky podepsáno: ${signedLabels.join(", ")}.`,
      })
    }

    if (clearedLabels.length > 0) {
      await logExitChecklistEvent({
        checklistId: checklist.id,
        action: "ITEM_SIGNATURE_CLEARED",
        ...actorInfo,
        message: `Zrušen elektronický podpis: ${clearedLabels.join(", ")}.`,
      })
    }

    if (assetsRemovedLabels.length > 0) {
      await logExitChecklistEvent({
        checklistId: checklist.id,
        action: "ASSET_REMOVED",
        ...actorInfo,
        message: `Odebráno z vrácení: ${assetsRemovedLabels.join(", ")}.`,
      })
    }

    let data = mapToExitChecklistData(
      updatedChecklist.offboarding,
      updatedChecklist
    )
    const completion = getExitChecklistCompletionState(data)

    const alreadyNotified = Boolean(
      sanitizeText(currentHeader.completedNotificationSentAt)
    )

    if (completion.isComplete && !alreadyNotified) {
      const recipients = getHrRecipientsFromEnv()
      const baseUrl = getAppBaseUrl()

      if (recipients.length > 0 && baseUrl) {
        try {
          const pdfBuffer = await tryFetchExitChecklistPdfBuffer({
            cookie: req.headers.get("cookie") ?? "",
            baseUrl,
            offboardingId,
          })

          const employeeEmail =
            updatedChecklist.offboarding.userEmail?.trim() || null
          let employeeNotified = false

          if (employeeEmail) {
            try {
              await sendExitChecklistCompletedToEmployeeEmail({
                to: employeeEmail,
                employeeName: data.employeeName,
              })
              employeeNotified = true
            } catch (employeeEmailError) {
              console.warn(
                "[EXIT-CHECKLIST PUT] Informační e-mail zaměstnanci se nepodařilo odeslat:",
                employeeEmailError
              )
            }
          }

          await sendExitChecklistCompletedEmail({
            to: recipients,
            employeeName: data.employeeName,
            employeePosition: updatedChecklist.offboarding.positionName ?? "",
            employeeDepartment: [data.department, data.unitName]
              .filter(Boolean)
              .join(" – "),
            employmentEndDate:
              updatedChecklist.offboarding.actualEnd ??
              updatedChecklist.offboarding.plannedEnd ??
              data.employmentEndDate,
            completedByName: user.name ?? user.email ?? null,
            checklistUrl: `${baseUrl}/odchody/${offboardingId}/vystupni-list`,
            pdfBuffer,
            pdfFilename: pdfBuffer
              ? `Vystupni-list-${sanitizeExitChecklistFilename(data.employeeName || String(offboardingId))}.pdf`
              : null,
            employeeNotified,
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

          data = mapToExitChecklistData(
            completedChecklist.offboarding,
            completedChecklist
          )
        } catch (emailError) {
          console.warn(
            "[EXIT-CHECKLIST PUT] Výstupní list je dokončený, ale HR e-mail se nepodařilo odeslat:",
            emailError
          )
        }
      }
    }

    if (unresolvedChanged && unresolvedItems.length > 0) {
      const unresolvedRecipients = getHrRecipientsFromEnv()
      const baseUrl = getAppBaseUrl()

      if (unresolvedRecipients.length > 0) {
        try {
          const unresolvedEndDate =
            updatedChecklist.offboarding.actualEnd ??
            updatedChecklist.offboarding.plannedEnd
          await sendExitChecklistUnresolvedItemsEmail({
            to: unresolvedRecipients,
            employeeName: data.employeeName,
            employeePosition: updatedChecklist.offboarding.positionName ?? "",
            employeeDepartment: [data.department, data.unitName]
              .filter(Boolean)
              .join(" – "),
            employmentEndDate: unresolvedEndDate
              ? new Date(unresolvedEndDate).toLocaleDateString("cs-CZ")
              : sanitizeText(data.employmentEndDate),
            items: unresolvedItems,
            checklistUrl: baseUrl
              ? `${baseUrl}/odchody/${offboardingId}/vystupni-list`
              : null,
          })
        } catch (emailError) {
          console.warn(
            "[EXIT-CHECKLIST PUT] Souhrn nevyrovnaných položek se nepodařilo odeslat:",
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
    if (error instanceof ExitChecklistTransactionError) {
      if (error.code === "LOCKED") {
        return NextResponse.json(
          {
            status: "error",
            message:
              "Výstupní list je uzamčený. Pro další úpravy ho nejdříve odemkněte.",
          },
          { status: 423 }
        )
      }

      return NextResponse.json(
        { status: "error", message: "Odchod nenalezen." },
        { status: 404 }
      )
    }

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
