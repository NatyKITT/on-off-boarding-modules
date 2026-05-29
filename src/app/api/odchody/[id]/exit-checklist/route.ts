import { NextRequest, NextResponse } from "next/server"
import {
  ChecklistResolution,
  Prisma,
  type ExitChecklistAsset as ExitChecklistAssetModel,
} from "@prisma/client"

import type { ExitAssetItem, ExitChecklistItem } from "@/types/exit-checklist"
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
  sanitizeSignaturesForJson,
  sanitizeSignatureValueForJson,
  sanitizeText,
} from "@/lib/exit-checklist"
import { getExitChecklistCompletionState } from "@/lib/exit-checklist-copletion"
import { canAccessInternalApp, hasPerm } from "@/lib/rbac"
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
  const canRead =
    canAccessInternalApp(role) &&
    (hasPerm(role, "EXIT_CHECKLIST_READ") ||
      hasPerm(role, "EXIT_CHECKLIST_SIGN") ||
      hasPerm(role, "EXIT_CHECKLIST_ADMIN"))

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

  const canAdmin = hasPerm(userRole, "EXIT_CHECKLIST_ADMIN")
  const canSign = hasPerm(userRole, "EXIT_CHECKLIST_SIGN")

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
        where: {
          id: checklist.id,
        },
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

    const incomingHandover =
      sanitizeHandoverForJson(bodyRecord.handover) ??
      sanitizeHandoverForJson(currentHandover)

    const handover = preserveHandoverSendMetadata(
      incomingHandover,
      currentHandover
    )

    const signatures = sanitizeSignaturesForJson(bodyRecord.signatures)
    const header = buildHeaderFromOff(off)
    const existingCompletionMetadata =
      getExistingCompletionMetadata(currentHeader)

    const updatedHeader: Prisma.InputJsonObject = {
      employeeName: header.employeeName,
      personalNumber: header.personalNumber,
      department: header.department,
      unitName: header.unitName,
      employmentEndDate: header.employmentEndDate,
      managerEmail: sanitizeText(bodyRecord.managerEmail) || null,
      managerName: sanitizeText(bodyRecord.managerName) || null,
      conflictOfInterest: Boolean(bodyRecord.conflictOfInterest),
      handoverManagerSignature: sanitizeSignatureValueForJson(
        bodyRecord.handoverManagerSignature
      ),
      handover,
      signatures,
      ...existingCompletionMetadata,
    }

    for (let index = 0; index < EXIT_CHECKLIST_ROWS.length; index++) {
      const rowDef = EXIT_CHECKLIST_ROWS[index]
      const incoming = items.find((item) => item.key === rowDef.key)

      let resolution: ChecklistResolution = ChecklistResolution.NOT_APPLICABLE

      if (incoming?.resolved === "YES") {
        resolution = ChecklistResolution.YES
      } else if (incoming?.resolved === "NO") {
        resolution = ChecklistResolution.NO
      }

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
          signedByName: sanitizeText(incoming?.signedByName) || null,
          signedByEmail: sanitizeText(incoming?.signedByEmail) || null,
          signedAt: incoming?.signedAt ? new Date(incoming.signedAt) : null,
        },
        create: {
          checklistId: checklist.id,
          key: rowDef.key,
          department: rowDef.organization,
          label: rowDef.obligation,
          order: index,
          resolution,
          signedByName: sanitizeText(incoming?.signedByName) || null,
          signedByEmail: sanitizeText(incoming?.signedByEmail) || null,
          signedAt: incoming?.signedAt ? new Date(incoming.signedAt) : null,
        },
      })
    }

    const existingAssets = await prisma.exitChecklistAsset.findMany({
      where: {
        checklistId: checklist.id,
      },
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

        const isOwner = Boolean(userId && existing.createdById === userId)

        if (!canAdmin && !isOwner) continue

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
          createdById: userId,
        },
      })
    }

    const deletableIds = existingAssets
      .filter((asset) => {
        if (seenExistingIds.has(asset.id)) return false

        const isOwner = Boolean(userId && asset.createdById === userId)

        return canAdmin || isOwner
      })
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

    let nextLockedAt: Date | null = checklist.lockedAt ?? null
    let nextLockedById: string | null = checklist.lockedById ?? null

    if (lock && !nextLockedAt) {
      nextLockedAt = new Date()
      nextLockedById = userId
    }

    const updatedChecklist = await prisma.exitChecklist.update({
      where: {
        id: checklist.id,
      },
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
