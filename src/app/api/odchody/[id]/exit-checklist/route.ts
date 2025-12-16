import { NextRequest, NextResponse } from "next/server"
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
} from "@/types/exit-checklist"
import { EXIT_CHECKLIST_ROWS } from "@/config/exit-checklist-rows"

import { prisma } from "@/lib/db"
import { getSession } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ChecklistWithRelations = Prisma.ExitChecklistGetPayload<{
  include: {
    items: true
    assets: true
  }
}>

function buildHeaderFromOff(off: EmployeeOffboarding) {
  const employeeName = [off.titleBefore, off.name, off.surname, off.titleAfter]
    .filter(Boolean)
    .join(" ")

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

function mapToExitChecklistData(
  off: EmployeeOffboarding,
  checklist: ChecklistWithRelations
): ExitChecklistData {
  const header = buildHeaderFromOff(off)

  const items: ExitChecklistItem[] = EXIT_CHECKLIST_ROWS.map((row) => {
    const dbItem = checklist.items.find(
      (i: ExitChecklistItemModel) => i.key === row.key
    )

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
    })
  )

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
  }
}

async function getOrCreateChecklist(offboardingId: number): Promise<{
  off: EmployeeOffboarding
  checklist: ChecklistWithRelations
} | null> {
  const off = await prisma.employeeOffboarding.findUnique({
    where: { id: offboardingId },
    include: {
      exitChecklist: {
        include: {
          items: true,
          assets: true,
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
        header,
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
      include: { items: true, assets: true },
    })

    return { off, checklist: created }
  }

  return {
    off,
    checklist: off.exitChecklist as ChecklistWithRelations,
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const offboardingId = Number(params.id)
  if (Number.isNaN(offboardingId)) {
    return NextResponse.json(
      { status: "error", message: "Neplatné ID odchodu" },
      { status: 400 }
    )
  }

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
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const offboardingId = Number(params.id)
  if (Number.isNaN(offboardingId)) {
    return NextResponse.json(
      { status: "error", message: "Neplatné ID odchodu" },
      { status: 400 }
    )
  }

  const session = await getSession()
  const user = session?.user

  const body = await req.json().catch(() => null)

  if (!body) {
    return NextResponse.json(
      { status: "error", message: "Chybí tělo požadavku." },
      { status: 400 }
    )
  }

  const lock: boolean = Boolean(body.lock)
  const items = (
    Array.isArray(body.items) ? body.items : []
  ) as ExitChecklistItem[]
  const assets = (
    Array.isArray(body.assets) ? body.assets : []
  ) as ExitAssetItem[]

  const result = await getOrCreateChecklist(offboardingId)
  if (!result) {
    return NextResponse.json(
      { status: "error", message: "Odchod nenalezen." },
      { status: 404 }
    )
  }

  const { off, checklist } = result

  const header = buildHeaderFromOff(off)

  for (let index = 0; index < EXIT_CHECKLIST_ROWS.length; index++) {
    const rowDef = EXIT_CHECKLIST_ROWS[index]
    const incoming = items.find((i) => i.key === rowDef.key)

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
        signedByName: incoming?.signedByName ?? null,
        signedByEmail: incoming?.signedByEmail ?? null,
        signedAt: incoming?.signedAt ? new Date(incoming.signedAt) : null,
      },
      create: {
        checklistId: checklist.id,
        key: rowDef.key,
        department: rowDef.organization,
        label: rowDef.obligation,
        order: index,
        resolution,
        signedByName: incoming?.signedByName ?? null,
        signedByEmail: incoming?.signedByEmail ?? null,
        signedAt: incoming?.signedAt ? new Date(incoming.signedAt) : null,
      },
    })
  }

  await prisma.exitChecklistAsset.deleteMany({
    where: { checklistId: checklist.id },
  })

  if (assets.length > 0) {
    await prisma.exitChecklistAsset.createMany({
      data: assets.map((a) => ({
        checklistId: checklist.id,
        subject: String(a.subject ?? "").trim(),
        inventoryNumber: a.inventoryNumber
          ? String(a.inventoryNumber).trim()
          : null,
      })),
    })
  }

  let lockedAt = checklist.lockedAt
  let lockedById = checklist.lockedById

  if (lock && !lockedAt) {
    lockedAt = new Date()
    lockedById = user?.id ?? null
  }

  const updatedChecklist = await prisma.exitChecklist.update({
    where: { id: checklist.id },
    data: {
      header,
      lockedAt,
      lockedById,
    },
    include: { items: true, assets: true },
  })

  const data = mapToExitChecklistData(
    off,
    updatedChecklist as ChecklistWithRelations
  )

  return NextResponse.json({
    status: "success",
    data,
  })
}
