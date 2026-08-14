import { NextRequest, NextResponse } from "next/server"
import { ChecklistResolution, Prisma } from "@prisma/client"

import type {
  ExitAssetItem,
  ExitChecklistData,
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
} from "@/lib/email"
import {
  assetLabel,
  buildHeaderFromOff,
  getChecklistByPublicToken,
  handoverSummaryLabel,
  isPraha6OrKitt6,
  mapToExitChecklistData,
  preserveHandoverSendMetadata,
  resolutionLabel,
  sanitizeExitChecklistFilename,
  sanitizeHandoverForJson,
  sanitizeIsoDate,
  sanitizeSignaturesForJson,
  sanitizeSignatureValueForJson,
  sanitizeText,
  trackSignatureChange,
  tryFetchExitChecklistPdfBuffer,
} from "@/lib/exit-checklist"
import { getExitChecklistCompletionState } from "@/lib/exit-checklist-completion"
import { logExitChecklistEvent } from "@/lib/exit-checklist-events"
import {
  canAdminExitChecklist,
  canReadExitChecklist,
  canSignExitChecklist,
} from "@/lib/rbac"
import { getSession } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

function toResolution(value: ExitChecklistItem["resolved"]) {
  if (value === "YES") return ChecklistResolution.YES
  if (value === "NO") return ChecklistResolution.NO

  return ChecklistResolution.NOT_APPLICABLE
}

function getJsonRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  return value as Record<string, unknown>
}

function getAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    ""
  ).replace(/\/$/, "")
}

function normalizeEmail(value?: string | null) {
  return sanitizeText(value).toLowerCase()
}

function canOverwriteSignature(
  existing: {
    signedByEmail: string | null
    signedAt: Date | null
  },
  currentUserEmail: string,
  canAdmin: boolean
) {
  if (!existing.signedAt) return true
  if (canAdmin) return true

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
  currentUserEmail: string,
  canAdmin: boolean
): ExitChecklistSignatureValue {
  if (!incoming) return existing

  const existingIsSigned = Boolean(existing.signedAt)

  const canTouch =
    !existingIsSigned ||
    canAdmin ||
    Boolean(
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
  currentUserEmail: string
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
  currentUserEmail: string
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

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const session = await getSession()
  const user = session?.user

  if (!user?.email || !isPraha6OrKitt6(user.email)) {
    return NextResponse.json(
      { status: "error", message: "Nemáte oprávnění k této stránce." },
      { status: 403 }
    )
  }

  if (!canReadExitChecklist(user.role ?? "USER")) {
    return NextResponse.json(
      { status: "error", message: "Nemáte oprávnění číst výstupní list." },
      { status: 403 }
    )
  }

  const checklist = await getChecklistByPublicToken(params.token)

  if (!checklist) {
    return NextResponse.json(
      { status: "error", message: "Výstupní list nebyl nalezen." },
      { status: 404 }
    )
  }

  const data = mapToExitChecklistData(checklist.offboarding, checklist)

  return NextResponse.json({
    status: "success",
    data,
    completion: getExitChecklistCompletionState(data),
  })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const session = await getSession()
  const user = session?.user

  if (!user?.email || !isPraha6OrKitt6(user.email)) {
    return NextResponse.json(
      { status: "error", message: "Nemáte oprávnění k této stránce." },
      { status: 403 }
    )
  }

  const role = user.role ?? "USER"
  const canSign = canSignExitChecklist(role)
  const canAdmin = canAdminExitChecklist(role)
  const canEditContent = canAdmin || canSign

  if (!canSign) {
    return NextResponse.json(
      {
        status: "error",
        message: "Nemáte oprávnění podepisovat výstupní list.",
      },
      { status: 403 }
    )
  }

  const checklist = await getChecklistByPublicToken(params.token)

  if (!checklist) {
    return NextResponse.json(
      { status: "error", message: "Výstupní list nebyl nalezen." },
      { status: 404 }
    )
  }

  if (checklist.lockedAt) {
    return NextResponse.json(
      {
        status: "error",
        message:
          "Výstupní list je uzamčený. Změny už nelze uložit; je možné pouze zobrazit nebo vygenerovat PDF.",
      },
      { status: 423 }
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

  const items = (
    Array.isArray(bodyRecord.items) ? bodyRecord.items : []
  ) as ExitChecklistItem[]

  const assets = (
    Array.isArray(bodyRecord.assets) ? bodyRecord.assets : []
  ) as ExitAssetItem[]

  const currentHeader = getJsonRecord(checklist.header)
  const currentHandover = currentHeader.handover
  const currentSignatures = getCurrentSignatures(currentHeader)

  const incomingSignatures = getJsonRecord(
    bodyRecord.signatures
  ) as unknown as ExitChecklistSignatures

  const nextSignatures = buildNextSignatures({
    incoming: incomingSignatures,
    current: currentSignatures,
    currentUserEmail: user.email,
    canAdmin,
  })

  const nextHandoverManagerSignature = buildNextHandoverManagerSignature({
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
    nextSignatures.employee,
    signedLabels,
    clearedLabels
  )
  trackSignatureChange(
    "Podpis vedoucího odboru",
    currentSignatures.manager,
    nextSignatures.manager,
    signedLabels,
    clearedLabels
  )
  trackSignatureChange(
    "Podpis Odboru služeb",
    currentSignatures.issuer,
    nextSignatures.issuer,
    signedLabels,
    clearedLabels
  )
  trackSignatureChange(
    "Podpis k předávané agendě",
    currentHandoverManagerSignature,
    nextHandoverManagerSignature,
    signedLabels,
    clearedLabels
  )

  const existingConflictOfInterest = Boolean(currentHeader.conflictOfInterest)

  const conflictOfInterest = canAdmin
    ? Boolean(bodyRecord.conflictOfInterest)
    : existingConflictOfInterest

  const conflictOfInterestChanged =
    existingConflictOfInterest !== conflictOfInterest

  const incomingHandover = canEditContent
    ? (sanitizeHandoverForJson(bodyRecord.handover) ??
      sanitizeHandoverForJson(currentHandover))
    : sanitizeHandoverForJson(currentHandover)

  const handover = preserveHandoverSendMetadata(
    incomingHandover,
    currentHandover
  )

  const previousHandoverSummary = handoverSummaryLabel(currentHandover)
  const nextHandoverSummary = handoverSummaryLabel(handover)
  const handoverChanged = previousHandoverSummary !== nextHandoverSummary

  const resolutionChanges: string[] = []

  try {
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

      if (
        existing &&
        existing.resolution !== resolution &&
        !isInactiveLawInfo
      ) {
        resolutionChanges.push(
          `${rowDef.obligation}: ${resolutionLabel(resolution)}`
        )
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

    const assetsAddedLabels: string[] = []
    const assetsUpdatedLabels: string[] = []
    const assetsRemovedLabels: string[] = []

    if (canEditContent) {
      const currentUserId = user.id ?? null

      const existingAssets = await prisma.exitChecklistAsset.findMany({
        where: {
          checklistId: checklist.id,
        },
      })

      const existingById = new Map(
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

          const canTouchAsset =
            canAdmin || existing.createdById === currentUserId

          if (!canTouchAsset) continue

          if (
            existing.subject !== subject ||
            existing.inventoryNumber !== inventoryNumber
          ) {
            assetsUpdatedLabels.push(assetLabel(subject, inventoryNumber))
          }

          await prisma.exitChecklistAsset.update({
            where: {
              id: numericId,
            },
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
            createdById: currentUserId,
          },
        })
        assetsAddedLabels.push(assetLabel(subject, inventoryNumber))
      }

      const deletableAssets = existingAssets.filter(
        (asset) =>
          !seenExistingIds.has(asset.id) &&
          (canAdmin || asset.createdById === currentUserId)
      )

      if (deletableAssets.length > 0) {
        await prisma.exitChecklistAsset.deleteMany({
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

    const header = buildHeaderFromOff(checklist.offboarding)
    const existingCompletionMetadata =
      getExistingCompletionMetadata(currentHeader)

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
        nextHandoverManagerSignature
      ),
      handover,
      signatures: sanitizeSignaturesForJson(nextSignatures),
      ...existingCompletionMetadata,
      ...getExistingSignatureRecipientsMetadata(currentHeader),
    }

    const updatedChecklist = await prisma.exitChecklist.update({
      where: {
        id: checklist.id,
      },
      data: {
        header: updatedHeader,
      },
      include: {
        items: true,
        assets: true,
        offboarding: true,
      },
    })

    const actorInfo = {
      by: user.id ?? null,
      byName: user.name ?? user.email ?? null,
      byEmail: user.email ?? null,
    }

    const headerChanges: string[] = []

    if (conflictOfInterestChanged) {
      headerChanges.push(`Střet zájmů: ${conflictOfInterest ? "ano" : "ne"}`)
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

    let data: ExitChecklistData = mapToExitChecklistData(
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
            offboardingId: checklist.offboardingId,
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
                "[EXIT-CHECKLIST PUBLIC PUT] Informační e-mail zaměstnanci se nepodařilo odeslat:",
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
            checklistUrl: `${baseUrl}/odchody/${checklist.offboardingId}/vystupni-list`,
            pdfBuffer,
            pdfFilename: pdfBuffer
              ? `Vystupni-list-${sanitizeExitChecklistFilename(data.employeeName || String(checklist.offboardingId))}.pdf`
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
            where: {
              id: checklist.id,
            },
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
            "[EXIT-CHECKLIST PUBLIC PUT] Výstupní list je dokončený, ale HR e-mail se nepodařilo odeslat:",
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
    console.error("[EXIT-CHECKLIST PUBLIC PUT] Error:", error)

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
