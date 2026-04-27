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
  buildHeaderFromOff,
  getChecklistByPublicToken,
  isPraha6OrKitt6,
  mapToExitChecklistData,
  sanitizeHandoverForJson,
  sanitizeIsoDate,
  sanitizeSignaturesForJson,
  sanitizeText,
} from "@/lib/exit-checklist"
import { hasPerm } from "@/lib/rbac"
import { getSession } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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
  currentUserEmail: string,
  canAdmin: boolean
) {
  if (!existing.signedAt) return true
  if (canAdmin) return true
  return existing.signedByEmail === currentUserEmail
}

function normalizeSignatureValue(
  incoming: ExitChecklistSignatureValue | undefined,
  existing: ExitChecklistSignatureValue,
  currentUserEmail: string,
  canAdmin: boolean
): ExitChecklistSignatureValue {
  const existingIsSigned = Boolean(existing.signedAt)

  if (!existingIsSigned) {
    return {
      signedByName: sanitizeText(incoming?.signedByName) || null,
      signedByEmail: sanitizeText(incoming?.signedByEmail) || null,
      signedAt: sanitizeText(incoming?.signedAt) || null,
    }
  }

  const canTouch =
    canAdmin || (existing.signedByEmail && existing.signedByEmail === currentUserEmail)

  if (!canTouch) {
    return existing
  }

  return {
    signedByName: sanitizeText(incoming?.signedByName) || null,
    signedByEmail: sanitizeText(incoming?.signedByEmail) || null,
    signedAt: sanitizeText(incoming?.signedAt) || null,
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
  const canSign = hasPerm(role, "EXIT_CHECKLIST_SIGN")
  const canAdmin = hasPerm(role, "EXIT_CHECKLIST_ADMIN")

  if (!canSign) {
    return NextResponse.json(
      { status: "error", message: "Nemáte oprávnění upravovat výstupní list." },
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

  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json(
      { status: "error", message: "Chybí tělo požadavku." },
      { status: 400 }
    )
  }

  const items = (Array.isArray(body.items) ? body.items : []) as ExitChecklistItem[]
  const assets = (Array.isArray(body.assets) ? body.assets : []) as ExitAssetItem[]
  const handover = sanitizeHandoverForJson(body.handover)
  const incomingSignatures = (body.signatures ?? {}) as ExitChecklistSignatures

  const currentHeader =
    checklist.header && typeof checklist.header === "object"
      ? (checklist.header as Record<string, unknown>)
      : {}

  const currentSignaturesRaw =
    currentHeader.signatures && typeof currentHeader.signatures === "object"
      ? (currentHeader.signatures as Record<string, unknown>)
      : {}

  const currentSignatures: ExitChecklistSignatures = {
    employee: {
      signedByName:
        sanitizeText((currentSignaturesRaw.employee as Record<string, unknown>)?.signedByName) || null,
      signedByEmail:
        sanitizeText((currentSignaturesRaw.employee as Record<string, unknown>)?.signedByEmail) || null,
      signedAt:
        sanitizeText((currentSignaturesRaw.employee as Record<string, unknown>)?.signedAt) || null,
    },
    manager: {
      signedByName:
        sanitizeText((currentSignaturesRaw.manager as Record<string, unknown>)?.signedByName) || null,
      signedByEmail:
        sanitizeText((currentSignaturesRaw.manager as Record<string, unknown>)?.signedByEmail) || null,
      signedAt:
        sanitizeText((currentSignaturesRaw.manager as Record<string, unknown>)?.signedAt) || null,
    },
    issuer: {
      signedByName:
        sanitizeText((currentSignaturesRaw.issuer as Record<string, unknown>)?.signedByName) || null,
      signedByEmail:
        sanitizeText((currentSignaturesRaw.issuer as Record<string, unknown>)?.signedByEmail) || null,
      signedAt:
        sanitizeText((currentSignaturesRaw.issuer as Record<string, unknown>)?.signedAt) || null,
    },
    issuedDate: sanitizeIsoDate(currentSignaturesRaw.issuedDate),
  }

  const nextSignatures: ExitChecklistSignatures = {
    employee: normalizeSignatureValue(
      incomingSignatures.employee,
      currentSignatures.employee,
      user.email,
      canAdmin
    ),
    manager: normalizeSignatureValue(
      incomingSignatures.manager,
      currentSignatures.manager,
      user.email,
      canAdmin
    ),
    issuer: normalizeSignatureValue(
      incomingSignatures.issuer,
      currentSignatures.issuer,
      user.email,
      canAdmin
    ),
    issuedDate: sanitizeIsoDate(incomingSignatures.issuedDate),
  }

  try {
    for (let index = 0; index < EXIT_CHECKLIST_ROWS.length; index++) {
      const rowDef = EXIT_CHECKLIST_ROWS[index]
      const incoming = items.find((i) => i.key === rowDef.key)
      const existing = checklist.items.find((i) => i.key === rowDef.key)

      const resolution = toResolution(incoming?.resolved ?? null)

      const safeSignedByName =
        canOverwriteSignature(
          {
            signedByEmail: existing?.signedByEmail ?? null,
            signedAt: existing?.signedAt ?? null,
          },
          user.email,
          canAdmin
        )
          ? sanitizeText(incoming?.signedByName) || null
          : existing?.signedByName ?? null

      const safeSignedByEmail =
        canOverwriteSignature(
          {
            signedByEmail: existing?.signedByEmail ?? null,
            signedAt: existing?.signedAt ?? null,
          },
          user.email,
          canAdmin
        )
          ? sanitizeText(incoming?.signedByEmail) || null
          : existing?.signedByEmail ?? null

      const safeSignedAt =
        canOverwriteSignature(
          {
            signedByEmail: existing?.signedByEmail ?? null,
            signedAt: existing?.signedAt ?? null,
          },
          user.email,
          canAdmin
        )
          ? incoming?.signedAt
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
          signedByName: safeSignedByName,
          signedByEmail: safeSignedByEmail,
          signedAt: safeSignedAt,
        },
        create: {
          checklistId: checklist.id,
          key: rowDef.key,
          department: rowDef.organization,
          label: rowDef.obligation,
          order: index,
          resolution,
          signedByName: safeSignedByName,
          signedByEmail: safeSignedByEmail,
          signedAt: safeSignedAt,
        },
      })
    }

    await prisma.exitChecklistAsset.deleteMany({
      where: { checklistId: checklist.id },
    })

    for (const asset of assets) {
      const subject = sanitizeText(asset.subject)
      const inventoryNumber = sanitizeText(asset.inventoryNumber) || null

      if (!subject && !inventoryNumber) continue

      await prisma.exitChecklistAsset.create({
        data: {
          checklistId: checklist.id,
          subject,
          inventoryNumber,
          createdById: user.id ?? null,
        },
      })
    }

    const header = buildHeaderFromOff(checklist.offboarding)

    const updatedHeader: Prisma.InputJsonObject = {
      employeeName: header.employeeName,
      personalNumber: header.personalNumber,
      department: header.department,
      unitName: header.unitName,
      employmentEndDate: header.employmentEndDate,
      handover,
      signatures: sanitizeSignaturesForJson(nextSignatures),
    }

    const updatedChecklist = await prisma.exitChecklist.update({
      where: { id: checklist.id },
      data: {
        header: updatedHeader,
      },
      include: {
        items: true,
        assets: true,
        offboarding: true,
      },
    })

    const data: ExitChecklistData = mapToExitChecklistData(
      updatedChecklist.offboarding,
      updatedChecklist
    )

    return NextResponse.json({
      status: "success",
      data,
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
