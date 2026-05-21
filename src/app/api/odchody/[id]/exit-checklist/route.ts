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
  buildHeaderFromOff,
  getOrCreateChecklist,
  mapToExitChecklistData,
  preserveHandoverSendMetadata,
  sanitizeHandoverForJson,
  sanitizeSignaturesForJson,
  sanitizeSignatureValueForJson,
  sanitizeText,
} from "@/lib/exit-checklist"
import { hasPerm } from "@/lib/rbac"
import { getSession } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

function getJsonRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
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
    hasPerm(role, "EXIT_CHECKLIST_READ") ||
    hasPerm(role, "EXIT_CHECKLIST_SIGN") ||
    hasPerm(role, "EXIT_CHECKLIST_ADMIN")

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

  const lock = Boolean((body as { lock?: unknown }).lock)

  if (lock && !canAdmin) {
    return NextResponse.json(
      { status: "error", message: "Nemáte oprávnění uzamknout formulář." },
      { status: 403 }
    )
  }

  const bodyRecord = body as Record<string, unknown>

  const items = (
    Array.isArray(bodyRecord.items) ? bodyRecord.items : []
  ) as ExitChecklistItem[]

  const assets = (
    Array.isArray(bodyRecord.assets) ? bodyRecord.assets : []
  ) as ExitAssetItem[]

  try {
    const result = await getOrCreateChecklist(offboardingId)

    if (!result) {
      return NextResponse.json(
        { status: "error", message: "Odchod nenalezen." },
        { status: 404 }
      )
    }

    const { off, checklist } = result

    const currentHeader = getJsonRecord(checklist.header)
    const currentHandover = currentHeader.handover
    const handover = preserveHandoverSendMetadata(
      sanitizeHandoverForJson(bodyRecord.handover),
      currentHandover
    )

    const signatures = sanitizeSignaturesForJson(bodyRecord.signatures)

    const header = buildHeaderFromOff(off)

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

    let lockedAt = checklist.lockedAt
    let lockedById = checklist.lockedById

    if (lock && !lockedAt) {
      lockedAt = new Date()
      lockedById = userId
    }

    const updatedChecklist = await prisma.exitChecklist.update({
      where: {
        id: checklist.id,
      },
      data: {
        header: updatedHeader,
        lockedAt,
        lockedById,
      },
      include: {
        items: true,
        assets: true,
        offboarding: true,
      },
    })

    const data = mapToExitChecklistData(off, updatedChecklist)

    return NextResponse.json({
      status: "success",
      data,
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
